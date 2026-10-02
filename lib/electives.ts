import { catalog, electiveCourses, getCourse } from "./catalog";
import { complete, parseJson } from "./llm";
import { buildPlan } from "./planner";
import type { Course, Student } from "./types";

export interface ElectivePick {
  code: string;
  title: string;
  reason: string;
}

export interface ElectiveResult {
  picks: ElectivePick[];
  source: "ai" | "offline";
  /** Codes the model suggested that the engine refused (not real or not eligible). */
  rejected: string[];
  aiError?: string;
  /** True when the picks keep the current graduation term. */
  keepsGraduation: boolean;
}

/** Electives the student hasn't taken and that exist in the verified catalog. */
export function eligibleElectives(student: Student): Course[] {
  const done = new Set([...student.completed, ...student.inProgress]);
  return electiveCourses.filter((c) => !done.has(c.code));
}

const SYNONYMS: Record<string, string[]> = {
  security: ["security", "cyber", "hacker", "pentest", "privacy", "infosec"],
  ai: ["ai", "artificial", "intelligence", "ml", "machine", "learning", "llm", "deep", "neural"],
  ml: ["ml", "machine", "learning", "data", "scientist", "deep"],
  web: ["web", "frontend", "front-end", "full-stack", "fullstack", "react", "website"],
  "full-stack": ["full-stack", "fullstack", "startup", "product", "web"],
  software: ["software", "engineer", "developer", "swe", "backend", "product"],
  databases: ["database", "databases", "data", "sql", "backend", "analytics"],
  systems: ["systems", "infrastructure", "cloud", "devops", "linux", "kernel"],
  networking: ["network", "networks", "networking", "cloud", "infrastructure"],
  games: ["game", "games", "gaming", "unity"],
  graphics: ["graphics", "game", "3d", "visual"],
  mobile: ["mobile", "ios", "android", "app"],
  design: ["design", "ux", "ui", "user"],
  accessibility: ["accessibility", "accessible", "inclusive"],
  startups: ["startup", "startups", "founder", "entrepreneur"],
  product: ["product", "startup", "pm"],
  devops: ["devops", "cloud", "sre", "infrastructure"],
  cloud: ["cloud", "aws", "infrastructure"],
  theory: ["theory", "research", "grad", "phd", "math"],
  quantum: ["quantum", "physics", "research"],
  nlp: ["nlp", "language", "chatbot", "llm", "text"],
  ethics: ["ethics", "responsible", "fairness", "policy"],
  data: ["data", "analytics", "scientist"],
  backend: ["backend", "server", "api"],
  hardware: ["hardware", "embedded", "iot", "robotics"],
  media: ["media", "video", "audio", "multimedia"],
};

/** Deterministic fallback: score electives by keyword overlap between the goal and course tags/titles. */
export function keywordPicks(goal: string, eligible: Course[], count: number): ElectivePick[] {
  const words = goal.toLowerCase().split(/[^a-z0-9+-]+/).filter(Boolean);
  // Short keywords must match a whole word ("ai", "ml"); longer ones may sit inside one ("cybersecurity").
  const matches = (k: string, w: string) => w === k || (k.length >= 4 && w.includes(k));
  const scored = eligible.map((c) => {
    const keys = [...(c.tags ?? []).flatMap((tag) => SYNONYMS[tag] ?? [tag]), ...c.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3)];
    const matched = (c.tags ?? []).filter((tag) => (SYNONYMS[tag] ?? [tag]).some((k) => words.some((w) => matches(k, w))));
    // Score = how many distinct goal words this course speaks to.
    const score = words.filter((w) => keys.some((k) => matches(k, w))).length;
    return { c, matched, score };
  });
  scored.sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || a.c.code.localeCompare(b.c.code));
  return scored.slice(0, count).map(({ c, matched }) => ({
    code: c.code,
    title: c.title,
    reason: matched.length
      ? `Covers ${matched.join(", ")}, which matches your goal.`
      : "General senior elective that fits your remaining schedule.",
  }));
}

const SYSTEM = `You are GatorPath, an academic planning assistant for San Francisco State University Computer Science students.
You choose senior electives for a student's career goal.
Rules:
- Only choose course codes from the ELIGIBLE list you are given. Never invent courses.
- Pick exactly the requested number of distinct courses, best fit first.
- Each reason is one short sentence linking the course content to the student's goal. No grades, no guarantees.
- Respond as JSON: {"picks":[{"code":"CSC 000","reason":"..."}]}`;

export async function recommendElectives(student: Student, goal: string): Promise<ElectiveResult> {
  const count = catalog.degree.electives.count;
  const eligible = eligibleElectives(student);
  const eligibleCodes = new Set(eligible.map((c) => c.code));
  const basePlan = buildPlan(student);

  const user = [
    `Career goal (student's own words): ${goal}`,
    `Completed courses: ${student.completed.join(", ")}`,
    `Number of electives to pick: ${count}`,
    "ELIGIBLE electives (code | title | topics):",
    ...eligible.map((c) => `${c.code} | ${c.title} | ${(c.tags ?? []).join(", ")}`),
  ].join("\n");

  const ai = await complete(SYSTEM, user, { json: true });
  const reply = ai.text;
  const parsed = reply ? parseJson<{ picks?: { code?: string; reason?: string }[] }>(reply) : null;

  let picks: ElectivePick[] = [];
  const rejected: string[] = [];
  if (parsed?.picks) {
    for (const p of parsed.picks) {
      const code = (p.code ?? "").toUpperCase().replace(/^CSC\s*/, "CSC ").trim();
      if (!eligibleCodes.has(code)) {
        if (code) rejected.push(code);
        continue;
      }
      if (picks.some((x) => x.code === code)) continue;
      picks.push({ code, title: getCourse(code).title, reason: p.reason?.trim() || "Fits your goal." });
    }
    picks = picks.slice(0, count);
  }
  const source: ElectiveResult["source"] = picks.length > 0 ? "ai" : "offline";
  if (picks.length < count) {
    const taken = new Set(picks.map((p) => p.code));
    const extra = keywordPicks(goal, eligible.filter((c) => !taken.has(c.code)), count - picks.length);
    picks = [...picks, ...extra];
  }

  const newPlan = buildPlan({ ...student, electiveChoices: picks.map((p) => p.code), pins: {} });
  return {
    picks,
    source,
    rejected,
    aiError: source === "ai" ? undefined : (ai.error ?? (reply ? "AI reply wasn't valid JSON" : undefined)),
    keepsGraduation: newPlan.graduationTerm <= basePlan.graduationTerm && newPlan.unscheduled.length === 0,
  };
}
