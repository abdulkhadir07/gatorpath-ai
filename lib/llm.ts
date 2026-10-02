/**
 * Minimal provider-agnostic LLM call over plain fetch. Picks the provider from AI_PROVIDER,
 * or from whichever API key is set. Returns null when no key is configured or the call fails,
 * so every caller must have a deterministic fallback.
 */
type Provider = "gemini" | "openai" | "anthropic";

function pickProvider(): Provider | null {
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  if (forced) return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function aiConfigured(): boolean {
  return pickProvider() !== null;
}

export async function complete(system: string, user: string, opts: { json?: boolean } = {}): Promise<string | null> {
  const provider = pickProvider();
  if (!provider) return null;
  try {
    const text = await callProvider(provider, system, user, opts.json ?? false);
    return text?.trim() || null;
  } catch (err) {
    console.error(`[llm] ${provider} call failed:`, err);
    return null;
  }
}

async function callProvider(provider: Provider, system: string, user: string, json: boolean): Promise<string | null> {
  const signal = AbortSignal.timeout(20_000);

  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.3, ...(json ? { responseMimeType: "application/json" } : {}) },
        }),
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? null;
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
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
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
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
