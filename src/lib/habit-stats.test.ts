import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completionRate, currentStreak, frequency, longestStreak, recentWeeks, totalDays, yearWeeks,
} from "./habit-stats.ts";
import type { Habit } from "./types.ts";

const h = (history: Record<string, boolean>, since?: string): Habit =>
  ({ id: "x", name: "x", desc: "", color: "#fff", goalDaysPerWeek: 7, history, since }) as Habit;

test("current streak survives an unticked today", () => {
  const x = h({ "2026-10-01": true, "2026-10-02": true });
  assert.equal(currentStreak(x, "2026-10-03"), 2);
  assert.equal(currentStreak(h({ ...x.history, "2026-10-03": true }), "2026-10-03"), 3);
  assert.equal(currentStreak(h({ "2026-09-30": true }), "2026-10-03"), 0);
});

test("longest streak crosses month ends and ignores false", () => {
  const x = h({ "2026-08-30": true, "2026-08-31": true, "2026-09-01": true, "2026-09-03": true, "2026-09-02": false });
  assert.equal(longestStreak(x), 3);
  assert.equal(totalDays(x), 4);
});

test("completion counts from the start, today included", () => {
  const x = h({ "2026-10-01": true, "2026-10-03": true }, "2026-10-01");
  assert.equal(completionRate(x, "2026-10-03"), 67);
  assert.equal(completionRate(h({}), "2026-10-03"), null);
});

test("weeks are Monday-first and stop at today", () => {
  const cols = recentWeeks("2026-10-03", 2); // a Saturday
  assert.equal(cols[1]![0], "2026-09-28");
  assert.equal(cols[1]![5], "2026-10-03");
  assert.equal(cols[1]![6], null);
  assert.equal(cols[0]![0], "2026-09-21");
});

test("a year grid holds every day once and labels twelve months", () => {
  const { cols, months } = yearWeeks(2026);
  const days = cols.flat().filter(Boolean);
  assert.equal(days.length, 365);
  assert.equal(months.length, 12);
  assert.equal(cols[0]![3], "2026-01-01"); // a Thursday
});

test("frequency bars", () => {
  const x = h({ "2026-09-01": true, "2026-09-02": true, "2026-10-01": true }, "2025-12-31");
  const m = frequency(x, "monthly", 2026, "2026-10-03");
  assert.equal(m[8]!.value, 2);
  assert.equal(m[8]!.max, 30);
  const w = frequency(x, "weekly", 2026, "2026-10-03");
  assert.equal(w.length, 7);
  assert.equal(w[3]!.label, "Thu"); // 2026-10-01 was a Thursday
  assert.equal(w[3]!.value, 1);
  assert.equal(w[1]!.value, 1); // 2026-09-01, a Tuesday
  assert.equal(w[6]!.max, 11); // this Sunday has not happened yet
  const y = frequency(x, "yearly", 2026, "2026-10-03");
  assert.deepEqual(y.map((b) => b.label), ["2025", "2026"]);
  assert.equal(y[1]!.value, 3);
});
