import { expect, it } from "vitest";
import alexJson from "@/data/alex.json";
import { eligibleElectives, keywordPicks } from "./electives";
import type { Student } from "./types";

const alex = alexJson as Student;

it("offline matcher maps cybersecurity goals to security electives", () => {
  const picks = keywordPicks("I want to work in cybersecurity at a startup", eligibleElectives(alex), 5).map((p) => p.code);
  expect(picks.slice(0, 3)).toEqual(expect.arrayContaining(["CSC 652", "CSC 653"]));
});

it("offline matcher maps AI goals to AI electives", () => {
  const picks = keywordPicks("machine learning engineer", eligibleElectives(alex), 3).map((p) => p.code);
  expect(picks).toContain("CSC 671");
});
