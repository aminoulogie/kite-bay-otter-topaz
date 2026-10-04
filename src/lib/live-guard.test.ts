import assert from "node:assert/strict";
import { test } from "node:test";
import { liveIsUntouched, withRescue } from "./live-guard.ts";

const ex = (name: string, done = false, weight = 60) => ({ name, sets: [{ weight, reps: 10, done }] }) as never;

test("an empty sheet is the app's to replace", () => {
  assert.equal(liveIsUntouched({ exercises: [], undoStack: [] }), true);
});

test("the template exactly as loaded is the app's to replace", () => {
  const exercises = [ex("Bench Press")];
  assert.equal(liveIsUntouched({ exercises, undoStack: [], pristine: JSON.stringify(exercises) }), true);
});

test("exercises typed in but not ticked are the user's", () => {
  // The bug: two exercises logged, no set ticked yet, replaced by the
  // programme's template on the next launch.
  const pristine = JSON.stringify([ex("Bench Press")]);
  assert.equal(liveIsUntouched({ exercises: [ex("Squat"), ex("Leg Press")], undoStack: [], pristine }), false);
  assert.equal(liveIsUntouched({ exercises: [ex("Bench Press", false, 80)], undoStack: [], pristine }), false);
});

test("a ticked set is always the user's", () => {
  const exercises = [ex("Bench Press", true)];
  assert.equal(liveIsUntouched({ exercises, undoStack: [], pristine: JSON.stringify(exercises) }), false);
});

test("a sheet from before pristine existed is not assumed empty", () => {
  assert.equal(liveIsUntouched({ exercises: [ex("Squat")], undoStack: [] }), false);
});

test("replacing the user's sheet puts it one Undo away", () => {
  const old = { exercises: [ex("Squat")], undoStack: ["older"] };
  const next = withRescue({ undoStack: [] as string[], split: "Push" }, old);
  assert.deepEqual(next.undoStack, ["older", JSON.stringify(old.exercises)]);
  assert.equal(next.split, "Push");
});

test("replacing an untouched sheet keeps its undo history as it was", () => {
  const next = withRescue({ undoStack: [] as string[] }, { exercises: [], undoStack: ["rescued"] });
  assert.deepEqual(next.undoStack, ["rescued"]);
});
