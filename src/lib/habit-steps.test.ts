import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_TARGET, bump, bumpStep, hasSteps, newStepId, progress, setAll, setStep, setSteps,
  stepCount, stepDone, syncDay, targetLabel, targetOf,
} from "./habit-steps.ts";
import type { Habit, HabitStep } from "./types.ts";

const D = "2026-09-12";
const PREV = "2026-09-11";

const step = (id: string, name: string, target = 1): HabitStep => ({ id, name, target });

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Skincare",
  desc: "",
  color: "#fff",
  goalDaysPerWeek: 7,
  history: {},
  ...over,
});

const withSteps = (steps: HabitStep[], over: Partial<Habit> = {}) => habit({ steps, ...over });

test("a habit with no steps is left alone by every step helper", () => {
  const h = habit({ history: { [D]: true } });
  assert.equal(hasSteps(h), false);
  assert.equal(syncDay(h, D), h);
  assert.equal(setStep(h, D, "nope", 3), h);
  assert.deepEqual(progress(h, D), { done: 0, total: 0, reps: 0, repTarget: 0, complete: false });
});

test("a stepless habit still toggles through setAll, which is the plain case", () => {
  const h = habit();
  assert.equal(setAll(h, D, true).history[D], true);
  assert.equal(setAll(h, D, false).history[D], false);
});

test("the parent is not done until every step is", () => {
  let h = withSteps([step("a", "Face wash"), step("b", "Moisturiser")]);
  assert.equal(progress(h, D).complete, false);

  h = setStep(h, D, "a", 1);
  assert.equal(!!h.history[D], false, "one of two is not done");
  assert.equal(progress(h, D).done, 1);

  h = setStep(h, D, "b", 1);
  assert.equal(h.history[D], true, "both steps done ticks the habit");
});

test("un-ticking a step un-ticks the habit again", () => {
  let h = withSteps([step("a", "Floss"), step("b", "Brush", 3)]);
  h = setAll(h, D, true);
  assert.equal(h.history[D], true);

  h = setStep(h, D, "b", 2);
  assert.equal(h.history[D], false, "two brushes of three is not the day done");
  assert.equal(progress(h, D).reps, 3, "one floss and two brushes");
  assert.equal(progress(h, D).repTarget, 4);
});

test("a step with a target counts up and wraps back to none", () => {
  const brush = step("b", "Brush", 3);
  let h = withSteps([brush]);
  for (const expected of [1, 2, 3]) {
    h = bumpStep(h, D, "b");
    assert.equal(stepCount(h, D, "b"), expected);
  }
  assert.equal(h.history[D], true, "three of three completes it");

  h = bumpStep(h, D, "b");
  assert.equal(stepCount(h, D, "b"), 0, "past the target it clears rather than climbing");
  assert.equal(h.history[D], false);
});

test("bump is pure and respects the cap", () => {
  assert.equal(bump(0, 1), 1);
  assert.equal(bump(1, 1), 0);
  assert.equal(bump(2, 3), 3);
  assert.equal(bump(3, 3), 0);
  // A nonsense target behaves as once a day rather than throwing.
  assert.equal(bump(0, 0), 1);
  assert.equal(bump(0, Number.NaN), 1);
  assert.equal(bump(MAX_TARGET, 99), 0, "the cap is the real target");
});

test("counts are clamped to the target and never negative", () => {
  let h = withSteps([step("b", "Brush", 3)]);
  h = setStep(h, D, "b", 99);
  assert.equal(stepCount(h, D, "b"), 3);
  h = setStep(h, D, "b", -4);
  assert.equal(stepCount(h, D, "b"), 0);
});

test("a day with nothing done keeps no entry at all", () => {
  let h = withSteps([step("a", "Face wash")]);
  h = setStep(h, D, "a", 1);
  assert.ok(h.stepLog?.[D]);
  h = setStep(h, D, "a", 0);
  assert.equal(h.stepLog?.[D], undefined, "an empty day is removed, not left as {}");
});

test("each day stands on its own", () => {
  let h = withSteps([step("a", "Floss"), step("b", "Brush", 2)]);
  h = setAll(h, PREV, true);
  h = setStep(h, D, "a", 1);
  assert.equal(h.history[PREV], true);
  assert.equal(!!h.history[D], false);
  assert.equal(stepCount(h, PREV, "b"), 2);
  assert.equal(stepCount(h, D, "b"), 0);
});

