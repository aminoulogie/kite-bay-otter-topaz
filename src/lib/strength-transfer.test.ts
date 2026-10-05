import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRatio, e1rm, groupOf, implementOf, perHand, progressSince, repsInReserve, strengthGroups, transferFor } from "./strength-transfer.ts";
import type { HistorySession, WorkoutSet } from "./types.ts";

const set = (weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ weight, reps, failure: 3, done: true, type: "normal", closeness: "one_left", ...extra }) as WorkoutSet;
const day = (d: number, exercises: [string, WorkoutSet[]][]): [string, HistorySession] => [
  `2026-10-${String(d).padStart(2, "0")}`,
  { timestamp: new Date(2026, 9, d, 18).getTime(), exercises: exercises.map(([name, sets]) => ({ name, sets, isBW: false })) } as unknown as HistorySession,
];

test("names sort into movement groups and kit", () => {
  assert.equal(groupOf("EZ Bar Preacher Curl")?.id, "curl");
  assert.equal(groupOf("Bayesian Cable Curl")?.id, "curl");
  assert.equal(groupOf("Lying Leg Curl")?.id, "leg-curl");
  assert.equal(groupOf("Jefferson Curl"), null);
  assert.equal(groupOf("Neck Curl"), null);
  assert.equal(groupOf("Hack Squat")?.id, "squat");
  assert.equal(groupOf("Bulgarian Split Squat")?.id, "split-squat");
  assert.equal(groupOf("Incline Dumbbell Press")?.id, "incline-press");
  assert.equal(groupOf("Dumbbell Bench Press")?.id, "bench");
  assert.equal(implementOf("Preacher Curl (EZ Bar)"), "ez");
  assert.equal(implementOf("Machine Preacher Curl"), "machine");
  assert.equal(implementOf("Bayesian Curl"), "cable");
  assert.ok(perHand("Dumbbell Curl"));
  assert.ok(!perHand("Romanian Deadlift (DB/Barbell)"));
  assert.equal(implementOf("Hammer Curl (Dumbbell/Cable)"), "machine");
  assert.equal(implementOf("Smith Machine Bench Press"), "smith");
  assert.equal(implementOf("EZ Bar Preacher Curl"), "ez");
  assert.equal(defaultRatio("Dumbbell Bench Press"), 0.8);
  assert.equal(defaultRatio("Leg Press"), 2);
  assert.equal(repsInReserve({ closeness: "reps_left", failure: 3 }), 3);
  assert.equal(repsInReserve({ rpe: 8, failure: 3 }), 2);
});

test("EZ preacher 20 → machine preacher starts at 20 → dumbbells follow at ~40% a hand", () => {
  const h = Object.fromEntries([day(1, [["EZ Bar Preacher Curl", [set(20, 10)]]])]);
  const m = transferFor("Machine Preacher Curl", h)!;
  assert.equal(m.weight, 20);
  assert.equal(m.reps, 10);
  assert.equal(m.from.name, "EZ Bar Preacher Curl");
  assert.equal(m.learned, false);

  // The machine turned out easy: 25 for 10. Half of that surprise is the
  // machine, half is you: strength up ~12%, so dumbbells start at 9 a hand
  // (20 × 1.118 × 0.8 / 2), not the 8 they would have been.
  h["2026-10-08"] = day(8, [["Machine Preacher Curl", [set(25, 10)]]])[1];
  const d = transferFor("Dumbbell Preacher Curl", h)!;
  assert.equal(d.weight, 9);
});

test("a variation done once keeps YOUR ratio, so the machine's real number comes back", () => {
  const h = Object.fromEntries([
    day(1, [["EZ Bar Preacher Curl", [set(20, 10)]]]),
    // Machine is 'lighter' than the bar for you: 30 for the same effort.
    day(8, [["Machine Preacher Curl", [set(30, 10)]]]),
    // Then the bar again, stronger: 22.5.
    day(15, [["EZ Bar Preacher Curl", [set(22.5, 10)]]]),
  ]);
  const g = strengthGroups(h).get("curl")!;
  // The machine reads ~1.2× the bar for you (√1.5 after one switch).
  assert.ok(g.ratios.get("machine preacher curl|machine")!.ratio > 1.15);
  // Back on the machine: about 28.75 → 30 on a 2.5 step, well above the bar's 22.5.
  const m = transferFor("Machine Preacher Curl", h)!;
  assert.equal(m.learned, true);
  assert.equal(m.weight, 30);
});

test("different reps convert through the estimated max", () => {
  const h = Object.fromEntries([day(1, [["Barbell Bench Press", [set(100, 5, { closeness: "nothing" })]]])]);
  // 100 × 5 to failure ≈ 116.7 e1RM; dumbbells for 12 with one left: 116.7 × 0.8 / (1 + 13/30) / 2 ≈ 32.6 → 32.5 a hand.
  const t = transferFor("Dumbbell Bench Press", h, { ownLast: { reps: 12, at: "2000-01-01" } })!;
  assert.equal(t.reps, 12);
  assert.equal(t.weight, Math.round((e1rm(100, 5, 0) * 0.8) / (1 + 12 / 30) / 2 / 0.5) * 0.5);
});

test("no transfer when this exercise is itself the latest in its group, or nothing related exists", () => {
  const h = Object.fromEntries([day(1, [["EZ Bar Preacher Curl", [set(20, 10)]]])]);
  assert.equal(transferFor("EZ Bar Preacher Curl", h), null);
  assert.equal(transferFor("Lateral Raise", h), null);
  assert.equal(transferFor("Mystery Move", h), null);
  // Own session newer than the related one: the normal Smart target wins.
  assert.equal(transferFor("Machine Preacher Curl", h, { ownLast: { reps: 10, at: "2026-10-02" } }), null);
});

test("hack squat and leg press start from the squat with standard ratios", () => {
  const h = Object.fromEntries([day(1, [["Barbell Back Squat", [set(100, 5, { closeness: "one_left" })]]])]);
  assert.equal(transferFor("Hack Squat", h)!.weight, 130);
  assert.equal(transferFor("Leg Press", h)!.weight, 200);
});

test("progress is measured within each variation, not from the calibrating strength line", () => {
  const h = Object.fromEntries([
    day(1, [["EZ Bar Preacher Curl", [set(20, 10)]]]),
    day(2, [["Machine Preacher Curl", [set(40, 10)]]]),
    day(20, [["EZ Bar Preacher Curl", [set(22, 10)]]]),
    day(21, [["Machine Preacher Curl", [set(44, 10)]]]),
  ]);
  const g = strengthGroups(h).get("curl")!;
  // Both variations went up 10%; the machine being twice the bar is not progress.
  assert.ok(Math.abs(progressSince(g, "2026-10-01")! - 0.1) < 1e-9);
});
