import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARC_START, ARC_SWEEP, DEFAULT_BOOKS_PER_YEAR, DEFAULT_GOAL_MIN, MAX_DAY_MIN, MAX_SESSION_MIN,
  arcD, bestStreak,
  bookGrid, clampMinutes, clockOf, elapsedMinutes, fractionOf, metOn, minutesOn, polar, streak,
  todayMinutes, wasLogged, weekMet, weekOf, type ReadingLog,
} from "./reading-goal.ts";

const G = DEFAULT_GOAL_MIN;
/** 2026-09-13 is a Sunday, which is the awkward end of a Monday-first week. */
const SUN = "2026-09-13";
const MON = "2026-09-07";

const run = (days: Record<string, number>): ReadingLog => days;

test("minutes are whole, never negative, never more than a day", () => {
  assert.equal(clampMinutes(30.4), 30);
  assert.equal(clampMinutes(-5), 0);
  assert.equal(clampMinutes(Number.NaN), 0);
  assert.equal(clampMinutes(99_999), MAX_DAY_MIN);
});

test("a day logged as zero is not the same as a day never logged", () => {
  const log = run({ [SUN]: 0 });
  assert.equal(minutesOn(log, SUN), 0);
  assert.equal(wasLogged(log, SUN), true);
  assert.equal(wasLogged(log, MON), false);
  assert.equal(minutesOn(log, MON), 0, "both read as zero minutes, but only one was recorded");
});

test("the goal is met at exactly the goal", () => {
  assert.equal(metOn(run({ [SUN]: 29 }), SUN, G), false);
  assert.equal(metOn(run({ [SUN]: 30 }), SUN, G), true);
  assert.equal(metOn(run({ [SUN]: 31 }), SUN, G), true);
});

test("a nonsense goal falls back rather than dividing by zero", () => {
  assert.equal(metOn(run({ [SUN]: 30 }), SUN, 0), true);
  assert.equal(metOn(run({ [SUN]: 5 }), SUN, Number.NaN), false);
  assert.equal(fractionOf(15, 0), 0.5);
});

test("a running timer is capped, because one left overnight was not reading", () => {
  const now = Date.now();
  assert.equal(elapsedMinutes(now - 20 * 60_000, now), 20);
  assert.equal(elapsedMinutes(now - 9 * 3600_000, now), MAX_SESSION_MIN);
  assert.equal(elapsedMinutes(null, now), 0);
  assert.equal(elapsedMinutes(undefined, now), 0);
  assert.equal(elapsedMinutes(now + 60_000, now), 0, "a clock that went backwards adds nothing");
});

test("today shows what is banked plus what the timer is holding", () => {
  const now = Date.now();
  const log = run({ [SUN]: 10 });
  assert.equal(todayMinutes(log, SUN, null, now), 10);
  assert.equal(todayMinutes(log, SUN, now - 5 * 60_000, now), 15);
});

test("an unfinished today does not break a run — the day is not over", () => {
  const log = run({ "2026-09-11": 40, "2026-09-12": 35 });
  assert.equal(streak(log, G, SUN), 2, "today untouched, yesterday and the day before counted");
});

test("meeting the goal today extends the run to include it", () => {
  const log = run({ "2026-09-11": 40, "2026-09-12": 35, [SUN]: 31 });
  assert.equal(streak(log, G, SUN), 3);
});

test("a missed day ends the run, and a blank one is a missed one", () => {
  const log = run({ "2026-09-10": 40, "2026-09-12": 35 });
  assert.equal(streak(log, G, SUN), 1, "only yesterday survives; the 11th was never logged");
});

test("a day short of the goal breaks it as surely as a blank one", () => {
  const log = run({ "2026-09-11": 40, "2026-09-12": 3 });
  assert.equal(streak(log, G, SUN), 0);
});

test("no log at all is no streak, not a crash", () => {
  assert.equal(streak(undefined, G, SUN), 0);
  assert.equal(streak({}, G, SUN), 0);
  assert.equal(bestStreak(undefined, G), 0);
});

test("the record is the longest run ever, wherever it sat", () => {
  const log = run({
    "2026-01-01": 40, "2026-01-02": 40, "2026-01-03": 40, "2026-01-04": 40,
    "2026-03-01": 40, "2026-03-02": 40,
  });
  assert.equal(bestStreak(log, G), 4);
});

