import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_VALUE, atGoal, bumpSizes, clampValue, daysBetween, daysRemaining, formatAmount, goalDate,
  isBuild, meets, rungAfter, rungLabel, rungOn, status, totalRungs,
  type AmountLog, type HabitRamp,
} from "./habit-ramp.ts";

const FROM = "2026-09-13";
const day = (n: number) => {
  const d = new Date(2026, 8, 13 + n, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const build: HabitRamp =
  { start: 1, target: 30, step: 1, from: FROM, unit: "min", advance: "earned" };
const quit: HabitRamp =
  { start: 120, target: 0, step: 1, from: FROM, unit: "min", advance: "earned" };

/** A log where every listed day was made exactly at its rung. */
const made = (pairs: Record<number, number>): AmountLog =>
  Object.fromEntries(Object.entries(pairs).map(([n, v]) => [day(Number(n)), v]));

test("direction comes from the target, not a flag that could disagree", () => {
  assert.equal(isBuild(build), true);
  assert.equal(isBuild(quit), false);
  assert.equal(isBuild({ ...build, target: build.start }), true, "standing still counts as building");
});

test("day one asks for the starting number, both directions", () => {
  assert.equal(rungOn(build, FROM, {}), 1);
  assert.equal(rungOn(quit, FROM, {}), 120);
});

test("a day before the ramp began still shows the start", () => {
  assert.equal(rungOn(build, day(-5), {}), 1);
  assert.equal(daysBetween(FROM, day(-5)), -5);
});

test("building, the number is a floor; quitting, it is a ceiling", () => {
  assert.equal(meets(build, 5, 5), true);
  assert.equal(meets(build, 5, 4), false);
  assert.equal(meets(quit, 5, 5), true);
  assert.equal(meets(quit, 5, 6), false);
  assert.equal(meets(quit, 5, 0), true, "zero is the best possible day on a quit");
  assert.equal(meets(build, 5, 0), false);
});

test("a blank day is not a pass, in either direction", () => {
  assert.equal(meets(build, 5, undefined), false);
  assert.equal(meets(quit, 5, undefined), false, "not logging must not read as abstinence");
  assert.equal(meets(quit, 5, Number.NaN), false);
});

test("earned: making each day climbs a rung a day", () => {
  const log = made({ 0: 1, 1: 2, 2: 3 });
  assert.equal(rungOn(build, day(1), log), 2);
  assert.equal(rungOn(build, day(2), log), 3);
  assert.equal(rungOn(build, day(3), log), 4);
});

test("earned: a missed day holds the ladder where it is — the whole point", () => {
  // Made day 0, missed day 1 entirely, then came back.
  const log = made({ 0: 1 });
  assert.equal(rungOn(build, day(1), log), 2, "day two asks for two");
  assert.equal(rungOn(build, day(2), log), 2, "day three still asks for two, not three");
  assert.equal(rungOn(build, day(30), log), 2, "a month away does not put it out of reach");
});

test("earned, quitting: a blown ceiling holds rather than retreating", () => {
  const log = made({ 0: 120, 1: 300 });
  assert.equal(rungOn(quit, day(1), log), 119);
  assert.equal(rungOn(quit, day(2), log), 119, "the bad day cost a rung, it did not add one back");
  assert.ok(rungOn(quit, day(2), log) <= quit.start, "and it never climbs back above the start");
});

test("calendar mode moves whether or not you showed up", () => {
  const cal: HabitRamp = { ...build, advance: "calendar" };
  assert.equal(rungOn(cal, day(5), {}), 6);
  assert.equal(rungOn(cal, day(5), made({ 0: 1 })), 6);
});

test("the ladder stops at the target and does not overshoot", () => {
  assert.equal(rungAfter(build, 1000), 30);
  assert.equal(rungAfter(quit, 1000), 0);
  assert.equal(rungOn({ ...build, advance: "calendar" }, day(999), {}), 30);
  assert.equal(rungOn({ ...quit, advance: "calendar" }, day(999), {}), 0);
});

test("a quit ramp never goes below zero into nonsense", () => {
  assert.ok(rungAfter(quit, 500) >= 0);
  assert.equal(atGoal(quit, 0), true);
  assert.equal(atGoal(build, 30), true);
  assert.equal(atGoal(build, 29), false);
});

test("the climb is as long as the distance divided by the step", () => {
  assert.equal(totalRungs(build), 29);
  assert.equal(totalRungs(quit), 120);
  assert.equal(totalRungs({ ...quit, step: 5 }), 24);
  assert.equal(totalRungs({ ...quit, step: 7 }), 18, "a remainder rounds up, not down");
});

test("a zero step is a ladder with no rungs rather than a division by zero", () => {
  const stuck: HabitRamp = { ...build, step: 0 };
  assert.equal(totalRungs(stuck), 0);
  assert.equal(rungOn(stuck, day(9), {}), 1);
  assert.equal(status(stuck, day(9), {}).earned, 0);
});

test("status reports today's rung, what was logged, and whether it landed", () => {
  const log = made({ 0: 1, 1: 2 });
  const s = status(build, day(2), log);
  assert.equal(s.rung, 3);
  assert.equal(s.logged, undefined);
  assert.equal(s.done, false);
  assert.equal(s.earned, 2);
  assert.equal(s.total, 29);
  assert.equal(s.finished, false);
});

test("a day logged at exactly the rung is done", () => {
  const log = made({ 0: 1, 1: 2, 2: 3 });
  assert.equal(status(build, day(2), log).done, true);
});

test("zero logged on a quit day is a made day, not a blank one", () => {
  const log = { [day(0)]: 0 };
  const s = status(quit, day(0), log);
  assert.equal(s.logged, 0);
  assert.equal(s.done, true, "a clean day must not be mistaken for an empty one");
});

test("finishing is reported once the rung reaches the target", () => {
  const cal: HabitRamp = { ...quit, advance: "calendar" };
  assert.equal(status(cal, day(500), {}).finished, true);
  assert.equal(status(cal, day(500), {}).rung, 0);
});

test("what is left counts rungs, not days on the calendar", () => {
  const log = made({ 0: 120, 1: 119 });
  assert.equal(daysRemaining(quit, day(2), log), 118);
  assert.equal(goalDate(quit, day(2), log), day(120));
});

test("minutes read as hours and minutes once they are long enough", () => {
  assert.equal(formatAmount(119, "min"), "1h 59m");
  assert.equal(formatAmount(120, "min"), "2h");
  assert.equal(formatAmount(45, "min"), "45m");
  assert.equal(formatAmount(0, "min"), "0m");
  assert.equal(formatAmount(1, "page"), "1 page");
  assert.equal(formatAmount(12, "page"), "12 pages");
  assert.equal(formatAmount(8, "count"), "8");
});

test("the rung reads as a floor or a ceiling, never ambiguously", () => {
  assert.equal(rungLabel(build, 3), "3m or more");
  assert.equal(rungLabel(quit, 119), "1h 59m or less");
});

test("a logged amount cannot be negative or absurd", () => {
  assert.equal(clampValue(-5), 0);
  assert.equal(clampValue(1e9), MAX_VALUE);
  assert.equal(clampValue(Number.NaN), 0);
  assert.equal(clampValue(3.6), 4);
});

test("the bump buttons suit the unit", () => {
  assert.deepEqual(bumpSizes("min"), [1, 5, 15]);
  assert.deepEqual(bumpSizes("page"), [1, 5, 10]);
});

test("the six-year case: a long lapse costs nothing but the days themselves", () => {
  // Two good weeks, then a month gone, then back.
  const log: AmountLog = {};
  for (let i = 0; i < 14; i++) log[day(i)] = 120 - i;
  const before = rungOn(quit, day(14), log);
  const after = rungOn(quit, day(45), log);
  assert.equal(before, 106);
  assert.equal(after, 106, "the ceiling waited where it was left");
});
