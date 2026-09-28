import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asGoals, carryOver, daysLeftIn, goalProgress, logProgress, periodLabel, periodOf, periodRange,
  shiftPeriod, summarisePeriod, type Goal,
} from "./life-goals.ts";

const MON = new Date(2026, 8, 28); // Monday 28 Sep 2026, ISO week 40

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g", title: "Run", horizon: "week", period: "2026-W40", done: false, color: "#fff", createdAt: 0, ...over,
});

test("a date belongs to its week, month and year", () => {
  assert.equal(periodOf("week", MON), "2026-W40");
  assert.equal(periodOf("month", MON), "2026-09");
  assert.equal(periodOf("year", MON), "2026");
  // ISO weeks: 1 Jan 2027 is a Friday, so it is still week 53 of 2026.
  assert.equal(periodOf("week", new Date(2027, 0, 1)), "2026-W53");
});

test("each period knows its first and last day", () => {
  assert.deepEqual(periodRange("week", "2026-W40"), { from: "2026-09-28", to: "2026-10-04" });
  assert.deepEqual(periodRange("month", "2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(periodRange("year", "2026"), { from: "2026-01-01", to: "2026-12-31" });
});

test("periods step back and forward, across year ends", () => {
  assert.equal(shiftPeriod("week", "2026-W40", 1), "2026-W41");
  assert.equal(shiftPeriod("month", "2026-12", 1), "2027-01");
  assert.equal(shiftPeriod("month", "2026-01", -1), "2025-12");
  assert.equal(shiftPeriod("year", "2026", -1), "2025");
  assert.match(periodLabel("week", "2026-W40"), /^Week 40 · /);
});

test("days left counts today and stops at zero", () => {
  assert.equal(daysLeftIn("week", "2026-W40", MON), 7);
  assert.equal(daysLeftIn("week", "2026-W39", MON), 0);
});

test("a counted goal completes itself when it reaches its target", () => {
  let g = goal({ target: 20, progress: 12, unit: "km" });
  assert.equal(goalProgress(g), 0.6);
  g = logProgress(g, 5, 1);
  assert.equal(g.done, false);
  g = logProgress(g, 3, 2);
  assert.equal(g.done, true);
  assert.equal(g.doneAt, 2);
  g = logProgress(g, -2, 3);
  assert.equal(g.done, false, "taking some back un-finishes it");
});

test("carrying a goal over moves it into the current period and remembers where from", () => {
  const moved = carryOver(goal({ period: "2026-W38" }), MON);
  assert.equal(moved.period, "2026-W40");
  assert.equal(moved.from, "2026-W38");
});

test("a period's summary counts what is done and averages the progress", () => {
  const s = summarisePeriod(
    [goal({ id: "a", done: true }), goal({ id: "b", target: 10, progress: 5 }), goal({ id: "c", period: "2026-W41" })],
    "week",
    "2026-W40",
  );
  assert.deepEqual(s, { total: 2, done: 1, progress: 0.75 });
});

test("a malformed goal is dropped, and a damaged one repaired", () => {
  const out = asGoals([{ id: "x" }, { id: "y", title: "Read", horizon: "nonsense", target: -3 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.horizon, "week");
  assert.equal(out[0]!.target, undefined);
});
