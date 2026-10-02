import { describe, expect, it } from "vitest";
import alexJson from "@/data/alex.json";
import { buildPlan, degreeProgress, findBottlenecks, whatIf } from "./planner";
import { term, termLabel } from "./terms";
import type { Student } from "./types";

const alex = alexJson as Student;
const SPRING_27 = term("Spring", 2027);
const FALL_27 = term("Fall", 2027);

describe("buildPlan", () => {
  const plan = buildPlan(alex);

  it("schedules every remaining course and respects the unit cap", () => {
    expect(plan.unscheduled).toEqual([]);
    for (const t of plan.terms) expect(t.units).toBeLessThanOrEqual(alex.maxUnitsPerTerm);
  });

  it("never schedules a course before its prerequisites", () => {
    expect(plan.placement["CSC 415"]).toBeGreaterThan(plan.placement["CSC 340"]);
    expect(plan.placement["CSC 510"]).toBeGreaterThan(plan.placement["CSC 340"]);
    expect(plan.placement["CSC 648"]).toBeGreaterThan(plan.placement["CSC 413"]);
    expect(plan.placement["CSC 652"]).toBeGreaterThan(plan.placement["CSC 415"]);
  });

  it("puts CSC 340 first because it unlocks the longest chain", () => {
    expect(plan.placement["CSC 340"]).toBe(SPRING_27);
    expect(termLabel(plan.graduationTerm)).toBe("Spring 2028");
  });

  it("schedules co-requisite lab pairs together", () => {
    const s: Student = { ...alex, completed: ["MATH 226", "MATH 227"], inProgress: [] };
    const p = buildPlan(s);
    expect(p.placement["PHYS 220"]).toBe(p.placement["PHYS 222"]);
    expect(p.placement["PHYS 230"]).toBe(p.placement["PHYS 232"]);
  });
});

describe("whatIf", () => {
  it("moving CSC 340 to Fall 2027 delays 415, 510 and pushes graduation", () => {
    const r = whatIf(alex, "CSC 340", FALL_27);
    const delayed = r.delayed.map((d) => d.code);
    expect(delayed).toEqual(expect.arrayContaining(["CSC 415", "CSC 510", "CSC 652"]));
    expect(r.graduationAfter).toBeGreaterThan(r.graduationBefore);
  });

  it("warns when a course is pinned before its prerequisites", () => {
    const r = whatIf(alex, "CSC 415", SPRING_27);
    expect(r.after.warnings.join(" ")).toMatch(/CSC 415/);
  });
});

it("finds CSC 340 as a bottleneck", () => {
  expect(findBottlenecks(alex).map((b) => b.code)).toContain("CSC 340");
});

it("computes degree progress from completed units", () => {
  expect(degreeProgress(alex).doneUnits).toBe(28);
});

it("labels why each course moved", () => {
  const r = whatIf(alex, "CSC 340", FALL_27);
  expect(r.delayed.find((d) => d.code === "CSC 415")?.reason).toBe("prerequisite");
  expect(findBottlenecks(alex).map((b) => b.code)).not.toContain("CSC 300GW");
});
