import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REST_DAY, emptyWeek, makeProgram, normaliseWeek, reorder, splitForDate,
  trainingDaysPerWeek,
} from "./programs.ts";

const PPLULR = makeProgram({
  name: "PPLULR", kind: "cycle", anchor: "2026-01-01",
  days: ["Push", "Pull", "Legs", "Upper", "Lower", REST_DAY],
});

test("a cycle repeats every N days regardless of the week", () => {
  assert.equal(splitForDate(PPLULR, new Date(2026, 0, 1)), "Push");
  assert.equal(splitForDate(PPLULR, new Date(2026, 0, 3)), "Legs");
  assert.equal(splitForDate(PPLULR, new Date(2026, 0, 6)), REST_DAY);
  // Day 7 wraps back to the start.
  assert.equal(splitForDate(PPLULR, new Date(2026, 0, 7)), "Push");
});

test("dates before the anchor do not read off the end of the array", () => {
  // A plain % returns a negative index here, which silently gave every past
  // day the wrong split.
  const before = splitForDate(PPLULR, new Date(2025, 11, 31));
  assert.ok(PPLULR.days.includes(before), `got ${before}`);
  assert.equal(before, REST_DAY);
});

test("a week programme is pinned to weekdays", () => {
  const week = makeProgram({
    name: "Mon/Wed/Fri", kind: "week",
    days: [REST_DAY, "Push", REST_DAY, "Pull", REST_DAY, "Legs", REST_DAY],
  });
  // 2026-01-05 is a Monday.
  assert.equal(splitForDate(week, new Date(2026, 0, 5)), "Push");
  assert.equal(splitForDate(week, new Date(2026, 0, 7)), "Pull");
  assert.equal(splitForDate(week, new Date(2026, 0, 4)), REST_DAY); // Sunday
});

test("unassigned days become rest, not holes", () => {
  // "Add push, pull, rest, push" should produce a complete week.
  const filled = normaliseWeek(["Push", "Pull", REST_DAY, "Push"]);
  assert.equal(filled.length, 7);
  assert.equal(filled[4], REST_DAY);
  assert.equal(filled[6], REST_DAY);
});

test("an empty week is seven rest days", () => {
  assert.equal(emptyWeek().length, 7);
  assert.ok(emptyWeek().every((d) => d === REST_DAY));
});

test("a week longer than seven is trimmed", () => {
  assert.equal(normaliseWeek(Array(10).fill("Push")).length, 7);
});

test("reordering moves a day and keeps the rest", () => {
  const days = ["Push", "Pull", "Legs"];
  assert.deepEqual(reorder(days, 2, 0), ["Legs", "Push", "Pull"]);
  assert.deepEqual(reorder(days, 0, 2), ["Pull", "Legs", "Push"]);
});

test("an out-of-range reorder changes nothing", () => {
  const days = ["Push", "Pull"];
  assert.deepEqual(reorder(days, 5, 0), days);
  assert.deepEqual(reorder(days, 0, 0), days);
});

test("training days per week reflects the shape of the programme", () => {
  const week = makeProgram({
    name: "3 day", kind: "week",
    days: [REST_DAY, "Push", REST_DAY, "Pull", REST_DAY, "Legs", REST_DAY],
  });
  assert.equal(trainingDaysPerWeek(week), 3);
  // A six-day cycle with one rest averages out above five.
  assert.ok(trainingDaysPerWeek(PPLULR) > 5.5);
});

test("a programme with no days still answers with rest", () => {
  const empty = makeProgram({ name: "Empty", kind: "cycle", days: [] });
  assert.equal(splitForDate(empty, new Date()), REST_DAY);
});
