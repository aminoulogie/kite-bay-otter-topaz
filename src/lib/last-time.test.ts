import assert from "node:assert/strict";
import { test } from "node:test";
import { agoLabel, formatSet, lastSetAt, lastTimeFor, summarise } from "./last-time.ts";
import type { HistorySession, WorkoutSet } from "./types.ts";

const set = (weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ weight, reps, done: true, type: "normal", ...extra }) as WorkoutSet;

const session = (sets: WorkoutSet[], name = "Bench Press", timestamp = 0): HistorySession =>
  ({ split: "Push", timestamp, exercises: [{ name, sets }] }) as unknown as HistorySession;

test("the whole of last time comes back, in order", () => {
  // Not just the top set: set two is decided by what set two was, and a 82.5
  // top set says nothing about the back-off that follows it.
  const h = { "2026-09-01": session([set(82.5, 8), set(80, 8), set(80, 7)]) };
  const last = lastTimeFor(h, "Bench Press");
  assert.equal(last?.date, "2026-09-01");
  assert.deepEqual(last?.sets.map((s) => s.weight), [82.5, 80, 80]);
});

test("the most recent session wins, by date not by timestamp", () => {
  // A backfilled session is stamped when it was TYPED. Ordering on timestamp
  // puts an entry typed today ahead of the session actually trained yesterday.
  const h = {
    "2026-09-01": session([set(80, 8)], "Bench Press", 5_000),
    "2026-09-06": session([set(85, 6)], "Bench Press", 1_000),
  };
  assert.equal(lastTimeFor(h, "Bench Press")?.date, "2026-09-06");
});

test("today does not become its own history", () => {
  const h = {
    "2026-09-01": session([set(80, 8)]),
    "2026-09-08": session([set(999, 1)]),
  };
  assert.equal(lastTimeFor(h, "Bench Press", "2026-09-08")?.date, "2026-09-01");
});

test("warm-ups are not offered as working weights", () => {
  const h = {
    "2026-09-01": session([set(20, 12, { type: "warmup" }), set(80, 8)]),
  };
  assert.deepEqual(lastTimeFor(h, "Bench Press")?.sets.map((s) => s.weight), [80]);
});

test("a set left unticked never happened", () => {
  const h = { "2026-09-01": session([set(80, 8), set(90, 1, { done: false })]) };
  assert.equal(lastTimeFor(h, "Bench Press")?.sets.length, 1);
});

test("a session with nothing completed is skipped, not returned empty", () => {
  const h = {
    "2026-09-01": session([set(80, 8)]),
    "2026-09-06": session([set(90, 5, { done: false })]),
  };
  assert.equal(lastTimeFor(h, "Bench Press")?.date, "2026-09-01");
});

test("the name is matched loosely enough to survive casing and spacing", () => {
  const h = { "2026-09-01": session([set(80, 8)], "Bench Press") };
  assert.ok(lastTimeFor(h, "  bench press  "));
  assert.equal(lastTimeFor(h, "Overhead Press"), null);
  assert.equal(lastTimeFor(h, "   "), null);
});

test("an exercise never done before has no last time", () => {
  assert.equal(lastTimeFor({}, "Bench Press"), null);
});

test("asking past the end of last time gives nothing, not a crash", () => {
  const last = lastTimeFor({ "2026-09-01": session([set(80, 8)]) }, "Bench Press");
  assert.equal(lastSetAt(last, 0)?.weight, 80);
  assert.equal(lastSetAt(last, 4), null);
  assert.equal(lastSetAt(null, 0), null);
  assert.equal(formatSet(null), "");
});

test("a set is shown the way it is spoken", () => {
  assert.equal(formatSet(set(82.5, 8)), "82.5 × 8");
  assert.equal(formatSet(set(0, 12)), "— × 12", "bodyweight has no weight, not zero");
  assert.equal(formatSet(set(0, 0)), "");
});

test("a long session is summarised rather than run off the card", () => {
  const sets = [set(80, 8), set(80, 8), set(75, 8), set(75, 7), set(70, 8)];
  assert.equal(summarise({ date: "2026-09-01", sets }), "80 × 8, 80 × 8, 75 × 8, 75 × 7 +1");
  assert.equal(summarise(null), "");
});

test("how long ago is said in days, not in dates", () => {
  assert.equal(agoLabel("2026-09-08", "2026-09-08"), "today");
  assert.equal(agoLabel("2026-09-07", "2026-09-08"), "yesterday");
  assert.equal(agoLabel("2026-09-02", "2026-09-08"), "6 days ago");
  assert.equal(agoLabel("2026-08-18", "2026-09-08"), "3 weeks ago");
  assert.equal(agoLabel("2026-06-08", "2026-09-08"), "3 months ago");
});
