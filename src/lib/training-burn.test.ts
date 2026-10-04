import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSUMED_KG, CLOCK_TRUST, MET_EASY, MET_HARD, MINUTES_PER_SET, averageIntensity,
  credibleMinutes, eatBack, metFor, minutesFrom, sessionBurn,
} from "./training-burn.ts";
import type { HistorySession, WorkoutSet } from "./types.ts";

const set = (over: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ weight: 60, reps: 10, failure: 3, done: true, type: "working", ...over }) as WorkoutSet;

const session = (
  sets: WorkoutSet[],
  durationFormatted = "60:00",
): Pick<HistorySession, "exercises" | "totalSets" | "durationFormatted"> => ({
  exercises: [{ sets } as HistorySession["exercises"][number]],
  totalSets: sets.filter((s) => s.done).length,
  durationFormatted,
});

test("a duration string reads back as minutes", () => {
  assert.equal(minutesFrom("45:30"), 45.5);
  assert.equal(minutesFrom("60:00"), 60);
  assert.equal(minutesFrom("0:45"), 0.75);
  assert.equal(minutesFrom("120:00"), 120);
});

test("an unreadable duration is zero, not a guess", () => {
  for (const bad of ["", undefined, "1h 5m", "45", "45:99", "abc"]) {
    assert.equal(minutesFrom(bad as string), 0, String(bad));
  }
});

test("the clock is believed while the sets back it up", () => {
  // 20 sets imply 60 minutes, so a 75-minute session passes through whole.
  assert.equal(credibleMinutes(75, 20), 75);
});

test("a session left open is billed at what the sets imply, not the clock", () => {
  // 20 sets imply 60 minutes; four hours on the clock is a phone left on.
  assert.equal(credibleMinutes(240, 20), 20 * MINUTES_PER_SET * CLOCK_TRUST);
});

test("no sets means no session, whatever the clock says", () => {
  assert.equal(credibleMinutes(90, 0), 0);
});

test("a missing clock falls back to what the sets imply", () => {
  assert.equal(credibleMinutes(0, 20), 60);
});

test("intensity averages only the sets actually done", () => {
  assert.equal(averageIntensity(session([set({ failure: 5 }), set({ failure: 1 })])), 3);
  assert.equal(
    averageIntensity(session([set({ failure: 5 }), set({ failure: 1, done: false })])),
    5,
    "a set that was never done does not dilute the average",
  );
  assert.equal(averageIntensity({ exercises: [] }), 3, "nothing logged reads as moderate");
});

test("intensity maps across the resistance-training MET range", () => {
  assert.equal(metFor(1), MET_EASY);
  assert.equal(metFor(5), MET_HARD);
  assert.equal(metFor(3), (MET_EASY + MET_HARD) / 2);
  assert.equal(metFor(99), MET_HARD, "out of range is clamped, not extrapolated");
  assert.equal(metFor(Number.NaN), metFor(3));
});

test("net is always below gross, by exactly the resting cost", () => {
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set()), "60:00"), 80);
  assert.ok(b.net < b.gross);
  // One MET over 60 minutes at 80kg is the difference.
  assert.equal(b.gross - b.net, Math.round(1 * (3.5 / 200) * 80 * 60));
});

test("an hour of lifting is what the Compendium says, not a marathon", () => {
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set()), "60:00"), 80);
  // Twenty sets in an hour at 80kg, taken moderately hard: the Compendium's
  // 3.5–6 METs over the whole hour is 294–504 kcal gross. The old flat
  // 6 kcal/min with its volume bonus said ~470 on an uncapped clock.
  assert.ok(b.gross >= 294 && b.gross <= 504, `gross was ${b.gross}`);
  assert.ok(b.net > 200 && b.net < 420, `net was ${b.net}`);
});

test("the MET is a whole-session average, rests included", () => {
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set()), "60:00"), 80);
  assert.equal(b.gross, Math.round(metFor(3) * (3.5 / 200) * 80 * 60));
});

test("a session with no rest at all is billed entirely as work", () => {
  // 8 sets imply 24 minutes, but only 6 of those are under tension; a clock
  // shorter than the work itself cannot produce more work than the clock.
  const b = sessionBurn(session(new Array(8).fill(0).map(() => set()), "3:00"), 80);
  assert.ok(b.workMinutes <= b.minutes);
});

test("a session left open is billed for what the sets support, not the clock", () => {
  // 20 sets, but the session sat open for four hours: ninety minutes billed.
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set()), "240:00"), 80);
  assert.equal(b.minutes, 90);
  assert.ok(b.gross < 700, `gross was ${b.gross}`);
});

test("a heavier lifter burns more for the same session", () => {
  const light = sessionBurn(session(new Array(20).fill(0).map(() => set())), 60);
  const heavy = sessionBurn(session(new Array(20).fill(0).map(() => set())), 100);
  assert.ok(heavy.net > light.net);
});

test("no bodyweight recorded still gives a figure rather than zero", () => {
  const b = sessionBurn(session(new Array(10).fill(0).map(() => set())));
  const same = sessionBurn(session(new Array(10).fill(0).map(() => set())), ASSUMED_KG);
  assert.ok(b.net > 0);
  assert.deepEqual(b, same);
  assert.deepEqual(sessionBurn(session(new Array(10).fill(0).map(() => set())), 0), same);
});

test("harder sets cost more than easy ones", () => {
  const easy = sessionBurn(session(new Array(20).fill(0).map(() => set({ failure: 1 }))), 80);
  const hard = sessionBurn(session(new Array(20).fill(0).map(() => set({ failure: 5 }))), 80);
  assert.ok(hard.net > easy.net);
});

test("no session at all is no burn, and does not throw", () => {
  const none = { gross: 0, net: 0, minutes: 0, met: 0, workMinutes: 0 };
  assert.deepEqual(sessionBurn(undefined), none);
  assert.deepEqual(sessionBurn(null), none);
  assert.deepEqual(sessionBurn(session([], "60:00")), none);
});

test("eating back takes the net figure, and nothing when switched off", () => {
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set())), 80);
  assert.equal(eatBack(b, true), b.net);
  assert.equal(eatBack(b, false), 0);
});
