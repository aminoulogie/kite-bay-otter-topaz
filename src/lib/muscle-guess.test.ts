import assert from "node:assert/strict";
import { test } from "node:test";
import { guessMuscles, MUSCLE_KEYS } from "./muscle-guess.ts";

test("neck work is credited to the neck, not to biceps or triceps", () => {
  // "curl" and "extension" are also arm words; the neck rule has to win.
  for (const name of ["Neck Curl", "Plate Neck Extension", "Neck harness", "Lateral neck raise"]) {
    assert.deepEqual(guessMuscles(name).targetKeys, ["neck"], name);
  }
});

test("ordinary curls still go to biceps", () => {
  assert.equal(guessMuscles("Dumbbell Curl").muscle, "Biceps");
});

test("neck is a known muscle key", () => {
  assert.ok((MUSCLE_KEYS as readonly string[]).includes("neck"));
});
