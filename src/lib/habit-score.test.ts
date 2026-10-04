import assert from "node:assert/strict";
import { test } from "node:test";
import { coefOf, habitConsistency, habitDayScore, habitStreak } from "./habit-score.ts";
import type { Habit } from "./types.ts";

const h = (id: string, coef: number | undefined, history: Record<string, boolean>, goal = 7, since?: string): Habit =>
  ({ id, name: id, desc: "", color: "#fff", goalDaysPerWeek: goal, history, coef, since }) as Habit;

test("the day is a weighted average, like a school report", () => {
  const habits = [
    h("gym", 5, { "2026-10-01": true }, 7, "2026-09-01"),
    h("floss", 1, {}, 7, "2026-09-01"),
  ];
  // 5 of 6 coefficient points.
  assert.equal(habitDayScore(habits, "2026-10-01").score, 83);
  // Flip it: missing the gym is the bad day.
  const flipped = [h("gym", 5, {}, 7, "2026-09-01"), h("floss", 1, { "2026-10-01": true }, 7, "2026-09-01")];
  assert.equal(habitDayScore(flipped, "2026-10-01").score, 17);
});

test("unrated habits are coefficient 2, and out-of-range is clamped to the default", () => {
  assert.equal(coefOf(h("a", undefined, {})), 2);
  assert.equal(coefOf(h("a", 9, {})), 2);
  assert.equal(coefOf(h("a", 4, {})), 4);
});

test("days before a habit existed, and undone off-days of a part-week habit, are not misses", () => {
  const habits = [
    h("read", 2, { "2026-10-01": true }, 7, "2026-10-01"),
    h("run", 3, {}, 3, "2026-09-01"),
  ];
  assert.equal(habitDayScore(habits, "2026-09-30").score, null);
  assert.equal(habitDayScore(habits, "2026-10-01").score, 100);
});

test("the streak counts kept days (70+) and an open today does not break it", () => {
  const hist = { "2026-09-28": true, "2026-09-29": true, "2026-09-30": true };
  const habits = [h("gym", 5, hist, 7, "2026-09-28"), h("floss", 1, {}, 7, "2026-09-28")];
  // 83 each day for three days; today (10-01) nothing yet.
  assert.equal(habitStreak(habits, "2026-10-01"), 3);
  const gymOnly = [h("gym", 1, hist, 7, "2026-09-28"), h("floss", 1, {}, 7, "2026-09-28")];
  // 50 — below 70, never kept.
  assert.equal(habitStreak(gymOnly, "2026-10-01"), 0);
});

test("consistency averages the scored days and leaves an unkept today out", () => {
  const habits = [h("gym", 1, { "2026-09-30": true }, 7, "2026-09-29")];
  // 09-29: 0, 09-30: 100, today open → 50.
  assert.equal(habitConsistency(habits, "2026-10-01"), 50);
});

test("a habit never ticked still counts today, but not before", () => {
  const habits = [h("gym", 2, { "2026-10-01": true }, 7, "2026-09-01"), h("new", 2, {}, 7)];
  assert.equal(habitDayScore(habits, "2026-10-01", "2026-10-01").score, 50);
  assert.equal(habitDayScore(habits, "2026-09-30", "2026-10-01").score, 0);
  assert.equal(habitDayScore([h("new", 2, {}, 7)], "2026-09-30", "2026-10-01").score, null);
});
