import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeries, datesBack, movingAverage, statsOf, type ChartInput } from "./chart-series.ts";
import type { NutritionDay } from "./types.ts";

const input = (nutrition: Record<string, NutritionDay>, dates: string[]): ChartInput => ({
  dates, history: {}, nutrition, habits: [], hunger: [], phase: "maintain", restDays: {}, isTrainingDay: () => false,
});

test("dates run oldest first and end today", () => {
  const d = datesBack(3, new Date("2026-10-03T12:00:00"));
  assert.deepEqual(d, ["2026-10-01", "2026-10-02", "2026-10-03"]);
});

test("calories carry the day's target and a 90% floor; unlogged days are gaps", () => {
  const n = {
    "2026-10-01": { goals: { cals: 2300, protein: 150, water: 3000 }, water: 0, items: [{ cals: 2000, p: 140 }] },
  } as unknown as Record<string, NutritionDay>;
  const pts = buildSeries("calories", input(n, ["2026-10-01", "2026-10-02"]));
  assert.equal(pts[0]!.value, 2000);
  assert.equal(pts[0]!.target, 2300);
  assert.equal(pts[0]!.min, 2070);
  assert.equal(pts[1]!.value, null);
});

test("moving average skips gaps; stats compare against the previous period", () => {
  const pts = [80, null, 82, 84].map((v, i) => ({ date: String(i), value: v, target: null, min: 70 }));
  const ma = movingAverage(pts, 3);
  assert.equal(ma[3], (80 + 82 + 84) / 3);
  const prev = [70, 70].map((v, i) => ({ date: String(i), value: v, target: null, min: 70 }));
  const s = statsOf(pts, prev);
  assert.equal(s.latest, 84);
  assert.equal(Math.round(s.change!), Math.round(((82 - 70) / 70) * 100));
  assert.deepEqual(s.onTarget, { hit: 3, of: 3 });
});
