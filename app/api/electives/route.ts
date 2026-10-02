import { recommendElectives } from "@/lib/electives";
import { parseStudent } from "@/lib/validate";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const student = parseStudent(body?.student);
  const goal = typeof body?.goal === "string" ? body.goal.trim().slice(0, 300) : "";
  if (!student || !goal) return Response.json({ error: "Send a student and a goal." }, { status: 400 });
  return Response.json(await recommendElectives(student, goal));
}
