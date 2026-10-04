import assert from "node:assert/strict";
import { test } from "node:test";
import { activityState } from "./routine-activity.ts";
import { completeStep, pauseRun, startRun, type Routine } from "./routine.ts";

const routine: Routine = {
  id: "r1",
  name: "Morning",
  windowSeconds: 600,
  color: "#ff9f0a",
  createdAt: 0,
  steps: [
    { id: "a", label: "Water", seconds: 60, source: "free" },
    { id: "b", label: "Stretch", seconds: 300, source: "free" },
  ],
};

test("the lock screen counts the current step down from its own dates", () => {
  const run = startRun(routine, 1_000_000);
  const s = activityState(routine, run, 1_010_000)!;
  assert.equal(s.stepLabel, "Water");
  assert.equal(s.nextLabel, "Stretch");
  assert.equal(s.stepStart, 1_000_000);
  assert.equal(s.stepEnd, 1_060_000);
  assert.equal(s.windowEnd, 1_600_000);
  assert.equal(s.paused, false);
});

test("the next step starts when the last one was finished", () => {
  const run = completeStep(routine, startRun(routine, 0), 45_000);
  const s = activityState(routine, run, 50_000)!;
  assert.equal(s.stepLabel, "Stretch");
  assert.equal(s.nextLabel, undefined);
  assert.equal(s.stepEnd, 45_000 + 300_000);
});

test("paused, the step is shown from where it stopped", () => {
  const run = pauseRun(startRun(routine, 0), 20_000);
  const s = activityState(routine, run, 50_000)!;
  assert.equal(s.paused, true);
  assert.equal(s.pausedLeft, 40);
  // The window moves out by the time spent paused.
  assert.equal(s.windowEnd, 600_000 + 30_000);
});

test("nothing to show without a run, or once it is over", () => {
  assert.equal(activityState(routine, null), null);
  const over = completeStep(routine, completeStep(routine, startRun(routine, 0), 1), 2);
  assert.equal(activityState(routine, over), null);
});
