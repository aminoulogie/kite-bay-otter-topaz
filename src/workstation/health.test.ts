import assert from "node:assert/strict";
import { test } from "node:test";
import type { HistorySession, NutritionDay } from "../lib/types.ts";
import { avg, intake, lastDays, weeklyVolume, weights } from "./health.ts";

test("series over the last days", () => {
  const days = lastDays("2026-10-07", 3);
  assert.deepEqual(days, ["2026-10-05", "2026-10-06", "2026-10-07"]);
  const n = {
    "2026-10-05": { items: [{ cals: 500, p: 30 }, { cals: 700, p: 50 }], bodyWeight: 79.2 },
    "2026-10-07": { items: [], bodyWeight: 79 },
  } as unknown as Record<string, NutritionDay>;
  assert.deepEqual(intake(n, days), [
    { date: "2026-10-05", cals: 1200, protein: 80 },
    { date: "2026-10-06", cals: null, protein: null },
    { date: "2026-10-07", cals: null, protein: null },
  ]);
  assert.deepEqual(weights(n, days).map((p) => p.value), [79.2, null, 79]);
  assert.equal(avg([1, null, 3]), 2);
  assert.equal(avg([null]), null);
});

test("weekly volume, Monday weeks", () => {
  const h = {
    "2026-10-05": { totalVol: 1000 },
    "2026-10-07": { totalVol: 500 },
    "2026-09-30": { totalVol: 800 },
  } as unknown as Record<string, HistorySession>;
  assert.deepEqual(weeklyVolume(h, "2026-10-08", 2), [
    { week: "2026-09-28", volume: 800, sessions: 1 },
    { week: "2026-10-05", volume: 1500, sessions: 2 },
  ]);
});
