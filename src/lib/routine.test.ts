import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_STEP_SECONDS, MIN_STEP_SECONDS, ON_TIME_SECONDS, clampStep, cleanRoutine, clock,
  completeStep, paceOf,
  driftSeconds, duration, elapsedMs, isFinished, isOverCommitted, pauseRun, plannedSeconds,
  resumeRun, skipStep, slackSeconds, spans, startRun, stepLeftSeconds, windowLeftSeconds,
  type Routine,
} from "./routine.ts";

const T0 = 1_700_000_000_000;

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: "r1",
  name: "Morning",
  windowSeconds: 20 * 60,
  color: "#5b8cff",
  createdAt: T0,
  steps: [
    { id: "s1", label: "Water", seconds: 60, source: "free" },
    { id: "s2", label: "Skincare", seconds: 300, source: "habit", refId: "h1" },
    { id: "s3", label: "Breakfast", seconds: 600, source: "habit", refId: "h2" },
  ],
  ...over,
});

// ------------------------------------------------------------- planning --

test("the plan is the sum of the steps, not the window", () => {
  assert.equal(plannedSeconds(routine()), 960);
  assert.equal(slackSeconds(routine()), 20 * 60 - 960);
  assert.equal(isOverCommitted(routine()), false);
});

test("steps adding to more than the window say so rather than stretching it", () => {
  // The same rule the day plan uses: a plan that cannot exist is reported,
  // never silently corrected.
  const r = routine({ windowSeconds: 300 });
  assert.equal(isOverCommitted(r), true);
  assert.ok(slackSeconds(r) < 0);
});

test("a step is never shorter than a thought or longer than an afternoon", () => {
  assert.equal(clampStep(0), MIN_STEP_SECONDS);
  assert.equal(clampStep(-9), MIN_STEP_SECONDS);
  assert.equal(clampStep(5), MIN_STEP_SECONDS);
  assert.equal(clampStep(999999), MAX_STEP_SECONDS);
  assert.equal(clampStep(90), 90);
  assert.equal(clampStep("abc"), MIN_STEP_SECONDS);
});

test("steps are laid out back to back and never scaled to fit", () => {
  // Squeezing a step to make the arithmetic work would be the app deciding
  // you can brush your teeth faster.
  const list = spans(routine({ windowSeconds: 120 }));
  assert.deepEqual(list.map((s) => s.startSeconds), [0, 60, 360]);
  assert.deepEqual(list.map((s) => s.endSeconds), [60, 360, 960]);
});

// ------------------------------------------------------------- running --

test("a fresh run starts at the first step with nothing done", () => {
  const run = startRun(routine(), T0);
  assert.equal(run.index, 0);
  assert.deepEqual(run.done, []);
  assert.equal(elapsedMs(run, T0), 0);
});

test("finishing a step advances and records it", () => {
  const r = routine();
  const run = completeStep(r, startRun(r, T0), T0 + 30_000);
  assert.equal(run.index, 1);
  assert.deepEqual(run.done, ["s1"]);
  assert.equal(run.stepStartedAt, T0 + 30_000);
});

test("a skipped step advances without being recorded as done", () => {
  // The difference the record depends on: a skipped step must not tick the
  // habit it stands for.
  const r = routine();
  const run = skipStep(r, startRun(r, T0), T0 + 5_000);
  assert.equal(run.index, 1);
  assert.deepEqual(run.done, []);
});

test("finishing past the last step is a no-op rather than a fourth step", () => {
  const r = routine();
  let run = startRun(r, T0);
  for (let i = 0; i < 3; i++) run = completeStep(r, run, T0);
  assert.equal(isFinished(r, run), true);
  const after = completeStep(r, run, T0);
  assert.equal(after.index, 3);
  assert.deepEqual(after.done, ["s1", "s2", "s3"]);
});

// ---------------------------------------------------------------- drift --

test("finishing early puts you ahead, and the number says by how much", () => {
  const r = routine();
  // Step one wanted 60s; done in 20.
  const run = completeStep(r, startRun(r, T0), T0 + 20_000);
  assert.equal(driftSeconds(r, run, T0 + 20_000), 40);
});

test("overrun is carried rather than absorbed by the next step", () => {
  // Three minutes on a one-minute step leaves you two minutes behind, and the
  // next step still gets its full five.
  const r = routine();
  const at = T0 + 180_000;
  const run = completeStep(r, startRun(r, T0), at);
  assert.equal(driftSeconds(r, run, at), -120);
  assert.equal(stepLeftSeconds(r, run, at), 300, "step two is untouched");
});

