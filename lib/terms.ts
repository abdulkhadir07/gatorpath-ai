import type { Term } from "./types";

export function term(season: "Spring" | "Fall", year: number): Term {
  return year * 2 + (season === "Fall" ? 1 : 0);
}

export function termLabel(t: Term): string {
  const year = Math.floor(t / 2);
  return `${t % 2 === 1 ? "Fall" : "Spring"} ${year}`;
}

/** Number of fall/spring semesters between two terms, as plain words. */
export function semesterDelta(from: Term, to: Term): string {
  const n = to - from;
  if (n === 0) return "no change";
  const word = Math.abs(n) === 1 ? "semester" : "semesters";
  return n > 0 ? `${n} ${word} later` : `${-n} ${word} earlier`;
}
