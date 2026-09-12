import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSUMED_KG, CLOCK_TRUST, MET_EASY, MET_HARD, MINUTES_PER_SET, SET_SECONDS, averageIntensity,
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

test("an hour of moderate lifting is a plausible figure, not a marathon", () => {
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set()), "60:00"), 80);
  // Twenty sets in an hour at 80kg. The literature puts a hypertrophy session
  // of this shape at roughly 150-300 kcal gross, not the ~700 the old flat
  // 6 kcal/min produced.
  assert.ok(b.gross > 140 && b.gross < 300, `gross was ${b.gross}`);
  assert.ok(b.net > 60 && b.net < 200, `net was ${b.net}`);
});

test("most of a session is rest, and it is billed as rest", () => {
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set()), "90:00"), 80);
  assert.equal(b.workMinutes, (20 * SET_SECONDS) / 60, "twenty sets is fifteen minutes of work");
  assert.ok(b.workMinutes < b.minutes / 4, "the clock is mostly standing about");
  // Billing the whole clock at the working MET is the error being fixed here.
  const naive = b.met * (3.5 / 200) * 80 * b.minutes;
  assert.ok(b.gross < naive * 0.6, `${b.gross} should be well under the flat ${Math.round(naive)}`);
});

test("a session with no rest at all is billed entirely as work", () => {
  // 8 sets imply 24 minutes, but only 6 of those are under tension; a clock
  // shorter than the work itself cannot produce more work than the clock.
  const b = sessionBurn(session(new Array(8).fill(0).map(() => set()), "3:00"), 80);
  assert.ok(b.workMinutes <= b.minutes);
});

test("the old formula's worst case is cut down to size", () => {
  // 20 sets, but the session sat open for four hours. The old maths billed
  // 240 minutes at 6 kcal/min and change; this bills ninety.
  const b = sessionBurn(session(new Array(20).fill(0).map(() => set()), "240:00"), 80);
  assert.equal(b.minutes, 90);
  assert.ok(b.net < 250, `net was ${b.net}`);
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
