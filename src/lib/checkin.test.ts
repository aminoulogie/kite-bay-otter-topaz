import assert from "node:assert/strict";
import { test } from "node:test";
import { checkinFor, openCount } from "./checkin.ts";
import type { Habit, NutritionDay } from "./types.ts";

const habit = (id: string, done: boolean) =>
  ({ id, name: id, history: done ? { "2026-10-02": true } : {} }) as unknown as Habit;

test("counts what is open, weight never counted", () => {
  const nutrition = { "2026-10-02": { items: [], planned: [{}, {}], creatine: 5 } } as unknown as Record<string, NutritionDay>;
  const s = checkinFor({
    date: "2026-10-02", nutrition, habits: [habit("a", true), habit("b", false)],
    session: null, restSaved: false, isTrainingDay: true,
  });
  assert.equal(s.sleep, true);
  assert.equal(s.creatine, false);
  assert.equal(s.habits.length, 1);
  assert.equal(s.planned, 2);
  assert.equal(s.workout, true);
  assert.equal(openCount(s), 1 + 1 + 2 + 1);
});

test("a saved rest day or a rest day in the plan is not an open workout", () => {
  const base = { date: "2026-10-02", nutrition: {}, habits: [], session: null };
  assert.equal(checkinFor({ ...base, restSaved: true, isTrainingDay: true }).workout, false);
  assert.equal(checkinFor({ ...base, restSaved: false, isTrainingDay: false }).workout, false);
});
