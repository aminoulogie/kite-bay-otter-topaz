import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewWeek } from "./week-review.ts";
import type { DayScore } from "./day-score.ts";

const day = (date: string, lines: [string, number | null, number][]): { date: string; score: DayScore } => {
  const ls = lines.map(([id, earned, possible]) => ({ id, label: id, earned, possible, detail: "" }));
  const tracked = ls.filter((l) => l.earned != null).reduce((t, l) => t + l.possible, 0);
  const earned = ls.reduce((t, l) => t + (l.earned ?? 0), 0);
  return { date, score: { score: tracked ? Math.round((earned / tracked) * 100) : 0, earned, tracked, lines: ls, untracked: [] } };
};

test("the biggest losses across the week are the causes, biggest first", () => {
  const r = reviewWeek([
    day("2026-09-27", [["workout", 0, 40], ["protein", 18, 18], ["sleep", 6, 13]]),
    day("2026-09-28", [["workout", 0, 40], ["protein", 9, 18], ["sleep", 13, 13]]),
    day("2026-09-29", [["workout", 40, 40], ["protein", 8, 18], ["sleep", 12, 13]]),
    day("2026-09-30", [["workout", null, 40], ["protein", null, 18]]),
  ]);
  assert.equal(r.causes[0]!.id, "workout");
  assert.equal(r.causes[0]!.days, 2);
  assert.equal(r.causes[0]!.text, "2 training days skipped");
  assert.equal(r.causes[1]!.id, "protein");
  assert.equal(r.scored, 3);
  assert.equal(r.blank, 1);
  // The 12/13 night is too small a miss to count.
  assert.equal(r.causes.find((c) => c.id === "sleep")?.days, 1);
});
