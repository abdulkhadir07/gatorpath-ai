"use client";

import { useMemo, useState } from "react";
import alexJson from "@/data/alex.json";
import { catalog, getCourse } from "@/lib/catalog";
import { buildPlan, degreeProgress, findBottlenecks, whatIf } from "@/lib/planner";
import { semesterDelta, termLabel } from "@/lib/terms";
import type { Student, Term } from "@/lib/types";
import { CareerPanel } from "./CareerPanel";
import { CourseGraph } from "./CourseGraph";

const DEMO = alexJson as Student;

export function Planner() {
  const [student, setStudent] = useState<Student>(DEMO);
  const [move, setMove] = useState<{ code: string; toTerm: Term } | null>(null);
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [explaining, setExplaining] = useState(false);

  const base = useMemo(() => buildPlan(student), [student]);
  const bottlenecks = useMemo(() => findBottlenecks(student), [student]);
  const result = useMemo(() => (move ? whatIf(student, move.code, move.toTerm) : null), [student, move]);
  const plan = result?.after ?? base;
  const progress = degreeProgress(student);
  const termOptions = Array.from({ length: 8 }, (_, i) => student.currentTerm + 1 + i);

  function tryMove(code: string, toTerm: Term) {
    setExplanation(null);
    setMove(base.placement[code] === toTerm ? null : { code, toTerm });
  }

  function keep() {
    if (!move) return;
    setStudent((s) => ({ ...s, pins: { ...s.pins, [move.code]: move.toTerm } }));
    setMove(null);
    setExplanation(null);
  }

  async function explain() {
    if (!move) return;
    setExplaining(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ student, code: move.code, toTerm: move.toTerm }),
      });
      setExplanation(await res.json());
    } catch {
      setExplanation({ text: "Couldn't reach the explanation service. The changes above are still accurate.", source: "offline" });
    } finally {
      setExplaining(false);
    }
  }

  function reset() {
    setStudent(DEMO);
    setMove(null);
    setExplanation(null);
  }

  const delayedReason = new Map(result?.delayed.map((d) => [d.code, d.reason]) ?? []);
  const gradDelta = result ? result.graduationAfter - result.graduationBefore : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#463077]">
            🐊 GatorPath <span className="text-[#c99700]">AI</span>
          </h1>
          <p className="text-sm text-gray-600">See how today&apos;s course decisions shape your path to graduation.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-[#ede7f6] px-3 py-1 font-semibold text-[#463077]">
            Demo student: {student.name} · {student.major}
          </span>
          <button onClick={reset} className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50">
            Reset demo
          </button>
        </div>
      </header>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        <Stat label="Major progress">
          <div className="text-2xl font-bold">{progress.percent}%</div>
          <div className="mt-2 h-2 rounded-full bg-gray-200" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded-full bg-[#463077]" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {progress.doneUnits} of {progress.totalUnits} major units completed
          </div>
        </Stat>
        <Stat label="Projected graduation">
          <div className={`text-2xl font-bold ${gradDelta > 0 ? "text-red-700" : ""}`}>{termLabel(plan.graduationTerm)}</div>
          {result && gradDelta !== 0 && (
            <div className="text-xs font-semibold text-red-700">
              was {termLabel(result.graduationBefore)} ({semesterDelta(result.graduationBefore, result.graduationAfter)})
            </div>
          )}
        </Stat>
        <Stat label="Graduation bottlenecks">
          <div className={`text-2xl font-bold ${bottlenecks.length ? "text-amber-700" : "text-green-700"}`}>{bottlenecks.length}</div>
          <div className="text-xs text-gray-500">courses that delay graduation if they slip</div>
        </Stat>
        <Stat label="Major units per semester">
          <select
            aria-label="Major units per semester"
            value={student.maxUnitsPerTerm}
            onChange={(e) => {
              setStudent((s) => ({ ...s, maxUnitsPerTerm: Number(e.target.value) }));
              setMove(null);
              setExplanation(null);
            }}
            className="mt-1 rounded-lg border border-gray-300 p-1 text-lg font-bold"
          >
            {[6, 9, 12, 15].map((n) => (
              <option key={n} value={n}>
                {n} units
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500">GE courses are planned separately</div>
        </Stat>
      </section>

      {/* Bottlenecks */}
      {!result && bottlenecks.length > 0 && (
        <section className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4" aria-labelledby="risk-h">
          <h2 id="risk-h" className="font-bold text-amber-900">
            🚨 {bottlenecks.length} potential graduation bottleneck{bottlenecks.length > 1 ? "s" : ""}
          </h2>
          <ul className="mt-2 space-y-2 text-sm text-amber-950">
            {bottlenecks.slice(0, 3).map((b) => (
              <li key={b.code} className="flex flex-wrap items-center gap-2">
                <span>
                  <strong>{b.code}</strong> ({termLabel(b.term)}) unlocks {b.delayed.join(", ")}. If it slips one semester, graduation moves to{" "}
                  {termLabel(b.graduationAfter)}.
                </span>
                <button onClick={() => tryMove(b.code, b.term + 1)} className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-400 hover:bg-amber-100">
                  What if I delay it?
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What-if result */}
      {result && (
        <section className="rounded-xl border-2 border-[#463077] bg-[#f7f4fc] p-4" aria-live="polite" aria-labelledby="whatif-h">
          <h2 id="whatif-h" className="font-bold text-[#463077]">
            What if {result.moved} moves to {termLabel(result.toTerm)}?
          </h2>
          {result.delayed.length === 0 ? (
            <p className="mt-1 text-sm">No other courses move. Your projected graduation stays {termLabel(result.graduationAfter)}.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {result.delayed.map((d) => (
                <li key={d.code}>
                  <span className={d.reason === "prerequisite" ? "font-semibold text-red-700" : "font-semibold text-amber-800"}>{d.code}</span>{" "}
                  {getCourse(d.code).title}: {termLabel(d.from)} → {termLabel(d.to)}{" "}
                  <span className="text-gray-500">({d.reason === "prerequisite" ? "needs " + result.moved + " first" : "no room under unit cap"})</span>
                </li>
              ))}
              <li className="pt-1 font-semibold">
                Projected graduation: {termLabel(result.graduationBefore)} → {termLabel(result.graduationAfter)}
              </li>
            </ul>
          )}
          {result.after.warnings.map((w) => (
            <p key={w} className="mt-1 text-sm text-red-700">
              ⚠️ {w}
            </p>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={explain} disabled={explaining} className="rounded-lg bg-[#463077] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {explaining ? "Explaining…" : "✨ Explain this"}
            </button>
            <button onClick={keep} className="rounded-lg border border-[#463077] px-3 py-1.5 text-sm font-semibold text-[#463077]">
              Keep this change
            </button>
            <button onClick={() => (setMove(null), setExplanation(null))} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
              Undo
            </button>
          </div>
          {explanation && (
            <div className="mt-3 rounded-lg bg-white p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {explanation.source === "ai" ? "✨ AI explanation of GatorPath's calculation" : "Explanation (offline template)"}
              </p>
              <p className="mt-1">{explanation.text}</p>
            </div>
          )}
        </section>
      )}

      {/* Semester board */}
      <section aria-labelledby="board-h">
        <h2 id="board-h" className="mb-2 text-lg font-bold text-[#463077]">
          Your semester plan
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          <Column title={`${termLabel(student.currentTerm)} (now)`} units={student.inProgress.reduce((s, c) => s + getCourse(c).units, 0)}>
            {student.inProgress.map((c) => (
              <CourseCard key={c} code={c} tone="now" />
            ))}
          </Column>
          {plan.terms.map((t) => (
            <Column key={t.term} title={termLabel(t.term)} units={t.units}>
              {t.courses.map((c) => (
                <CourseCard
                  key={c}
                  code={c}
                  tone={result?.moved === c ? "moved" : delayedReason.get(c) === "prerequisite" ? "delayed" : delayedReason.get(c) === "capacity" ? "shifted" : "planned"}
                >
                  <label className="sr-only" htmlFor={`move-${c}`}>
                    Move {c} to
                  </label>
                  <select
                    id={`move-${c}`}
                    value=""
                    onChange={(e) => tryMove(c, Number(e.target.value))}
                    className="mt-1 w-full rounded border border-gray-300 bg-white p-0.5 text-xs"
                  >
                    <option value="" disabled>
                      What if I move it…
                    </option>
                    {termOptions
                      .filter((o) => o !== plan.placement[c])
                      .map((o) => (
                        <option key={o} value={o}>
                          {termLabel(o)}
                        </option>
                      ))}
                  </select>
                </CourseCard>
              ))}
            </Column>
          ))}
        </div>
      </section>

      {/* Graph */}
      <section aria-labelledby="graph-h">
        <h2 id="graph-h" className="mb-2 text-lg font-bold text-[#463077]">
          Prerequisite map
        </h2>
        <CourseGraph student={student} plan={plan} result={result} />
      </section>

      <CareerPanel
        key={student.electiveChoices.join()}
        student={student}
        onApply={(codes, goal) => {
          setStudent((s) => ({ ...s, electiveChoices: codes, careerGoal: goal, pins: {} }));
          setMove(null);
          setExplanation(null);
        }}
      />

      <footer className="rounded-xl bg-gray-50 p-4 text-xs text-gray-600">
        <p>
          <strong>Responsible AI.</strong> Prerequisites, schedules and graduation projections are calculated by deterministic code from the
          official{" "}
          <a className="underline" href="https://bulletin.sfsu.edu/colleges/science-engineering/computer-science/bs-computer-science/" target="_blank" rel="noreferrer">
            SFSU Bulletin
          </a>
          . AI only explains results and ranks electives the engine has already approved, and every AI output is labeled. This is a prototype using a
          sample student and no real student records. It does not replace your advisor or official degree audit.
        </p>
        <p className="mt-1">Simplifications: {catalog.modelingNotes.slice(1).join(" ")}</p>
      </footer>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      {children}
    </div>
  );
}

function Column({ title, units, children }: { title: string; units: number; children: React.ReactNode }) {
  return (
    <div className="w-52 shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-gray-500">{units} units</span>
      </div>
      <ul className="mt-2 space-y-2">{children}</ul>
    </div>
  );
}

const TONES = {
  now: "border-blue-300 bg-blue-50",
  planned: "border-gray-200 bg-white",
  moved: "border-[#463077] bg-[#ede7f6]",
  delayed: "border-red-400 bg-red-50",
  shifted: "border-amber-400 bg-amber-50",
};

function CourseCard({ code, tone, children }: { code: string; tone: keyof typeof TONES; children?: React.ReactNode }) {
  const c = getCourse(code);
  return (
    <li className={`rounded-lg border-2 p-2 text-sm ${TONES[tone]}`}>
      <div className="flex justify-between font-semibold">
        <span>{code}</span>
        <span className="text-xs text-gray-500">{c.units}u</span>
      </div>
      <div className="text-xs text-gray-700">{c.title}</div>
      {tone === "delayed" && <div className="text-xs font-semibold text-red-700">Delayed</div>}
      {tone === "shifted" && <div className="text-xs font-semibold text-amber-800">Shifted</div>}
      {children}
    </li>
  );
}
