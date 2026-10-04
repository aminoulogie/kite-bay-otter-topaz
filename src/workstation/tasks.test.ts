import assert from "node:assert/strict";
import { test } from "node:test";
import type { TodoItem } from "../lib/types.ts";
import { filterTasks, minuteAt, weekOf } from "./tasks.ts";

const T = "2026-10-07"; // a Wednesday
const todo = (o: Partial<TodoItem>): TodoItem => ({ id: Math.random().toString(36), text: "x", done: false, date: T, ...o });

test("filters", () => {
  const list = [
    todo({ text: "today" }),
    todo({ text: "old day", date: "2026-10-01" }),
    todo({ text: "week", scope: "week", date: "2026-10-05" }),
    todo({ text: "scheduled today", date: "2026-10-01", slot: { date: T, start: 600, mins: 60 } }),
    todo({ text: "deadline", date: "2026-10-01", due: "2026-10-09" }),
    todo({ text: "done", done: true }),
    todo({ text: "cleared", cleared: true }),
  ];
  assert.deepEqual(filterTasks(list, "today", T).map((t) => t.text), ["today", "scheduled today"]);
  assert.deepEqual(filterTasks(list, "week", T).map((t) => t.text), ["week"]);
  assert.deepEqual(filterTasks(list, "due", T).map((t) => t.text), ["deadline"]);
  assert.equal(filterTasks(list, "open", T).length, 5);
  assert.deepEqual(filterTasks(list, "done", T).map((t) => t.text), ["done"]);
});

test("week and snapping", () => {
  assert.deepEqual(weekOf("2026-10-05"), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(minuteAt(100, 40, 6), 6 * 60 + 150);
  assert.equal(minuteAt(-50, 40, 0), 0);
});
