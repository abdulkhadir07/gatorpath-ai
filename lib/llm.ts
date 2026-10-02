import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

/**
 * Minimal provider-agnostic LLM call over plain fetch. Picks the provider from AI_PROVIDER,
 * or from whichever API key is set. Returns null when no key is configured or the call fails,
 * so every caller must have a deterministic fallback.
 */
type Provider = "gemini" | "openai" | "anthropic";

/**
 * Read a key. Next.js expands "$..." inside .env files, which silently corrupts keys that
 * contain a "$", so prefer the raw value from .env.local when the file exists (local dev).
 * On Vercel the variable comes from the dashboard and is used as-is.
 */
function key(name: string): string {
  return (rawEnvLocal(name) ?? process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

function rawEnvLocal(name: string): string | undefined {
  try {
    const file = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const line = file.split(/\r?\n/).find((l) => l.trim().startsWith(`${name}=`));
    return line?.slice(line.indexOf("=") + 1);
  } catch {
    return undefined;
  }
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

  if (provider === "gemini") return gemini(system, user, json);

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

/** Gemini via Google's official SDK: one model, one API, so failures are easy to read. */
async function gemini(system: string, user: string, json: boolean): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: key("GEMINI_API_KEY") });
  const response = await ai.models.generateContent({
    model: geminiModel(),
    contents: user,
    config: { systemInstruction: system, ...(json ? { responseMimeType: "application/json" } : {}) },
  });
  return response.text ?? null;
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
}

/** One tiny live call, for the /api/ai-status check. */
export async function aiStatus() {
  const provider = pickProvider();
  const r = await complete("Reply with exactly: OK", "Say OK");
  return {
    provider,
    model: provider === "gemini" ? geminiModel() : null,
    working: !!r.text,
    reply: r.text,
    error: r.error ?? null,
    // Safe to show: length and first 4 characters only, from the file and as Next.js loaded it.
    keyCheck: provider
      ? (() => {
          const name = `${provider.toUpperCase()}_API_KEY`;
          const used = key(name);
          const loaded = (process.env[name] ?? "").trim();
          return { length: used.length, starts: used.slice(0, 4), nextjsLoadedLength: loaded.length, hasDollar: used.includes("$") };
        })()
      : null,
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
