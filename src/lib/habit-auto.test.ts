import assert from "node:assert/strict";
import { test } from "node:test";
import { autoDone, suggestAuto, type AutoContext } from "./habit-auto.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

const day = {
  goals: { protein: 150, water: 3000, cals: 2300 },
  water: 3200, creatine: 5, sleep: { hours: 7.5 },
  items: [{ name: "Chicken", p: 160, c: 0, f: 10, cals: 2250 }],
} as unknown as NutritionDay;
const ctx = (over: Partial<AutoContext> = {}): AutoContext => ({ date: "2026-10-03", day, mind: [], ...over });

test("SOMA's own numbers tick their habits", () => {
  assert.equal(autoDone({ kind: "protein" }, ctx()), true);
  assert.equal(autoDone({ kind: "water" }, ctx()), true);
  assert.equal(autoDone({ kind: "creatine" }, ctx()), true);
  assert.equal(autoDone({ kind: "calories", within: 5 }, ctx()), true);
  assert.equal(autoDone({ kind: "sleep", hours: 8 }, ctx()), false);
  assert.equal(autoDone({ kind: "workout" }, ctx()), false);
  assert.equal(autoDone({ kind: "workout" }, ctx({ session: { totalSets: 12 } as HistorySession })), true);
});

test("Apple Health thresholds", () => {
  assert.equal(autoDone({ kind: "steps", min: 8000 }, ctx({ health: { steps: 8100 } })), true);
  assert.equal(autoDone({ kind: "steps", min: 8000 }, ctx({ health: null })), false);
});

test("bedtime handles nights past midnight", () => {
  const at = (s: string) => new Date(s).getTime();
  assert.equal(autoDone({ kind: "bedtime", before: "23:30" }, ctx({ bedtimeMs: at("2026-10-02T23:10:00") })), true);
  assert.equal(autoDone({ kind: "bedtime", before: "23:30" }, ctx({ bedtimeMs: at("2026-10-03T00:40:00") })), false);
  assert.equal(autoDone({ kind: "bedtime", before: "00:30" }, ctx({ bedtimeMs: at("2026-10-03T00:10:00") })), true);
});

test("names suggest rules", () => {
  assert.deepEqual(suggestAuto("Train"), { kind: "workout" });
  assert.deepEqual(suggestAuto("Hit protein"), { kind: "protein" });
  assert.deepEqual(suggestAuto("Hydrate"), { kind: "water" });
  assert.deepEqual(suggestAuto("Walk 8k steps"), { kind: "steps", min: 8000 });
  assert.equal(suggestAuto("Deep work"), null);
});
