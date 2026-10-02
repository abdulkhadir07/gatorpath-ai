"use client";

import { useState } from "react";
import type { ElectiveResult } from "@/lib/electives";
import type { Student } from "@/lib/types";

export function CareerPanel({ student, onApply }: { student: Student; onApply: (codes: string[], goal: string) => void }) {
  const [goal, setGoal] = useState(student.careerGoal);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ElectiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/electives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ student, goal }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="career-h" className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 id="career-h" className="text-lg font-bold text-[#463077]">Career-aligned electives</h2>
      <p className="mt-1 text-sm text-gray-600">
        Describe what you want to do after graduating. The AI ranks electives you can actually take, and GatorPath checks every pick
        against the catalog.
      </p>
      <label htmlFor="goal" className="mt-3 block text-sm font-semibold">
        Your goal
      </label>
      <textarea
        id="goal"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={2}
        maxLength={300}
        className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:outline-2 focus:outline-[#463077]"
        placeholder="e.g. I want to work in cybersecurity at a startup"
      />
      <button
        onClick={run}
        disabled={loading || !goal.trim()}
        className="mt-2 rounded-lg bg-[#463077] px-4 py-2 text-sm font-semibold text-white hover:bg-[#35235c] disabled:opacity-50"
      >
        {loading ? "Thinking…" : "Find my electives"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {result.source === "ai" ? "✨ AI-generated recommendation, verified by GatorPath" : "Offline keyword match"}
          </p>
          {result.aiError && <p className="mt-1 text-xs text-red-700">AI unavailable: {result.aiError}</p>}
          <ol className="mt-2 space-y-2">
            {result.picks.map((p, i) => (
              <li key={p.code} className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-semibold">
                  {i + 1}. {p.code}: {p.title}
                </div>
                <div className="text-sm text-gray-700">{p.reason}</div>
              </li>
            ))}
          </ol>
          {result.rejected.length > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              🛡️ Blocked {result.rejected.join(", ")}: the AI suggested {result.rejected.length === 1 ? "it" : "them"}, but{" "}
              {result.rejected.length === 1 ? "it isn't" : "they aren't"} an eligible elective in the SFSU catalog.
            </p>
          )}
          <p className="mt-2 text-sm">
            {result.keepsGraduation ? "✅ These electives keep your projected graduation term." : "⚠️ These electives would push your projected graduation later."}
          </p>
          <button
            onClick={() => onApply(result.picks.map((p) => p.code), goal)}
            className="mt-2 rounded-lg border-2 border-[#463077] px-4 py-2 text-sm font-semibold text-[#463077] hover:bg-[#ede7f6]"
          >
            Use these electives in my plan
          </button>
        </div>
      )}
    </section>
  );
}
