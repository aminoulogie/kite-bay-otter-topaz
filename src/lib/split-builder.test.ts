import assert from "node:assert/strict";
import { test } from "node:test";
import { PPL_WEEK, bucketOf, buildSplit } from "./split-builder.ts";
import { REST_DAY } from "./programs.ts";
import type { HistorySession } from "./types.ts";

const ex = (name: string, muscle: string) => ({ name, muscle, sets: [{ done: true }] });
const session = (...exs: ReturnType<typeof ex>[]) => ({ exercises: exs }) as unknown as HistorySession;

test("exercises sort into push, pull and legs", () => {
  assert.equal(bucketOf({ name: "Bench Press", muscle: "Chest" }), "push");
  assert.equal(bucketOf({ name: "Lateral Raise", muscle: "Shoulders" }), "push");
  assert.equal(bucketOf({ name: "Face Pull", muscle: "Shoulders" }), "pull");
  assert.equal(bucketOf({ name: "Barbell Curl", muscle: "Biceps" }), "pull");
  assert.equal(bucketOf({ name: "Romanian Deadlift", muscle: "Legs" }), "legs");
  assert.equal(bucketOf({ name: "Leg Curl", muscle: "Custom" }), "legs");
});

test("the most repeated exercises win, in the order they are usually done", () => {
  const history = {
    "2026-09-27": session(ex("Squat", "Legs"), ex("Leg Press", "Legs")),
    "2026-09-28": session(ex("Bench Press", "Chest"), ex("Triceps Pushdown", "Triceps")),
    "2026-09-29": session(ex("Pull-up", "Back"), ex("Barbell Row", "Back"), ex("Barbell Curl", "Biceps")),
    "2026-10-01": session(ex("Bench Press", "Chest"), ex("Overhead Press", "Shoulders")),
    "2026-10-02": session(ex("Squat", "Legs"), ex("Calf Raise", "Legs")),
  };
  const s = buildSplit(history, "2026-10-02", 2);
  assert.equal(s.sessions, 5);
  assert.deepEqual(s.days.legs, ["Squat", "Leg Press"]);
  assert.equal(s.days.push[0], "Bench Press");
  assert.equal(s.days.pull.length, 2);
});

test("the week: Saturday legs, then push, pull, legs…, Friday rest", () => {
  assert.equal(PPL_WEEK[6], "Legs");
  assert.equal(PPL_WEEK[0], "Push");
  assert.equal(PPL_WEEK[1], "Pull");
  assert.equal(PPL_WEEK[5], REST_DAY);
});
