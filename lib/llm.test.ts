import { afterEach, beforeEach, expect, it, vi } from "vitest";

const generateContent = vi.fn();
const ctor = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(opts: unknown) {
      ctor(opts);
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  generateContent.mockReset();
  ctor.mockReset();
  vi.stubEnv("GEMINI_API_KEY", " AQ.test-key ");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => vi.unstubAllEnvs());

it("calls Gemini through the SDK with the trimmed key and default model", async () => {
  generateContent.mockResolvedValue({ text: "Hello" });
  const { complete } = await import("./llm");
  expect(await complete("sys", "hi")).toEqual({ text: "Hello" });
  expect(ctor).toHaveBeenCalledWith({ apiKey: "AQ.test-key" });
  expect(generateContent.mock.calls[0][0]).toMatchObject({
    model: "gemini-3.8-flash",
    contents: "hi",
    config: { systemInstruction: "sys" },
  });
});

it("reports the SDK's error message", async () => {
  generateContent.mockRejectedValue(new Error('{"error":{"message":"API key not valid."}}'));
  const { complete } = await import("./llm");
  const r = await complete("sys", "hi");
  expect(r.text).toBeNull();
  expect(r.error).toBe("API key not valid.");
});

it("explains a missing key", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  const { complete } = await import("./llm");
  expect((await complete("sys", "hi")).error).toMatch(/No AI key/);
});

it("reads keys with $ from .env.local untouched", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "gp-"));
  writeFileSync(join(dir, ".env.local"), "GEMINI_API_KEY=AQ.ab$cd$EF\nGEMINI_MODEL=x\n");
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.stubEnv("GEMINI_API_KEY", "AQ.ab"); // what Next.js's $-expansion leaves behind
  generateContent.mockResolvedValue({ text: "ok" });
  const { complete } = await import("./llm");
  await complete("s", "u");
  expect(ctor).toHaveBeenCalledWith({ apiKey: "AQ.ab$cd$EF" });
  cwd.mockRestore();
});
