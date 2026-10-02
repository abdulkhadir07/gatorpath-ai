# GatorPath AI

See how today's course decisions shape your path to graduation at SF State.

GatorPath turns an SFSU Computer Science student's completed courses into a semester-by-semester plan, flags graduation bottlenecks, and runs **what-if** simulations ("what if I take CSC 340 next fall instead?"). AI explains the consequences in plain language and ranks senior electives against the student's own career goal. Every AI pick is checked against the official catalog before it's shown.

## Run it

```bash
npm install
cp .env.example .env.local   # add one AI key (optional; works offline without one)
npm run dev                  # http://localhost:3000
npm test                     # engine tests
```

A free Gemini key is available at https://aistudio.google.com. Never commit `.env.local`.

## How it works

| Layer | File | Role |
| --- | --- | --- |
| Data | `data/courses.json` | BS CS requirements and prerequisites from the SFSU Bulletin (AND/OR prerequisite groups, co-requisites) |
| Engine | `lib/planner.ts` | Deterministic scheduler: fills each term up to a unit cap, taking courses on the longest prerequisite chain first. What-if pins a course to a term, re-plans, and diffs the result. Bottlenecks are courses whose one-semester slip delays graduation. |
| AI | `lib/explain.ts`, `lib/electives.ts`, `lib/llm.ts` | Explains engine output (never computes it) and ranks only engine-approved electives. Invented or ineligible codes are rejected and shown as blocked. Deterministic fallbacks run when no key is set. |
| UI | `components/Planner.tsx`, `CourseGraph.tsx`, `CareerPanel.tsx` | Dashboard, semester board, React Flow prerequisite map, career panel |

**Code decides the facts. AI explains them.**

## Demo script (90 seconds)

1. "This is Alex, an SFSU CS junior who wants to graduate Spring 2028." Point at progress and the **3 bottlenecks** banner.
2. Alex works part-time and wants to push **CSC 340** to Fall 2027. Use its "What if I move it…" menu.
3. CSC 415, CSC 510 and CSC 652 turn red, the map shows the chain, and graduation slips to **Fall 2028**.
4. Click **Explain this**: AI explains why, using only the engine's facts. Click **Undo**.
5. Type "I want to work in cybersecurity at a startup" and click **Find my electives**: ranked, catalog-verified electives that keep Spring 2028.

## Responsible AI

- No accounts or real student records. Sample student only.
- Prerequisites and dates come from deterministic code, not the model. Every AI output is labeled.
- The model only sees engine output and an eligible course list. Anything outside it is rejected.
- Keyboard-usable controls, labeled form fields, and a text semester board alongside the visual map.
- Not a degree audit. Students should confirm with an advisor and the official Degree Planner.

## Known simplifications

Grades, GPA and standing requirements aren't modeled. Every course is assumed offered every fall and spring. Electives are a subset of the approved list. See `modelingNotes` in `data/courses.json`.

## Next steps at SFSU

Import completed courses from the official degree audit instead of manual entry, real term-offering data from the class schedule, more majors from the Bulletin, an advisor view, and SFSU opportunity matching.
