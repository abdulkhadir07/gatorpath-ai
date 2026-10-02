/**
 * Minimal provider-agnostic LLM call over plain fetch. Picks the provider from AI_PROVIDER,
 * or from whichever API key is set. Returns null when no key is configured or the call fails,
 * so every caller must have a deterministic fallback.
 */
type Provider = "gemini" | "openai" | "anthropic";

/** Read a key, tolerating stray spaces or quotes pasted into .env.local. */
function key(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

function pickProvider(): Provider | null {
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  if (forced) return forced;
  if (key("GEMINI_API_KEY")) return "gemini";
  if (key("OPENAI_API_KEY")) return "openai";
  if (key("ANTHROPIC_API_KEY")) return "anthropic";
  return null;
}

export function aiConfigured(): boolean {
  return pickProvider() !== null;
}

export interface Completion {
  text: string | null;
  /** Short human-readable reason when the AI call failed or no key is set. */
  error?: string;
}

export async function complete(system: string, user: string, opts: { json?: boolean } = {}): Promise<Completion> {
  const provider = pickProvider();
  if (!provider) return { text: null, error: "No AI key found in .env.local" };
  try {
    const text = (await callProvider(provider, system, user, opts.json ?? false))?.trim();
    return text ? { text } : { text: null, error: `${provider} returned an empty answer` };
  } catch (err) {
    console.error(`[llm] ${provider} call failed:`, err);
    return { text: null, error: shortError(err) };
  }
}

/** Turn a provider error into one readable line for the UI. */
function shortError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const match = raw.match(/"message":\s*"([^"]+)"/);
  return (match ? match[1] : raw).slice(0, 200);
}

async function callProvider(provider: Provider, system: string, user: string, json: boolean): Promise<string | null> {
  const signal = AbortSignal.timeout(45_000);

  if (provider === "gemini") return gemini(system, user, json, signal);

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key("OPENAI_API_KEY")}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": key("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: json ? `${system}\nRespond with JSON only, no prose and no code fences.` : system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content?.map((b: { text?: string }) => b.text ?? "").join("") ?? null;
}

/** Models to try in order. The first one that answers is remembered for later calls. */
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
let workingGemini: { model: string; api: "generateContent" | "interactions" } | null = null;

/** A key Google rejects outright. Retrying other models can't help. */
class AuthError extends Error {}

let lastGeminiAttempts: string[] = [];

function isUnauthenticated(err: unknown): boolean {
  return err instanceof Error && /^401 /.test(err.message);
}

async function gemini(system: string, user: string, json: boolean, signal: AbortSignal): Promise<string | null> {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const models = [...new Set([preferred, ...GEMINI_MODELS].filter((m): m is string => !!m))];
  const attempts = workingGemini
    ? [workingGemini]
    : [
        // generateContent works with AI Studio keys; the Interactions API is only a backup.
        ...models.map((model) => ({ model, api: "generateContent" as const })),
        ...models.map((model) => ({ model, api: "interactions" as const })),
      ];

  lastGeminiAttempts = [];
  let firstUsefulError: unknown = null;
  for (const attempt of attempts) {
    try {
      const text =
        attempt.api === "generateContent"
          ? await geminiGenerateContent(attempt.model, system, user, json, signal)
          : await geminiInteractions(attempt.model, system, user, json, signal);
      if (text) {
        if (!workingGemini) console.log(`[llm] using Gemini ${attempt.model} via ${attempt.api}`);
        workingGemini = attempt;
        return text;
      }
    } catch (err) {
      lastGeminiAttempts.push(`${attempt.model} via ${attempt.api}: ${shortError(err)}`);
      if (err instanceof AuthError) throw err; // a bad key won't work with any model
      // Prefer reporting a model/endpoint error over a 401 from the backup endpoint.
      if (!firstUsefulError || isUnauthenticated(firstUsefulError)) firstUsefulError = err;
    }
  }
  workingGemini = null;
  throw firstUsefulError ?? new Error("No Gemini model returned text");
}

async function geminiFetch(path: string, body: unknown, signal: AbortSignal) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key("GEMINI_API_KEY") },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    // Only an invalid key is fatal. A 401 can come from an endpoint that doesn't accept API keys.
    const Err = /API_KEY_INVALID/.test(text) ? AuthError : Error;
    throw new Err(`${res.status} ${text}`);
  }
  return res.json();
}

async function geminiGenerateContent(model: string, system: string, user: string, json: boolean, signal: AbortSignal) {
  const data = await geminiFetch(
    `models/${model}:generateContent`,
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: json ? { responseMimeType: "application/json" } : {},
    },
    signal,
  );
  const parts: { text?: string; thought?: boolean }[] = data.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("") || null;
}

async function geminiInteractions(model: string, system: string, user: string, json: boolean, signal: AbortSignal) {
  const instructions = json ? `${system}\nRespond with JSON only, no prose and no code fences.` : system;
  const data = await geminiFetch("interactions", { model, input: `${instructions}\n\n---\n\n${user}` }, signal);
  const texts: string[] = [];
  for (const step of data.steps ?? []) {
    if (step.type && step.type !== "model_output") continue;
    for (const c of step.content ?? []) if (c.type === "text" && c.text) texts.push(c.text);
  }
  return texts.join("") || data.output_text || null;
}

/** One tiny live call, for the /api/ai-status check. */
export async function aiStatus() {
  const provider = pickProvider();
  const r = await complete("Reply with exactly: OK", "Say OK");
  return {
    provider,
    model: provider === "gemini" ? workingGemini?.model ?? null : null,
    api: provider === "gemini" ? workingGemini?.api ?? null : null,
    working: !!r.text,
    reply: r.text,
    error: r.error ?? null,
    attempts: provider === "gemini" ? lastGeminiAttempts : [],
  };
}

/** Parse JSON from a model reply, tolerating stray code fences. */
export function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
