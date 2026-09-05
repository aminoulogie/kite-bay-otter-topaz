import assert from "node:assert/strict";
import { test } from "node:test";
import { exerciseKey } from "./exercise-key.ts";

/**
 * The Database showed imported history and app history as separate exercises,
 * so workouts logged in the app looked like they had never been recorded.
 */

test("the two vocabularies for one exercise share a key", () => {
  const same: [string, string][] = [
    ["Leg Extensions", "Leg Extension"],
    ["Pec Deck Fly (Machine)", "Pec Deck Fly"],
    ["Lat Pulldown (Wide/Neutral)", "Lat Pulldown"],
    ["Cable Triceps Pushdown (Straight/V)", "Cable Triceps Pushdown"],
    ["Hammer Curl (Dumbbell/Cable)", "Hammer Curl"],
    ["Seated Cable Row (Wide)", "Seated Cable Row"],
    ["Barbell Bent-Over Row", "Barbell Bent Over Row"],
    ["Single-Arm Dumbbell Row", "Single Arm Dumbbell Row"],
  ];
  for (const [a, b] of same) {
    assert.equal(exerciseKey(a), exerciseKey(b), `${a} should match ${b}`);
  }
});

test("different lifts keep different keys", () => {
  // The failure mode of a looser normaliser: these differ only by a word, and
  // merging them would average two genuinely different loads into one line.
  const distinct: [string, string][] = [
    ["Seated Leg Curl", "Lying Leg Curl"],
    ["Incline Dumbbell Press", "Flat Dumbbell Press"],
    ["Leg Extension", "Leg Press"],
    ["Seated Calf Raise Machine", "Standing Machine Calf Raise"],
    ["Barbell Deadlift", "Romanian Deadlift"],
    ["Bodyweight Chest Dips", "Weighted Chest Dips"],
  ];
  for (const [a, b] of distinct) {
    assert.notEqual(exerciseKey(a), exerciseKey(b), `${a} must not match ${b}`);
  }
});

test("a plural is folded only at the end of a word", () => {
  // Not mid-word: stripping every "s" turns "Press" into "Pres" and quietly
  // reshapes half the catalogue.
  assert.equal(exerciseKey("Press"), "pres");
  assert.equal(exerciseKey("Shoulder Press"), "shoulder pres");
  assert.equal(exerciseKey("Presses"), exerciseKey("Presse"));
});
