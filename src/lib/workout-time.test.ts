import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MEAL_TIMES } from "./meal-pace.ts";
import { mealsAround, workoutSlot } from "./workout-time.ts";

// 2026-10-05 is a Monday.
test("a training day uses the weekday time, else the default", () => {
  const s = { time: "18:00", mins: 75, days: { 1: "07:00" } };
  assert.deepEqual(workoutSlot("2026-10-05", s, false), { date: "2026-10-05", start: 420, end: 495, time: "07:00" });
  assert.equal(workoutSlot("2026-10-06", s, false)?.time, "18:00");
});

test("rest days have no session unless one is set for the date", () => {
  assert.equal(workoutSlot("2026-10-06", { time: "18:00", mins: 60 }, true), null);
  assert.equal(workoutSlot("2026-10-06", { time: "18:00", mins: 60, dates: { "2026-10-06": "10:00" } }, true)?.time, "10:00");
  assert.equal(workoutSlot("2026-10-07", { time: "18:00", mins: 60, dates: { "2026-10-07": "" } }, false), null);
});

test("meals around an evening session", () => {
  const slot = workoutSlot("2026-10-05", { time: "18:00", mins: 75 }, false);
  const meals = mealsAround(DEFAULT_MEAL_TIMES, slot);
  // The 16:00 snack and 19:30 dinner fall inside 16:00–20:15 and make way.
  assert.deepEqual(meals.map((m) => `${m.time} ${m.label}`), [
    "08:30 Breakfast", "12:30 Lunch", "17:00 Pre-workout", "19:45 Post-workout", "21:30 Evening",
  ]);
  assert.equal(meals.find((m) => m.label === "Pre-workout")?.share, 16);
  assert.equal(meals.find((m) => m.label === "Post-workout")?.share, 24);
});

test("no session leaves the meals alone", () => {
  assert.deepEqual(mealsAround(DEFAULT_MEAL_TIMES, null), DEFAULT_MEAL_TIMES);
});

// ------------------------------------------ the gym trigger: a logged set --

import { hhmmOf, minutesAt, savedStart, startedSlot } from "./workout-time.ts";

const slot = (start: number, end: number) => ({ date: "2026-10-06", start, end, time: hhmmOf(start) });

test("without a logged set the plan stands", () => {
  const planned = slot(18 * 60, 19 * 60 + 15);
  assert.deepEqual(startedSlot(planned, null), planned);
  assert.equal(startedSlot(null, 19 * 60), null);
});

test("one logged set moves the session to when it really started", () => {
  // Planned 18:00 for 75 minutes; first set at 19:30.
  const moved = startedSlot(slot(18 * 60, 19 * 60 + 15), 19 * 60 + 30)!;
  assert.equal(moved.time, "19:30");
  assert.equal(moved.start, 19 * 60 + 30);
  assert.equal(moved.end, 19 * 60 + 30 + 75, "the planned length is kept while it runs");
});

test("the meals move with it — that is the point", () => {
  const times = [
    { label: "Breakfast", time: "08:00", share: 25 },
    { label: "Lunch", time: "13:00", share: 35 },
    { label: "Dinner", time: "19:00", share: 40 },
  ];
  const planned = slot(18 * 60, 19 * 60 + 15);
  const onPlan = mealsAround(times, planned);
  const onReal = mealsAround(times, startedSlot(planned, 19 * 60 + 30));

  const pre = (l: { label: string; time: string }[]) => l.find((t) => t.label === "Pre-workout")!.time;
  const post = (l: { label: string; time: string }[]) => l.find((t) => t.label === "Post-workout")!.time;
  assert.equal(pre(onPlan), "17:00");
  assert.equal(post(onPlan), "19:45");
  assert.equal(pre(onReal), "18:30", "an hour before the real start");
  assert.equal(post(onReal), "21:15", "half an hour after the real finish");
});

test("the share of the day moves with the meals, not just the clock", () => {
  // Dinner at 19:00 is inside a 19:30 session's window but outside an 18:00
  // one's, so the same day splits its calories differently.
  const times = [
    { label: "Lunch", time: "13:00", share: 50 },
    { label: "Dinner", time: "19:00", share: 50 },
  ];
  const early = mealsAround(times, slot(12 * 60, 13 * 60));
  const late = mealsAround(times, slot(19 * 60 + 30, 20 * 60 + 45));
  assert.ok(early.some((t) => t.label === "Lunch") === false, "lunch is swallowed by a midday session");
  assert.ok(late.some((t) => t.label === "Lunch"), "lunch survives an evening session");
  assert.ok(!late.some((t) => t.label === "Dinner"), "dinner is swallowed by the evening session");
});

test("a start outside the day is clamped rather than wrapping", () => {
  assert.equal(startedSlot(slot(18 * 60, 19 * 60), -30)!.start, 0);
  assert.equal(startedSlot(slot(18 * 60, 19 * 60), 5000)!.start, 1439);
  assert.equal(startedSlot(slot(18 * 60, 19 * 60), 1430, 120)!.end, 1439, "the end never leaves the day");
});

test("a saved session gives back the first set to the minute", () => {
  // The duration clock runs from the first set to the moment Save is pressed,
  // and the timestamp IS that moment, so this is exact rather than an
  // estimate — however long afterwards the save happened.
  const first = new Date("2026-10-06T19:30:00");
  const saved = new Date("2026-10-06T20:47:00");
  assert.equal(
    savedStart({ timestamp: saved.getTime(), durationFormatted: "77:00" }),
    minutesAt(first.getTime()),
  );
});

test("a duration is minutes and seconds, not hours and minutes", () => {
  // "90:30" is ninety minutes, and reading it as 90 hours would file the
  // session four days early.
  const at = new Date("2026-10-06T20:00:00").getTime();
  const start = savedStart({ timestamp: at, durationFormatted: "90:30" })!;
  assert.equal(start, minutesAt(at - 90 * 60000));
});

test("a session with no usable record leaves the plan alone", () => {
  assert.equal(savedStart(undefined), null);
  assert.equal(savedStart({ timestamp: 0, durationFormatted: "10:00" }), null);
  assert.equal(savedStart({ timestamp: Date.now() }), null);
  assert.equal(savedStart({ timestamp: Date.now(), durationFormatted: "rubbish" }), null);
});