test("before anything is finished the plan wants you at zero", () => {
  const r = routine();
  const run = startRun(r, T0);
  assert.equal(driftSeconds(r, run, T0 + 10_000), -10);
});

test("the step clock goes negative rather than stopping at zero", () => {
  // Running out is information, not an event: the step is finished when you
  // say so, and until then the overrun is worth seeing.
  const r = routine();
  const run = startRun(r, T0);
  assert.equal(stepLeftSeconds(r, run, T0 + 90_000), -30);
});

test("the window clock counts the whole run, not the step", () => {
  const r = routine();
  const run = completeStep(r, startRun(r, T0), T0 + 60_000);
  assert.equal(windowLeftSeconds(r, run, T0 + 120_000), 20 * 60 - 120);
});

test("a second of drift is not news", () => {
  // Saying "0:01 behind" in red one second after you start is true and
  // useless: it teaches you to ignore the one number the screen is for.
  assert.equal(paceOf(0), "on-time");
  assert.equal(paceOf(1), "on-time");
  assert.equal(paceOf(-1), "on-time");
  assert.equal(paceOf(ON_TIME_SECONDS), "on-time");
  assert.equal(paceOf(-ON_TIME_SECONDS), "on-time");
  assert.equal(paceOf(ON_TIME_SECONDS + 1), "ahead");
  assert.equal(paceOf(-ON_TIME_SECONDS - 1), "behind");
});

// ---------------------------------------------------------------- pause --

test("a pause does not count as being behind", () => {
  const r = routine();
  let run = startRun(r, T0);
  run = pauseRun(run, T0 + 10_000);
  // Ten minutes of real time pass while paused.
  run = resumeRun(run, T0 + 610_000);
  assert.equal(Math.round(elapsedMs(run, T0 + 610_000) / 1000), 10);
});

test("a paused step does not read as overrun when it comes back", () => {
  const r = routine();
  let run = startRun(r, T0);
  run = pauseRun(run, T0 + 10_000);
  run = resumeRun(run, T0 + 610_000);
  assert.equal(stepLeftSeconds(r, run, T0 + 610_000), 50);
});

test("the clock stands still while paused", () => {
  const r = routine();
  const run = pauseRun(startRun(r, T0), T0 + 5_000);
  assert.equal(elapsedMs(run, T0 + 900_000), 5_000);
});

test("pausing twice or resuming a running run changes nothing", () => {
  const run = startRun(routine(), T0);
  const paused = pauseRun(run, T0 + 1000);
  assert.equal(pauseRun(paused, T0 + 2000), paused);
  assert.equal(resumeRun(run, T0 + 2000), run);
});

// --------------------------------------------------------------- format --

test("a countdown reads as minutes and seconds, negative included", () => {
  assert.equal(clock(90), "1:30");
  assert.equal(clock(5), "0:05");
  assert.equal(clock(-20), "-0:20");
  assert.equal(clock(0), "0:00");
});

test("a window reads in minutes, or hours once it is long", () => {
  assert.equal(duration(20 * 60), "20 min");
  assert.equal(duration(3600), "1h");
  assert.equal(duration(3900), "1h 05m");
  assert.equal(duration(-5), "0 min");
});

// ---------------------------------------------------------------- clean --

test("rubbish in storage does not become a routine", () => {
  for (const junk of [null, undefined, 7, "x", {}, { id: "" }]) {
    assert.equal(cleanRoutine(junk), null);
  }
});

test("a half-written routine is repaired rather than dropped", () => {
  const r = cleanRoutine({
    id: "x",
    steps: [{ id: "a", label: "go", seconds: -4 }, null, { label: "no id" }],
  })!;
  assert.equal(r.name, "Routine");
  assert.equal(r.windowSeconds, 20 * 60);
  assert.deepEqual(r.steps.map((s) => s.id), ["a"]);
  assert.equal(r.steps[0]!.seconds, MIN_STEP_SECONDS);
  assert.equal(r.steps[0]!.source, "free");
});

test("a window shorter than a minute is not a window", () => {
  assert.equal(cleanRoutine({ id: "x", windowSeconds: 5 })!.windowSeconds, 60);
});
