import { getCourse } from "./catalog";
import { complete } from "./llm";
import { termLabel } from "./terms";
import type { CourseShift } from "./types";

export interface WhatIfFacts {
  moved: string;
  fromTerm: number;
  toTerm: number;
  delayed: CourseShift[];
  graduationBefore: number;
  graduationAfter: number;
  warnings: string[];
  careerGoal: string;
}

export interface Explanation {
  text: string;
  source: "ai" | "offline";
  aiError?: string;
}

function factSheet(f: WhatIfFacts): string {
  const lines = [
    `Change: ${f.moved} (${getCourse(f.moved).title}) moved from ${termLabel(f.fromTerm)} to ${termLabel(f.toTerm)}.`,
    `Projected graduation: ${termLabel(f.graduationBefore)} before, ${termLabel(f.graduationAfter)} after.`,
    f.delayed.length ? "Courses that now land later:" : "No other course moves later.",
    ...f.delayed.map(
      (d) =>
        `- ${d.code} (${getCourse(d.code).title}): ${termLabel(d.from)} -> ${termLabel(d.to)}; reason: ${
          d.reason === "prerequisite" ? `needs ${f.moved} directly or through a prerequisite chain` : "no room under the unit cap"
        }`,
    ),
    ...f.warnings.map((w) => `Warning: ${w}`),
    `Student career goal: ${f.careerGoal}`,
  ];
  return lines.join("\n");
}

/** Template explanation used when no AI key is set or the call fails. */
export function offlineExplanation(f: WhatIfFacts): string {
  const prereq = f.delayed.filter((d) => d.reason === "prerequisite").map((d) => d.code);
  const capacity = f.delayed.filter((d) => d.reason === "capacity").map((d) => d.code);
  const parts = [`Moving ${f.moved} to ${termLabel(f.toTerm)}`];
  if (prereq.length) parts.push(`also pushes back ${prereq.join(", ")}, because they need ${f.moved} first`);
  let text = parts.join(" ") + ".";
  if (capacity.length) text += ` ${capacity.join(", ")} also shift to stay under your unit limit.`;
  text +=
    f.graduationAfter > f.graduationBefore
      ? ` Your projected graduation moves from ${termLabel(f.graduationBefore)} to ${termLabel(f.graduationAfter)}.`
      : ` Your projected graduation stays ${termLabel(f.graduationAfter)}.`;
  if (f.graduationAfter > f.graduationBefore) text += ` Keeping ${f.moved} in its original term avoids the delay.`;
  return text;
}

const SYSTEM = `You are GatorPath, an academic planning assistant for San Francisco State University students.
You explain the effect of a schedule change in 2-3 plain sentences to the student, using "you".
Use ONLY the facts given. Do not add courses, terms, or requirements that are not in the facts.
Say why later courses moved (prerequisite chain vs. unit cap), state the graduation effect, and give one practical suggestion.
Never promise a graduation date; say "projected". No markdown.`;

export async function explainWhatIf(f: WhatIfFacts): Promise<Explanation> {
  const r = await complete(SYSTEM, factSheet(f));
  return r.text ? { text: r.text, source: "ai" } : { text: offlineExplanation(f), source: "offline", aiError: r.error };
}
