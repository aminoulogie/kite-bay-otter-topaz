import assert from "node:assert/strict";
import { test } from "node:test";
import { lastNDays } from "./coach-brief.ts";
import {
  BLOCK_WEEKS, MIN_SESSIONS, blockOf, blockWindow, dueNow, mesoReview,
  type MesoReviewInput,
} from "./meso-review.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

const TODAY = "2026-09-10";

const LANDMARKS = {
  chest: { mev: 8, mav: 16, mrv: 22, label: "Chest" },
  triceps: { mev: 6, mav: 14, mrv: 20, label: "Triceps" },
  triceps_back: { mev: 6, mav: 14, mrv: 20, label: "Triceps" },
};

/** Epley/Brzycki mean, matching the engine, so the numbers are the real ones. */
const est1RM = (w: number, r: number) => {
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  const epley = w * (1 + r / 30);
  const brzycki = r < 37 ? w * (36 / (37 - r)) : epley;
  return Math.round(((epley + brzycki) / 2) * 10) / 10;
};

function session(name: string, weight: number, reps: number, sets = 3): HistorySession {
  return {
    split: "Push",
    exercises: [
      {
        name,
        targetKeys: ["chest", "triceps", "triceps_back"],
        sets: Array.from({ length: sets }, () => ({
          weight, reps, done: true, type: "normal", failure: 3,
        })),
      },
    ],
  } as unknown as HistorySession;
}

function input(over: Partial<MesoReviewInput> = {}): MesoReviewInput {
  return {
    today: TODAY,
    weekNumber: 9,
    isDeload: true,
    history: {},
    nutrition: {},
    landmarks: LANDMARKS,
    estimate1RM: est1RM,
    ...over,
  };
}

test("blocks are nine weeks, deload included", () => {
  assert.deepEqual(blockOf(1), { index: 1, startWeek: 1, endWeek: 9, weekInBlock: 1 });
  assert.deepEqual(blockOf(9), { index: 1, startWeek: 1, endWeek: 9, weekInBlock: 9 });
  assert.deepEqual(blockOf(10), { index: 2, startWeek: 10, endWeek: 18, weekInBlock: 1 });
  assert.equal(blockOf(18).index, 2);
  assert.equal(blockOf(19).index, 3);
});

test("a nonsense week number does not produce a nonsense block", () => {
  assert.equal(blockOf(0).index, 1);
  assert.equal(blockOf(-5).index, 1);
  assert.equal(blockOf(Number.NaN).index, 1);
});

test("the review shows on the deload and on week one, and not in between", () => {
  // Shown every week it would stop being read by the time it matters.
  assert.equal(dueNow(1, false), true);
  assert.equal(dueNow(9, true), true);
  assert.equal(dueNow(BLOCK_WEEKS, false), true);
  assert.equal(dueNow(4, false), false);
  assert.equal(dueNow(15, false), false);
  // A deload declared out of schedule still counts.
  assert.equal(dueNow(4, true), true);
});

test("week one reviews the block that just ended, not the three days of this one", () => {
  const w1 = blockWindow({ today: TODAY, weekNumber: 10 });
  assert.equal(w1.weeks, BLOCK_WEEKS);
  const w5 = blockWindow({ today: TODAY, weekNumber: 5 });
  assert.equal(w5.weeks, 5, "mid-block it covers what has actually happened");
  assert.equal(w5.to, TODAY);
});

test("too little logged is said, not papered over", () => {
  const history: Record<string, HistorySession> = {};
  for (const d of lastNDays(TODAY, MIN_SESSIONS - 1)) history[d] = session("Bench", 80, 8);
  const r = mesoReview(input({ history }));
  assert.equal(r.thin, true);
  assert.match(r.verdicts[0]!, /not enough to review/);
  assert.deepEqual(r.volume, []);
  assert.deepEqual(r.lifts, []);
});

