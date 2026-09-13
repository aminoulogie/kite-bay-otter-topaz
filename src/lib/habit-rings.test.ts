import assert from "node:assert/strict";
import { test } from "node:test";
import { dashFor, ringFor, ringsFor, tally } from "./habit-rings.ts";
import type { Habit } from "./types.ts";

const DATE = "2026-09-13";

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Read",
  desc: "",
  color: "#5b8cff",
  goalDaysPerWeek: 7,
  history: {},
  ...over,
} as Habit);

// ---------------------------------------------------------------- plain --

test("a plain habit is empty or full, nothing between", () => {
  assert.equal(ringFor(habit(), DATE).fill, 0);
  assert.equal(ringFor(habit({ history: { [DATE]: true } }), DATE).fill, 1);
});

test("a plain habit's done follows the tick", () => {
  assert.equal(ringFor(habit({ history: { [DATE]: true } }), DATE).done, true);
  assert.equal(ringFor(habit({ history: { [DATE]: false } }), DATE).done, false);
  assert.equal(ringFor(habit(), DATE).done, false, "never touched is not done");
});

// ------------------------------------------------------------ checklist --

test("a checklist fills by repetitions, not by completed steps", () => {
  // One step needing three: brushing twice is two thirds of the day, and
  // counting steps would leave the ring empty until the third.
  const h = habit({
    steps: [{ id: "s1", name: "Brush", target: 3 }],
    stepLog: { [DATE]: { s1: 2 } },
  });
  const r = ringFor(h, DATE);
  assert.equal(Math.round(r.fill * 100), 67);
  assert.equal(r.done, false);
  assert.equal(r.detail, "2/3");
});

test("a checklist with every repetition done is closed", () => {
  const h = habit({
    steps: [
      { id: "s1", name: "Brush", target: 2 },
      { id: "s2", name: "Floss", target: 1 },
    ],
    stepLog: { [DATE]: { s1: 2, s2: 1 } },
  });
  const r = ringFor(h, DATE);
  assert.equal(r.fill, 1);
  assert.equal(r.done, true);
});

test("a checklist counts each step only up to its target", () => {
  // Six presses on a three-a-day step is still one day's worth.
  const h = habit({
    steps: [{ id: "s1", name: "Brush", target: 3 }],
    stepLog: { [DATE]: { s1: 6 } },
  });
  assert.equal(ringFor(h, DATE).fill, 1);
});

test("a checklist with no steps logged is empty rather than complete", () => {
  const h = habit({ steps: [{ id: "s1", name: "Brush", target: 3 }] });
  const r = ringFor(h, DATE);
  assert.equal(r.fill, 0);
  assert.equal(r.done, false);
});

// ----------------------------------------------------------------- ramp --

test("a ramp is met or not met, never part credit", () => {
  // Today's rung is the bar. Drawing 9/14 would claim partial credit exists.
  const ramp = { start: 1, target: 30, step: 1, from: DATE, unit: "min" as const, advance: "calendar" as const };
  const under = habit({ ramp, amountLog: { [DATE]: 0 } });
  const over = habit({ ramp, amountLog: { [DATE]: 5 } });
  assert.equal(ringFor(under, DATE).fill, 0);
  assert.equal(ringFor(over, DATE).fill, 1);
  assert.equal(ringFor(over, DATE).done, true);
});

// ---------------------------------------------------------------- lists --

test("a habit without an id is not drawn", () => {
  const rings = ringsFor([habit(), { ...habit({ id: "" }) }] as Habit[], DATE);
  assert.equal(rings.length, 1);
});

test("an empty list is an empty row, not a crash", () => {
  assert.deepEqual(ringsFor([], DATE), []);
  assert.deepEqual(ringsFor(undefined as unknown as Habit[], DATE), []);
  assert.deepEqual(tally([]), { done: 0, total: 0 });
});

test("the tally counts closed rings", () => {
  const rings = ringsFor(
    [habit({ id: "a", history: { [DATE]: true } }), habit({ id: "b" }), habit({ id: "c", history: { [DATE]: true } })],
    DATE,
  );
  assert.deepEqual(tally(rings), { done: 2, total: 3 });
});

test("a habit with no colour falls back rather than drawing nothing", () => {
  assert.ok(ringFor(habit({ color: "" }), DATE).color.length > 0);
});

// ----------------------------------------------------------------- dash --

test("an empty ring is offset by its whole circumference", () => {
  const { length, offset } = dashFor(0, 10);
  assert.equal(Math.round(length), 63);
  assert.equal(offset, length);
});

test("a full ring has no offset", () => {
  assert.equal(dashFor(1, 10).offset, 0);
});

test("a fill past one or below zero is clamped, not drawn backwards", () => {
  assert.equal(dashFor(5, 10).offset, 0);
  assert.equal(dashFor(-1, 10).offset, dashFor(0, 10).length);
  assert.equal(dashFor(Number.NaN, 10).offset, dashFor(0, 10).length);
});
