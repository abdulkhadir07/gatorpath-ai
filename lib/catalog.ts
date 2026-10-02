import raw from "@/data/courses.json";
import type { Catalog, Course } from "./types";

export const catalog = raw as Catalog;

export const courseByCode: Record<string, Course> = Object.fromEntries(
  catalog.courses.map((c) => [c.code, c]),
);

export const electiveCourses = catalog.courses.filter((c) => c.kind === "elective");

export function getCourse(code: string): Course {
  const c = courseByCode[code];
  if (!c) throw new Error(`Unknown course ${code}`);
  return c;
}

/** Courses that list `code` anywhere in their prerequisites. */
export function dependentsOf(code: string, courses: Course[] = catalog.courses): string[] {
  return courses.filter((c) => c.prereqs.some((g) => g.includes(code))).map((c) => c.code);
}
