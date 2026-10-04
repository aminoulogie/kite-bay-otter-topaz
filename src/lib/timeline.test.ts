import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSlot, eventsFor, hhmm, layout, type TimelineEvent } from "./timeline.ts";
import type { HistorySession, TodoItem } from "./types.ts";

const todo = (id: string, slot?: TodoItem["slot"], done = false): TodoItem => ({
  id, text: `Task ${id}`, done, date: "2026-09-28", slot,
});

test("only to-dos placed on this day are on its timeline", () => {
  const ev = eventsFor("2026-09-28", [
    todo("a", { date: "2026-09-28", start: 13 * 60, mins: 30 }),
    todo("b", { date: "2026-09-29", start: 9 * 60, mins: 30 }),
    todo("c"),
  ]);
  assert.deepEqual(ev.map((e) => e.todoId), ["a"]);
  assert.equal(ev[0]!.start, 780);
  assert.equal(ev[0]!.end, 810);
});

test("a slot snaps to the quarter hour and stays inside the day", () => {
  assert.deepEqual(cleanSlot({ date: "d", start: 13 * 60 + 7, mins: 20 }), { date: "d", start: 780, mins: 15 });
  assert.equal(cleanSlot({ date: "d", start: 23 * 60 + 50, mins: 60 }).start, 23 * 60 + 45);
  assert.equal(cleanSlot({ date: "d", start: 23 * 60 + 45, mins: 60 }).mins, 15);
});

test("the day's workout is placed where it happened, ending when it was saved", () => {
  const end = new Date(2026, 8, 28, 19, 30).getTime();
  const session = { timestamp: end, durationFormatted: "75:00", split: "Push" } as HistorySession;
  const [w] = eventsFor("2026-09-28", [], session);
  assert.equal(w!.label, "Workout · Push");
  assert.equal(hhmm(w!.start), "18:15");
  assert.equal(hhmm(w!.end), "19:30");
});

test("overlapping events sit side by side; the next free one takes the full width", () => {
  const ev = (id: string, start: number, end: number): TimelineEvent => ({ id, kind: "todo", label: id, start, end });
  const placed = layout([ev("a", 540, 600), ev("b", 570, 630), ev("c", 700, 720)]);
  const by = Object.fromEntries(placed.map((p) => [p.id, p]));
  assert.equal(by.a!.columns, 2);
  assert.equal(by.b!.columns, 2);
  assert.notEqual(by.a!.column, by.b!.column);
  assert.equal(by.c!.columns, 1);
  assert.equal(by.c!.column, 0);
});
