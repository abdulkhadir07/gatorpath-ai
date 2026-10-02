import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Gemini fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", " AQ.test-key ");
    vi.stubEnv("GEMINI_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("falls back to the Interactions API when generateContent is gone", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(url);
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AQ.test-key");
      if (url.includes(":generateContent")) return json(404, { error: { message: "model retired" } });
      return json(200, { steps: [{ type: "model_output", content: [{ type: "text", text: "Hello" }] }] });
    });
    const { complete } = await import("./llm");
    expect(await complete("sys", "hi")).toEqual({ text: "Hello" });
    expect(calls.some((u) => u.endsWith("/v1beta/interactions"))).toBe(true);
  });

  it("tries the next model when one is unavailable", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (url.includes("gemini-3.5-flash:generateContent"))
        return json(200, { candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "Hi" }] } }] });
      return json(404, { error: { message: `no ${body.model ?? url}` } });
    });
    const { complete } = await import("./llm");
    expect((await complete("sys", "hi")).text).toBe("Hi");
  });

  it("stops on a bad key and reports it", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return json(400, { error: { message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } });
    });
    const { complete } = await import("./llm");
    const r = await complete("sys", "hi");
    expect(r.text).toBeNull();
    expect(r.error).toMatch(/API key not valid/);
    expect(n).toBe(1);
  });

  it("explains a missing key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { complete } = await import("./llm");
    expect((await complete("sys", "hi")).error).toMatch(/No AI key/);
  });
});

describe("Gemini 401 handling", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps trying when one endpoint rejects API keys with 401", async () => {
    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", "AQ.k");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("gemini-3.8-flash:generateContent"))
        return json(401, { error: { message: "Request had invalid authentication credentials. Expected OAuth 2 access token" } });
      if (url.includes("gemini-3.5-flash:generateContent")) return json(200, { candidates: [{ content: { parts: [{ text: "Hi" }] } }] });
      return json(404, { error: { message: "not found" } });
    });
    const { complete } = await import("./llm");
    expect((await complete("sys", "hi")).text).toBe("Hi");
  });
});
