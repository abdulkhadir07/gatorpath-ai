import { courseByCode } from "@/lib/catalog";
import { explainWhatIf } from "@/lib/explain";
import { whatIf } from "@/lib/planner";
import { parseStudent } from "@/lib/validate";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const student = parseStudent(body?.student);
  const code = body?.code;
  const toTerm = body?.toTerm;
  if (!student || typeof code !== "string" || !(code in courseByCode) || typeof toTerm !== "number") {
    return Response.json({ error: "Send a student, a course code and a target term." }, { status: 400 });
  }
  // Recompute the facts on the server so the model only ever sees engine output.
  const r = whatIf(student, code, toTerm);
  const explanation = await explainWhatIf({
    moved: code,
    fromTerm: r.before.placement[code] ?? toTerm,
    toTerm,
    delayed: r.delayed,
    graduationBefore: r.graduationBefore,
    graduationAfter: r.graduationAfter,
    warnings: r.after.warnings,
    careerGoal: student.careerGoal,
  });
  return Response.json(explanation);
}