test("setAll false wipes the day rather than writing zeroes", () => {
  let h = withSteps([step("a", "Floss")]);
  h = setAll(h, D, true);
  h = setAll(h, D, false);
  assert.equal(h.stepLog?.[D], undefined);
  assert.equal(h.history[D], false);
});

test("deleting the one undone step completes the days it was blocking", () => {
  let h = withSteps([step("a", "Face wash"), step("b", "SPF")]);
  h = setStep(h, D, "a", 1);
  assert.equal(!!h.history[D], false);

  h = setSteps(h, [step("a", "Face wash")]);
  assert.equal(h.history[D], true, "the day is done once the step it lacked is gone");
  assert.equal(h.stepLog?.[D]?.b, undefined, "and the dead step's counts go with it");
});

test("adding a step un-completes the days that carry counts, and only those", () => {
  let h = withSteps([step("a", "Face wash")], { history: { [PREV]: true } });
  h = setStep(h, D, "a", 1);
  assert.equal(h.history[D], true);

  h = setSteps(h, [step("a", "Face wash"), step("b", "Moisturiser")]);
  assert.equal(h.history[D], false, "today carries counts, so it is re-derived");
  assert.equal(h.history[PREV], true, "a day ticked before the checklist existed is left alone");
});

test("dropping every step leaves a plain habit with its earned days intact", () => {
  let h = withSteps([step("a", "Floss")]);
  h = setAll(h, D, true);
  h = setSteps(h, []);
  assert.equal(hasSteps(h), false);
  assert.equal(h.history[D], true);
  assert.equal(h.stepLog, undefined);
  // And it toggles like any other habit again.
  assert.equal(setAll(h, D, false).history[D], false);
});

test("blank step names are dropped", () => {
  const h = setSteps(withSteps([]), [step("a", "  "), step("b", " Floss ")]);
  assert.equal(h.steps?.length, 1);
  assert.equal(h.steps?.[0]?.name, "Floss");
});

test("a target is a whole number between one and the cap", () => {
  assert.equal(targetOf(step("a", "x", 0)), 1);
  assert.equal(targetOf(step("a", "x", -3)), 1);
  assert.equal(targetOf(step("a", "x", 2.7)), 2);
  assert.equal(targetOf(step("a", "x", 999)), MAX_TARGET);
  assert.equal(targetOf({ id: "a", name: "x" } as HabitStep), 1);
});

test("stepDone reads the capped target, not the raw field", () => {
  assert.equal(stepDone(step("a", "x", 99), MAX_TARGET), true);
  assert.equal(stepDone(step("a", "x", 3), 2), false);
});

test("the target is only labelled when it is more than once", () => {
  assert.equal(targetLabel(step("a", "Floss")), "");
  assert.equal(targetLabel(step("b", "Brush", 3)), "3×");
});

test("a step id that is not in the list changes nothing", () => {
  const h = withSteps([step("a", "Floss")]);
  assert.equal(setStep(h, D, "ghost", 1), h);
  assert.equal(bumpStep(h, D, "ghost"), h);
});

test("step ids are unique even within the same millisecond", () => {
  const ids = new Set(Array.from({ length: 50 }, () => newStepId()));
  assert.equal(ids.size, 50);
});

test("syncDay does not churn the object when nothing changed", () => {
  let h = withSteps([step("a", "Floss")]);
  h = setAll(h, D, true);
  assert.equal(syncDay(h, D), h, "already correct, so the same reference comes back");
});

test("a day nobody has touched is absent, not written as false", () => {
  let h = withSteps([step("a", "Floss")]);
  h = setStep(h, D, "a", 1);
  assert.deepEqual(Object.keys(h.history), [D], "only the day that was worked on is recorded");
  assert.equal(h.history[PREV], undefined);
});

test("corrupt counts in storage read as none rather than throwing", () => {
  const h = withSteps([step("a", "Floss")], {
    stepLog: { [D]: { a: Number.NaN as number } },
  });
  assert.equal(stepCount(h, D, "a"), 0);
  assert.equal(progress(h, D).complete, false);
});
