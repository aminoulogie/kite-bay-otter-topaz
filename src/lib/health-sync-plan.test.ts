import assert from "node:assert/strict";
import { test } from "node:test";
import { durationMs, planHealthSync } from "./health-sync-plan.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

const session = { timestamp: Date.parse("2026-10-02T19:00:00"), totalSets: 18, caloriesBurned: 320, split: "Push", durationFormatted: "62:10" } as unknown as HistorySession;

test("durations parse", () => {
  assert.equal(durationMs("62:10"), (62 * 60 + 10) * 1000);
  assert.equal(durationMs(undefined), 0);
});

test("new things are sent, already-sent things are not, edits are re-sent", () => {
  const nutrition = { "2026-10-02": { sleep: { hours: 7.5 }, bodyWeight: 79.2 } } as unknown as Record<string, NutritionDay>;
  const first = planHealthSync({ history: { "2026-10-02": session }, nutrition, synced: {}, since: "2026-09-01" });
  assert.deepEqual(first.map((i) => i.kind).sort(), ["sleep", "weight", "workout"]);
  const w = first.find((i) => i.kind === "workout")!;
  assert.equal(w.kind === "workout" && w.end - w.start, (62 * 60 + 10) * 1000);
  const synced = Object.fromEntries(first.map((i) => [i.key, i.sig]));
  assert.equal(planHealthSync({ history: { "2026-10-02": session }, nutrition, synced, since: "2026-09-01" }).length, 0);
  const edited = { ...nutrition, "2026-10-02": { ...nutrition["2026-10-02"]!, sleep: { hours: 8 } } } as Record<string, NutritionDay>;
  assert.deepEqual(planHealthSync({ history: { "2026-10-02": session }, nutrition: edited, synced, since: "2026-09-01" }).map((i) => i.kind), ["sleep"]);
});

test("days before the start date are left alone", () => {
  assert.equal(planHealthSync({ history: { "2026-10-02": session }, nutrition: {}, synced: {}, since: "2026-10-03" }).length, 0);
});
