"use client";

import { Background, Controls, type Edge, type Node, Position, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { catalog, getCourse } from "@/lib/catalog";
import { termLabel } from "@/lib/terms";
import type { Plan, Student, WhatIfResult } from "@/lib/types";

const COL_W = 200;
const ROW_H = 58;

type Status = "completed" | "inProgress" | "planned" | "moved" | "delayedPrereq" | "delayedCapacity";

const STYLE: Record<Status, { bg: string; border: string; color: string; label: string }> = {
  completed: { bg: "#e8f5e9", border: "#2e7d32", color: "#1b5e20", label: "Completed" },
  inProgress: { bg: "#e3f2fd", border: "#1565c0", color: "#0d47a1", label: "In progress" },
  planned: { bg: "#ffffff", border: "#9e9e9e", color: "#212121", label: "Planned" },
  moved: { bg: "#ede7f6", border: "#463077", color: "#311b92", label: "You moved this" },
  delayedPrereq: { bg: "#ffebee", border: "#c62828", color: "#b71c1c", label: "Delayed by prerequisite" },
  delayedCapacity: { bg: "#fff8e1", border: "#c99700", color: "#7a5c00", label: "Shifted by unit cap" },
};

export function CourseGraph({ student, plan, result }: { student: Student; plan: Plan; result: WhatIfResult | null }) {
  const { nodes, edges } = useMemo(() => {
    const columns: { title: string; codes: string[] }[] = [
      { title: "Completed", codes: student.completed },
      { title: `${termLabel(student.currentTerm)} (now)`, codes: student.inProgress },
      ...plan.terms.map((t) => ({ title: termLabel(t.term), codes: t.courses })),
    ];
    const delayedReason = new Map(result?.delayed.map((d) => [d.code, d.reason]) ?? []);
    const status = (code: string, col: number): Status => {
      if (col === 0) return "completed";
      if (col === 1) return "inProgress";
      if (result?.moved === code) return "moved";
      const r = delayedReason.get(code);
      if (r === "prerequisite") return "delayedPrereq";
      if (r === "capacity") return "delayedCapacity";
      return "planned";
    };

    const nodes: Node[] = [];
    const shown = new Set<string>();
    columns.forEach((col, i) => {
      nodes.push({
        id: `col-${i}`,
        position: { x: i * COL_W, y: 0 },
        data: { label: col.title },
        draggable: false,
        selectable: false,
        connectable: false,
        style: { background: "transparent", border: "none", fontWeight: 700, color: "#463077", width: 170, boxShadow: "none" },
      });
      col.codes.forEach((code, row) => {
        const s = STYLE[status(code, i)];
        shown.add(code);
        nodes.push({
          id: code,
          position: { x: i * COL_W, y: 44 + row * ROW_H },
          data: { label: code },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          draggable: false,
          connectable: false,
          ariaLabel: `${code}, ${getCourse(code).title}, ${s.label}, ${col.title}`,
          style: {
            width: 170,
            background: s.bg,
            border: `2px solid ${s.border}`,
            color: s.color,
            fontWeight: 600,
            borderRadius: 8,
          },
        });
      });
    });

    const edges: Edge[] = [];
    for (const code of shown) {
      const course = getCourse(code);
      const concurrent = new Set(course.concurrentOk ?? []);
      course.prereqs.forEach((group) => {
        for (const p of group) {
          if (!shown.has(p) || concurrent.has(p)) continue;
          const hot = delayedReason.get(code) === "prerequisite" && (p === result?.moved || delayedReason.get(p) === "prerequisite");
          edges.push({
            id: `${p}->${code}`,
            source: p,
            target: code,
            animated: hot,
            style: { stroke: hot ? "#c62828" : "#b0b0b0", strokeWidth: hot ? 2.5 : 1.2, strokeDasharray: group.length > 1 ? "4 3" : undefined },
          });
        }
      });
    }
    return { nodes, edges };
  }, [student, plan, result]);

  return (
    <div>
      <div className="h-[520px] rounded-xl border border-gray-200 bg-white" role="img" aria-label="Prerequisite map by semester">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
        >
          <Background gap={20} color="#eee" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-gray-700" aria-label="Legend">
        {(Object.keys(STYLE) as Status[]).map((k) => (
          <li key={k} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STYLE[k].bg, border: `2px solid ${STYLE[k].border}` }} />
            {STYLE[k].label}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span className="inline-block w-5 border-t-2 border-dashed border-gray-400" /> one of several options
        </li>
      </ul>
      <p className="sr-only">{catalog.degree.major} prerequisite map. The semester board above lists the same information as text.</p>
    </div>
  );
}
