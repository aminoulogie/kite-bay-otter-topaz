import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rateExerciseInstance, rateSession, rateSet, setBreakdown,
} from "./stimulus.ts";
import type { WorkoutSet } from "./types.ts";
import type { SetQuality } from "./set-quality.ts";

const set = (patch: Partial<WorkoutSet & SetQuality> = {}): WorkoutSet & SetQuality => ({
  weight: 60,
  reps: 10,
  failure: 3,
  done: true,
  type: "normal",
  ...patch,
});

// ------------------------------------------------------------------- a set --

test("an unanswered set is unrated, not zero", () => {
  const r = rateSet(set());
  assert.equal(r.score, null);
  assert.equal(r.coverage, 0);
});

test("the best possible set scores 100", () => {
  const r = rateSet(set({ limiter: "target", closeness: "nothing", form: 3, burn: 3 }));
  assert.equal(r.score, 100);
  assert.equal(r.genuine, true);
});

test("stopping with reps left costs more than any other single answer", () => {
  const base = { limiter: "target", form: 3, burn: 3 } as const;
  const near = rateSet(set({ ...base, closeness: "nothing" })).score!;
  const short = rateSet(set({ ...base, closeness: "reps_left" })).score!;
  const softForm = rateSet(set({ ...base, closeness: "nothing", form: 1 })).score!;
  const softBurn = rateSet(set({ ...base, closeness: "nothing", burn: 1 })).score!;
  assert.ok(near - short > near - softForm, "proximity outweighs form");
  assert.ok(near - short > near - softBurn, "proximity outweighs burn");
});

test("a synergist failing is scored below the target failing, all else equal", () => {
  const onTarget = rateSet(set({ limiter: "target", closeness: "nothing", form: 3, burn: 3 }));
  const offTarget = rateSet(set({ limiter: "synergist", closeness: "nothing", form: 3, burn: 3 }));
  assert.ok(offTarget.score! < onTarget.score!);
  assert.equal(offTarget.genuine, false);
});

test("going past failure is not worth more than reaching it", () => {
  const q = { limiter: "target", form: 3, burn: 3 } as const;
  assert.equal(
    rateSet(set({ ...q, closeness: "forced" })).score,
    rateSet(set({ ...q, closeness: "nothing" })).score,
  );
});

test("choosing to stop is not punished twice", () => {
  // Same closeness, so the only difference is the limiter. Stopping on purpose
  // is a proximity cost, already paid; it must not also read as mis-targeted.
  const chose = rateSet(set({ limiter: "choice", closeness: "reps_left", form: 3 })).score!;
  const synergist = rateSet(set({ limiter: "synergist", closeness: "reps_left", form: 3 })).score!;
  assert.ok(chose > synergist);
});

test("a partly answered set is scored on what was answered", () => {
  // Closeness alone, at the top of the scale, is a full score of 40% coverage.
  const r = rateSet(set({ closeness: "nothing" }));
  assert.equal(r.score, 100);
  assert.ok(Math.abs(r.coverage - 0.4) < 1e-9);
  assert.deepEqual(setBreakdown(r).map((b) => b.key), ["proximity"]);
});

test("a heavy triple with no burn is not treated as a bad set", () => {
  const r = rateSet(set({ reps: 3, limiter: "target", closeness: "nothing", form: 3, burn: 1 }));
  assert.ok(r.score! >= 90, `expected a high score, got ${r.score}`);
});

// -------------------------------------------------------------- an exercise --

test("warm-ups and unticked sets are left out of the exercise rating", () => {
  const good = { limiter: "target", closeness: "nothing", form: 3, burn: 3 } as const;
  const r = rateExerciseInstance({
    sets: [
      set({ type: "warmup", ...good, closeness: "reps_left" }),
      set({ done: false, ...good, closeness: "reps_left" }),
      set(good),
    ],
  });
  assert.equal(r.score, 100);
  assert.equal(r.ratedSets, 1);
  assert.equal(r.workingSets, 1);
});

test("the exercise rating is the mean of its sets, not its best one", () => {
  const r = rateExerciseInstance({
    sets: [
      set({ limiter: "target", closeness: "nothing", form: 3, burn: 3 }), // 100
      set({ limiter: "target", closeness: "reps_left", form: 3, burn: 3 }), // 82
    ],
  });
  assert.ok(r.fromSets! < 100 && r.fromSets! > 82);
});

test("pump nudges the exercise rating without rescuing it", () => {
  const sets = [set({ limiter: "target", closeness: "reps_left", form: 2, burn: 1 })];
  const flat = rateExerciseInstance({ sets })!;
  const pumped = rateExerciseInstance({ sets, pump: 3 })!;
  assert.ok(pumped.score! > flat.score!);
  assert.ok(pumped.score! - flat.score! <= 6);
});

test("an exercise with nothing rated stays unrated", () => {
  const r = rateExerciseInstance({ sets: [set(), set()] });
  assert.equal(r.score, null);
  assert.equal(r.workingSets, 2);
});

// --------------------------------------------------------------- a session --

test("the session is weighted by rated sets, so the main lift counts more", () => {
  const hard = set({ limiter: "target", closeness: "nothing", form: 3, burn: 3 }); // 100
  const easy = set({ limiter: "choice", closeness: "reps_left", form: 2, burn: 1 }); // low
  const s = rateSession({
    exercises: [
      { name: "Squat", sets: [hard, hard, hard, hard] },
      { name: "Calf Raise", sets: [easy] },
    ],
  });
  // A straight mean of the two exercise scores would sit near the midpoint;
  // weighting by sets has to pull it towards the four-set lift.
  const straightMean =
    (s.exercises[0]!.rating.score! + s.exercises[1]!.rating.score!) / 2;
  assert.ok(s.score! > straightMean);
  assert.equal(s.ratedSets, 5);
});

test("an unrated session reports coverage rather than a score", () => {
  const s = rateSession({ exercises: [{ name: "Squat", sets: [set(), set()] }] });
  assert.equal(s.score, null);
  assert.equal(s.coverage, 0);
  assert.equal(s.workingSets, 2);
});

test("coverage is the share of working sets that carry a rating", () => {
  const rated = set({ limiter: "target", closeness: "nothing" });
  const s = rateSession({ exercises: [{ name: "Row", sets: [rated, set(), set(), set()] }] });
  assert.equal(s.coverage, 0.25);
});

test("no session at all is handled without throwing", () => {
  const s = rateSession(null);
  assert.equal(s.score, null);
  assert.equal(s.totalExercises, 0);
});
