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
  // Dinner 19:30 falls inside 16:30–20:15 and makes way.
  assert.deepEqual(meals.map((m) => `${m.time} ${m.label}`), [
    "08:30 Breakfast", "12:30 Lunch", "16:00 Snack", "17:00 Pre-workout", "19:45 Post-workout", "21:30 Evening",
  ]);
  assert.equal(meals.find((m) => m.label === "Pre-workout")?.share, 10);
  assert.equal(meals.find((m) => m.label === "Post-workout")?.share, 15);
});

test("no session leaves the meals alone", () => {
  assert.deepEqual(mealsAround(DEFAULT_MEAL_TIMES, null), DEFAULT_MEAL_TIMES);
});
