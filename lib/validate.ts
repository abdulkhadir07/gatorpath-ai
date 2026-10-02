import { courseByCode } from "./catalog";
import type { Student } from "./types";

/** Light runtime check for client-sent students: known courses only, sane numbers. */
export function parseStudent(input: unknown): Student | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Partial<Student>;
  const codes = (x: unknown) => Array.isArray(x) && x.every((c) => typeof c === "string" && c in courseByCode);
  if (!codes(s.completed) || !codes(s.inProgress) || !codes(s.electiveChoices)) return null;
  if (typeof s.currentTerm !== "number" || typeof s.maxUnitsPerTerm !== "number") return null;
  if (s.maxUnitsPerTerm < 3 || s.maxUnitsPerTerm > 24) return null;
  return {
    name: String(s.name ?? "Student").slice(0, 60),
    major: String(s.major ?? ""),
    careerGoal: String(s.careerGoal ?? "").slice(0, 300),
    completed: s.completed!,
    inProgress: s.inProgress!,
    currentTerm: s.currentTerm,
    electiveChoices: s.electiveChoices!,
    maxUnitsPerTerm: s.maxUnitsPerTerm,
    pins: typeof s.pins === "object" && s.pins ? s.pins : {},
  };
}
