import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORE_WEIGHTS, WORKOUT_WEIGHTS, scoreDay } from "./day-score.ts";
import type { HistorySession, WorkoutSet } from "./types.ts";

const set = (q: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ weight: 60, reps: 8, failure: 3, done: true, type: "normal", ...q }) as WorkoutSet;

const session = (sets: WorkoutSet[], name = "Bench"): HistorySession =>
  ({
    timestamp: Date.now(), split: "Push", durationFormatted: "45m", caloriesBurned: 300,
    totalVol: 1000, totalSets: sets.length, axialVol: 0, muscles: {},
    exercises: [{ name, muscle: "Chest", subTarget: "", targetKeys: ["chest"], position: "",
      risk: "", tier: "", isAxial: false, isBW: false, usesBar: true, barWeight: 20,
      supersetGroup: "", sets }],
  }) as HistorySession;

test("the workout weights sum to the workout share", () => {
  const sum = Object.values(WORKOUT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, SCORE_WEIGHTS.workout, "the four parts must add up to 40");
});

test("all weights sum to 100", () => {
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test("unlogged food is not logged, not zero", () => {
  // The rule that matters most: never punish not writing something down as
  // though it were not doing it.
  const r = scoreDay({ session: session([set()]) });
  const protein = r.lines.find((l) => l.id === "protein")!;
  assert.equal(protein.earned, null);
  assert.equal(protein.detail, "not logged");
  assert.ok(r.untracked.includes("Protein"));
  assert.ok(r.tracked < 100, "untracked points must leave the denominator");
});

test("a perfect tracked day scores 100 even with things untracked", () => {
  const r = scoreDay({
    preworkout: 1,
    session: session([set({ limiter: "target", closeness: "nothing", burn: 3 })]),
    protein: { grams: 200, target: 200 },
    calories: { kcal: 2500, target: 2500 },
    sleepHours: 8,
    creatineG: 5,
  });
  assert.equal(r.score, 100);
});

test("turning up is not worth the full workout share", () => {
  // Every set completed, but none taken to failure of the target.
  const lazy = scoreDay({ session: session([set({ limiter: "choice", closeness: "reps_left" })]) });
  const hard = scoreDay({
    session: session([set({ limiter: "target", closeness: "nothing", burn: 3 })]),
  });
  const workoutOf = (r: typeof lazy) =>
    r.lines.filter((l) => ["completion", "effort", "progression", "coverage"].includes(l.id))
      .reduce((t, l) => t + (l.earned ?? 0), 0);

  assert.ok(workoutOf(hard) > workoutOf(lazy), "real failures must outscore coasting");
  assert.ok(
    workoutOf(lazy) < WORKOUT_WEIGHTS.completion + WORKOUT_WEIGHTS.coverage + 1,
    "completing sets alone should not approach the full 40",
  );
});

test("a set the synergist ended does not earn full effort", () => {
  const chest = scoreDay({
    session: session([set({ limiter: "target", closeness: "nothing", burn: 3 })]),
  }).lines.find((l) => l.id === "effort")!;
  const triceps = scoreDay({
    session: session([set({ limiter: "synergist", closeness: "nothing", burn: 3 })]),
  }).lines.find((l) => l.id === "effort")!;
  assert.ok(chest.earned! > triceps.earned!, "target failure must beat synergist failure");
});

test("a rest day is not a missed workout", () => {
  const r = scoreDay({ isRestDay: true, protein: { grams: 200, target: 200 } });
  const w = r.lines.find((l) => l.id === "workout")!;
  assert.equal(w.earned, null);
  assert.equal(w.detail, "rest day");
  assert.equal(r.score, 100, "hitting protein on a rest day is a perfect rest day");
});

test("old sessions without ratings are not treated as zero effort", () => {
  // 1287 imported sets have no limiter. They must not drag every past day down.
  const r = scoreDay({ session: session([set(), set()]) });
  const effort = r.lines.find((l) => l.id === "effort")!;
  assert.ok(effort.earned! > 0, "unrated sets get middling credit, not none");
  assert.equal(effort.detail, "sets not rated");
});

test("progression is unscored without a previous session to compare", () => {
  const r = scoreDay({ session: session([set()]) });
  assert.equal(r.lines.find((l) => l.id === "progression")!.earned, null);
});

test("progression rewards holding or beating the last session", () => {
  const prev = session([set({ weight: 60 })]);
  const better = scoreDay({ session: session([set({ weight: 70 })]), previous: prev });
  const worse = scoreDay({ session: session([set({ weight: 50 })]), previous: prev });
  assert.ok(
    better.lines.find((l) => l.id === "progression")!.earned! >
      worse.lines.find((l) => l.id === "progression")!.earned!,
  );
});