test("the record ignores days that fell short", () => {
  const log = run({ "2026-01-01": 40, "2026-01-02": 5, "2026-01-03": 40 });
  assert.equal(bestStreak(log, G), 1);
});

test("a run that crosses a month boundary is still one run", () => {
  const log = run({ "2026-01-30": 40, "2026-01-31": 40, "2026-02-01": 40 });
  assert.equal(bestStreak(log, G), 3);
});

test("the week is Monday to Sunday, not the last seven days", () => {
  const week = weekOf({}, G, SUN, "en-GB");
  assert.equal(week.length, 7);
  assert.equal(week[0]?.date, "2026-09-07", "Monday");
  assert.equal(week[6]?.date, SUN, "and Sunday is last");
  assert.equal(week[6]?.isToday, true);
});

test("a Monday sits at the start of its own week, not the end of the last", () => {
  const week = weekOf({}, G, MON, "en-GB");
  assert.equal(week[0]?.date, MON);
  assert.equal(week[0]?.isToday, true);
  assert.equal(week[6]?.isFuture, true);
});

test("days after today are marked future rather than missed", () => {
  const week = weekOf({}, G, "2026-09-09", "en-GB");
  assert.equal(week.find((d) => d.date === "2026-09-10")?.isFuture, true);
  assert.equal(week.find((d) => d.date === "2026-09-08")?.isFuture, false);
});

test("the week counts only the days that hit the goal", () => {
  const week = weekOf(run({ "2026-09-07": 40, "2026-09-08": 5, [SUN]: 30 }), G, SUN, "en-GB");
  assert.equal(weekMet(week), 2);
});

test("the dial fills from nothing to full and stops there", () => {
  assert.equal(fractionOf(0, G), 0);
  assert.equal(fractionOf(15, G), 0.5);
  assert.equal(fractionOf(30, G), 1);
  assert.equal(fractionOf(300, G), 1, "an hour over the goal is still one full dial");
});

test("the dial is centred on the top", () => {
  assert.equal(ARC_START, -ARC_SWEEP / 2);
  const top = polar(100, 100, 50, 0);
  assert.equal(Math.round(top.x), 100);
  assert.equal(Math.round(top.y), 50);
  const right = polar(100, 100, 50, 90);
  assert.equal(Math.round(right.x), 150);
  assert.equal(Math.round(right.y), 100);
});

test("an arc with no sweep draws nothing at all", () => {
  assert.equal(arcD(100, 100, 50, 0, 0), "", "an arc whose ends meet renders as a dot or a circle");
  assert.equal(arcD(100, 100, 50, 0, -10), "");
  assert.ok(arcD(100, 100, 50, ARC_START, ARC_START + ARC_SWEEP).startsWith("M "));
});

test("an arc past a half turn sets the large-arc flag", () => {
  assert.ok(arcD(100, 100, 50, 0, 200).includes(" 0 1 1 "));
  assert.ok(arcD(100, 100, 50, 0, 90).includes(" 0 0 1 "));
});

test("the readout is minutes as hours and minutes", () => {
  assert.equal(clockOf(0), "0:00");
  assert.equal(clockOf(7), "0:07");
  assert.equal(clockOf(60), "1:00");
  assert.equal(clockOf(95), "1:35");
});

test("the book grid fills up to what was finished", () => {
  const g = bookGrid(3, 12);
  assert.equal(g.cells.length, 12);
  assert.equal(g.cells.filter((c) => c.done).length, 3);
  assert.equal(g.cells[0]?.n, 1);
});

test("the grid grows past the goal rather than punishing a good year", () => {
  const g = bookGrid(15, 12);
  assert.equal(g.cells.length, 15);
  assert.ok(g.cells.every((c) => c.done));
});

test("a nonsense goal falls back to the default rather than to nothing", () => {
  // Zero books a year is not a target, it is corrupt data — the picker's floor
  // is one — so it reads as "unset" and takes the default.
  assert.equal(bookGrid(0, 0).cells.length, DEFAULT_BOOKS_PER_YEAR);
  assert.equal(bookGrid(0, Number.NaN).cells.length, DEFAULT_BOOKS_PER_YEAR);
  assert.equal(bookGrid(0, 1).cells.length, 1, "one is a real target and is honoured");
  assert.ok(bookGrid(9999, 9999).cells.length <= 200, "and nothing renders ten thousand cells");
});
