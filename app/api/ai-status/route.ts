import { aiStatus } from "@/lib/llm";

/** Open /api/ai-status in a browser to check the AI connection. Never returns the key. */
export async function GET() {
  return Response.json(await aiStatus());
}