test("volume is averaged per week, and a muscle with two keys is counted once", () => {
  // triceps and triceps_back are one muscle wearing two keys; summing them
  // would report double the sets actually performed.
  const history: Record<string, HistorySession> = {};
  for (const d of lastNDays(TODAY, 63).filter((_, i) => i % 2 === 0)) {
    history[d] = session("Bench", 80, 8, 3);
  }
  const r = mesoReview(input({ history, weekNumber: 9 }));
  assert.equal(r.thin, false);
  const tri = r.volume.find((v) => v.label === "Triceps")!;
  const chest = r.volume.find((v) => v.label === "Chest")!;
  assert.equal(tri.perWeek, chest.perWeek, "one muscle, one count");
  assert.ok(tri.perWeek > 0 && tri.perWeek < 20);
});

test("a lift that moved is reported with both ends of the block", () => {
  const days = lastNDays(TODAY, 63).filter((_, i) => i % 7 === 0);
  const history: Record<string, HistorySession> = {};
  days.forEach((d, i) => { history[d] = session("Bench", 70 + i * 2.5, 8); });
  const r = mesoReview(input({ history }));
  const bench = r.lifts.find((l) => l.name === "Bench")!;
  assert.ok(bench.deltaPct > 10);
  assert.ok(bench.to > bench.from);
  assert.ok(r.verdicts.some((v) => /Bench moved/.test(v)));
});

test("a lift seen once contributes no change at all", () => {
  const days = lastNDays(TODAY, 63).filter((_, i) => i % 7 === 0);
  const history: Record<string, HistorySession> = {};
  days.forEach((d) => { history[d] = session("Bench", 80, 8); });
  const once = days[0]!;
  history[once] = {
    ...history[once]!,
    exercises: [...history[once]!.exercises, session("Curl", 20, 10).exercises[0]!],
  };
  const r = mesoReview(input({ history }));
  assert.ok(!r.lifts.some((l) => l.name === "Curl"), "one reading is not a change");
});

test("a block where nothing moved says so plainly", () => {
  const days = lastNDays(TODAY, 63).filter((_, i) => i % 7 === 0);
  const history: Record<string, HistorySession> = {};
  days.forEach((d) => { history[d] = session("Bench", 80, 8); });
  const r = mesoReview(input({ history }));
  assert.ok(
    r.verdicts.some((v) => /finished where they started/.test(v)),
    `expected a flat verdict, got ${JSON.stringify(r.verdicts)}`,
  );
});

test("bodyweight needs two readings before it is a change", () => {
  const days = lastNDays(TODAY, 63).filter((_, i) => i % 7 === 0);
  const history: Record<string, HistorySession> = {};
  days.forEach((d) => { history[d] = session("Bench", 80, 8); });

  const one: Record<string, NutritionDay> = {
    [days[0]!]: { goals: {}, water: 0, creatine: 0, items: [], bodyWeight: 80 } as never,
  };
  assert.equal(mesoReview(input({ history, nutrition: one })).bodyweight, null);

  const two: Record<string, NutritionDay> = {
    ...one,
    [days[days.length - 1]!]: { goals: {}, water: 0, creatine: 0, items: [], bodyWeight: 83 } as never,
  };
  const r = mesoReview(input({ history, nutrition: two }));
  assert.deepEqual(r.bodyweight, { from: 80, to: 83, delta: 3 });
  assert.ok(r.verdicts.some((v) => /Bodyweight up 3 kg/.test(v)));
});

test("the goal decides what counts as too much volume", () => {
  const history: Record<string, HistorySession> = {};
  for (const d of lastNDays(TODAY, 63)) history[d] = session("Bench", 80, 8, 2);
  const hyper = mesoReview(input({ history, goal: "hypertrophy" }));
  const maintain = mesoReview(input({ history, goal: "maintain" }));
  const h = hyper.volume.find((v) => v.label === "Chest")!;
  const m = maintain.volume.find((v) => v.label === "Chest")!;
  assert.equal(h.perWeek, m.perWeek, "the sets performed do not depend on the goal");
  assert.notEqual(h.tier, m.tier, "but the verdict on them does");
});

test("a well-run block gets a short answer rather than invented criticism", () => {
  const days = lastNDays(TODAY, 63).filter((_, i) => i % 3 === 0);
  const history: Record<string, HistorySession> = {};
  days.forEach((d, i) => { history[d] = session("Bench", 70 + i, 8, 2); });
  const r = mesoReview(input({ history }));
  assert.ok(r.verdicts.length >= 1);
  assert.ok(r.verdicts.every((v) => v.length < 240));
});
