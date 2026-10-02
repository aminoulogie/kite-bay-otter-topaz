import assert from "node:assert/strict";
import { test } from "node:test";
import { canChange, canTickOn } from "./habit-lock.ts";
import { logAmount } from "./habit-ramp.ts";
import type { Habit } from "./types.ts";

const NOW = new Date(2026, 8, 28, 15);

test("only today can be ticked", () => {
  assert.equal(canTickOn("2026-09-28", NOW), true);
  assert.equal(canTickOn("2026-09-27", NOW), false);
  assert.equal(canTickOn("2026-09-29", NOW), false);
});

test("a past day is read-only, done or missed; today can go either way", () => {
  assert.equal(canChange(true, "2026-09-20", NOW), false);
  assert.equal(canChange(true, "2026-09-28", NOW), true);
  assert.equal(canChange(false, "2026-09-20", NOW), false);
  assert.equal(canChange(false, "2026-09-28", NOW), true);
});

test("clearing a ramping habit's day clears its tick", () => {
  const h = {
    id: "h", name: "Plank", color: "#fff", history: { "2026-09-20": true },
    ramp: { start: 1, step: 1, target: 5, unit: "min", from: "2026-09-20" },
    amountLog: { "2026-09-20": 1 },
  } as unknown as Habit;
  const out = logAmount(h, "2026-09-20", null);
  assert.equal(!!out.history["2026-09-20"], false);
});
