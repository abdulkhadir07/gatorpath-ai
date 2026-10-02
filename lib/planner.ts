import { catalog, dependentsOf, getCourse } from "./catalog";
import type { Plan, PlannedTerm, Student, Term, WhatIfResult } from "./types";

const MAX_TERMS = 16;

/** Courses the student still has to schedule: required + chosen electives, minus done/in progress. */
export function remainingCourses(student: Student): string[] {
  const done = new Set([...student.completed, ...student.inProgress]);
  const wanted = [...catalog.degree.requiredCourses, ...student.electiveChoices];
  return [...new Set(wanted)].filter((c) => !done.has(c));
}

/** Length of the longest prerequisite chain that starts at each course, within `codes`. */
function chainDepths(codes: string[]): Record<string, number> {
  const set = new Set(codes);
  const dependents: Record<string, string[]> = {};
  for (const code of codes) {
    const course = getCourse(code);
    // Co-requisites (e.g. a lecture and its lab) point at each other, so they aren't chain edges.
    const concurrent = new Set(course.concurrentOk ?? []);
    for (const group of course.prereqs) {
      for (const p of group) if (set.has(p) && !concurrent.has(p)) (dependents[p] ??= []).push(code);
    }
  }
  const memo: Record<string, number> = {};
  const depth = (c: string): number =>
    (memo[c] ??= 1 + Math.max(0, ...(dependents[c] ?? []).map(depth)));
  return Object.fromEntries(codes.map((c) => [c, depth(c)]));
}

function prereqsMet(code: string, before: Set<string>, sameTerm: Set<string>): boolean {
  const course = getCourse(code);
  const concurrent = new Set(course.concurrentOk ?? []);
  return course.prereqs.every((group) =>
    group.some((alt) => before.has(alt) || (concurrent.has(alt) && sameTerm.has(alt))),
  );
}

/**
 * Deterministic semester planner. Fills each term up to the unit cap, taking courses that
 * unlock the longest prerequisite chains first. Pinned courses are never placed before their pin.
 */
export function buildPlan(student: Student): Plan {
  const remaining = remainingCourses(student);
  const depth = chainDepths(remaining);
  const order = [...remaining].sort(
    (a, b) => depth[b] - depth[a] || getCourse(a).kind.localeCompare(getCourse(b).kind) || a.localeCompare(b),
  );

  const satisfied = new Set([...student.completed, ...student.inProgress]);
  const left = new Set(remaining);
  const placement: Record<string, Term> = {};
  const terms: PlannedTerm[] = [];
  const warnings: string[] = [];

  for (let t = student.currentTerm + 1; left.size > 0 && t <= student.currentTerm + MAX_TERMS; t++) {
    const thisTerm = new Set<string>();
    let units = 0;
    const pinnedHere = order.filter((c) => left.has(c) && student.pins[c] === t);
    const candidates = [...pinnedHere, ...order.filter((c) => !pinnedHere.includes(c))];

    let progress = true;
    while (progress) {
      progress = false;
      for (const code of candidates) {
        if (!left.has(code) || thisTerm.has(code)) continue;
        const pin = student.pins[code];
        if (pin !== undefined && pin > t) continue;

        const partners = (getCourse(code).concurrentOk ?? []).filter((p) => left.has(p) && !thisTerm.has(p));
        const bundle = [code, ...partners];
        const bundleUnits = bundle.reduce((s, c) => s + getCourse(c).units, 0);
        const isPinned = pin === t;
        if (!isPinned && units + bundleUnits > student.maxUnitsPerTerm) continue;

        const sameTerm = new Set([...thisTerm, ...bundle]);
        if (!bundle.every((c) => prereqsMet(c, satisfied, sameTerm))) continue;

        for (const c of bundle) {
          thisTerm.add(c);
          left.delete(c);
          placement[c] = t;
        }
        units += bundleUnits;
        progress = true;
      }
    }

    for (const c of pinnedHere) {
      if (left.has(c)) warnings.push(`${c} can't be taken in the chosen term because a prerequisite isn't done yet.`);
    }
    for (const c of thisTerm) satisfied.add(c);
    terms.push({ term: t, courses: order.filter((c) => thisTerm.has(c)), units });
  }

  while (terms.length > 0 && terms[terms.length - 1].courses.length === 0) terms.pop();
  const unscheduled = [...left];
  if (unscheduled.length > 0) warnings.push(`Could not schedule: ${unscheduled.join(", ")}.`);

  return {
    terms,
    placement,
    graduationTerm: terms.length > 0 ? terms[terms.length - 1].term : student.currentTerm,
    unscheduled,
    warnings,
  };
}

/** Every course that (transitively) needs `code` as a prerequisite. */
export function downstreamOf(code: string): Set<string> {
  const out = new Set<string>();
  const visit = (c: string) => {
    for (const d of dependentsOf(c)) {
      if (!out.has(d) && !(getCourse(d).concurrentOk ?? []).includes(c)) {
        out.add(d);
        visit(d);
      }
    }
  };
  visit(code);
  return out;
}

export function whatIf(student: Student, code: string, toTerm: Term): WhatIfResult {
  const before = buildPlan(student);
  const after = buildPlan({ ...student, pins: { ...student.pins, [code]: toTerm } });
  const downstream = downstreamOf(code);
  const delayed = Object.entries(after.placement)
    .filter(([c, t]) => c !== code && before.placement[c] !== undefined && t > before.placement[c])
    .map(([c, t]) => ({
      code: c,
      from: before.placement[c],
      to: t,
      reason: downstream.has(c) ? ("prerequisite" as const) : ("capacity" as const),
    }))
    .sort((a, b) => a.to - b.to || a.code.localeCompare(b.code));
  return {
    moved: code,
    toTerm,
    before,
    after,
    delayed,
    graduationBefore: before.graduationTerm,
    graduationAfter: after.graduationTerm,
  };
}

export interface Bottleneck {
  code: string;
  term: Term;
  delayed: string[];
  graduationAfter: Term;
}

/** Courses where slipping one semester pushes graduation back through the prerequisite chain. */
export function findBottlenecks(student: Student): Bottleneck[] {
  const plan = buildPlan(student);
  return Object.entries(plan.placement)
    .map(([code, t]) => {
      const r = whatIf(student, code, t + 1);
      const delayed = r.delayed.filter((d) => d.reason === "prerequisite").map((d) => d.code);
      return { code, term: t, delayed, graduationAfter: r.graduationAfter };
    })
    .filter((b) => b.graduationAfter > plan.graduationTerm && b.delayed.length > 0)
    .sort((a, b) => a.term - b.term || b.delayed.length - a.delayed.length);
}

export function degreeProgress(student: Student): { doneUnits: number; totalUnits: number; percent: number } {
  const counted = new Set([...catalog.degree.requiredCourses, ...student.electiveChoices]);
  const doneUnits = student.completed.filter((c) => counted.has(c)).reduce((s, c) => s + getCourse(c).units, 0);
  const totalUnits = catalog.degree.totalMajorUnits;
  return { doneUnits, totalUnits, percent: Math.round((doneUnits / totalUnits) * 100) };
}
