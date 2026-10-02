export type CourseKind = "support" | "core" | "advanced" | "elective";

export interface Course {
  code: string;
  title: string;
  units: number;
  kind: CourseKind;
  /** AND of OR-groups: every group needs at least one course from it. */
  prereqs: string[][];
  /** Prereqs that may be taken in the same term as this course. */
  concurrentOk?: string[];
  note?: string;
  tags?: string[];
}

export interface Catalog {
  source: string;
  modelingNotes: string[];
  degree: {
    major: string;
    totalMajorUnits: number;
    requiredCourses: string[];
    electives: { count: number; unitsEach: number; rule: string };
  };
  courses: Course[];
}

/** Terms are integers so they sort and compare: year * 2 + (Fall ? 1 : 0). */
export type Term = number;

export interface Student {
  name: string;
  major: string;
  careerGoal: string;
  completed: string[];
  inProgress: string[];
  /** The term the student is taking `inProgress` courses in. */
  currentTerm: Term;
  electiveChoices: string[];
  /** Max major units per term (GE and other units are planned outside GatorPath). */
  maxUnitsPerTerm: number;
  /** Courses the student has forced into a specific term. */
  pins: Record<string, Term>;
}

export interface PlannedTerm {
  term: Term;
  courses: string[];
  units: number;
}

export interface Plan {
  terms: PlannedTerm[];
  /** Term each remaining course lands in. */
  placement: Record<string, Term>;
  graduationTerm: Term;
  unscheduled: string[];
  warnings: string[];
}

export interface CourseShift {
  code: string;
  from: Term;
  to: Term;
  /** "prerequisite": it depends on the moved course. "capacity": bumped by the unit cap. */
  reason: "prerequisite" | "capacity";
}

export interface WhatIfResult {
  moved: string;
  toTerm: Term;
  before: Plan;
  after: Plan;
  /** Courses (other than the moved one) that land later than before. */
  delayed: CourseShift[];
  graduationBefore: Term;
  graduationAfter: Term;
}
