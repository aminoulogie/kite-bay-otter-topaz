import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BREAK_SECONDS, DEEP_WORK_SECONDS, HABIT_SECONDS, STALE_RUN_MS, addSpent, addToQueue,
  appendLog, blockRef, cleanFocusPrefs, completionRate, dayBudget, defaultFocusPrefs,
  focusDateOf, focusIdFor, habitFocusSeconds, insertBreakAfter, isFocusId, itemsFromPlan,
  makeItem, moveInQueue, nextUp, nowInPlan, patchQueueSeconds, pruneFinished, queueAsRoutine,
  rememberSeconds, reviveRun, snapshotKey, snapshotOf, spentByRef, suggestSeconds, summarise,
  targetProgress, MAX_LOG, routineForRun, type FocusSession,
} from "./focus.ts";
import {
  MAX_STEP_SECONDS, MIN_STEP_SECONDS, completeStep, pauseRun, resumeRun, skipStep, startRun,
  type RoutineStep,
} from "./routine.ts";
import type { TimeBlock } from "./day-plan.ts";

const T0 = 1_700_000_000_000;
const DATE = "2026-09-26";

const items = (): RoutineStep[] => [
  { id: "a", label: "Write report", seconds: 1500, source: "todo", refId: "t1" },
  { id: "b", label: "Stretch", seconds: 300, source: "habit", refId: "h1" },
  { id: "c", label: "Inbox", seconds: 600, source: "free" },
];

// ------------------------------------------------------------ identity --

test("a focus run is told apart from a routine's by its id alone", () => {
  assert.equal(focusIdFor(DATE), "focus:2026-09-26");
  assert.equal(isFocusId(focusIdFor(DATE)), true);
  assert.equal(isFocusId("rt-abc"), false);
  assert.equal(isFocusId(undefined), false);
  assert.equal(focusDateOf(focusIdFor(DATE)), DATE);
  assert.equal(focusDateOf("rt-abc"), null);
});

test("the queue becomes a routine whose window is its own total", () => {
  const r = queueAsRoutine(DATE, items());
  assert.equal(r.id, focusIdFor(DATE));
  assert.equal(r.windowSeconds, 2400);
  assert.equal(r.steps.length, 3);
  // An empty queue still has a positive window, so progress never divides by 0.
  assert.equal(queueAsRoutine(DATE, []).windowSeconds, 60);
});

// ----------------------------------------------------------- durations --

test("suggested durations prefer what you used last time", () => {
  const prefs = { ...defaultFocusPrefs(), lastSeconds: { "todo:t1": 900 } };
  assert.equal(suggestSeconds("todo", "t1", prefs), 900);
  assert.equal(suggestSeconds("todo", "t2", prefs), DEEP_WORK_SECONDS);
  assert.equal(suggestSeconds("habit", "h1", prefs), HABIT_SECONDS);
  assert.equal(suggestSeconds("habit", "h1", prefs, 120), 120);
  assert.equal(suggestSeconds("free", undefined, { ...prefs, workSeconds: 50 * 60 }), 50 * 60);
});

test("remembering a duration ignores free items and clamps the value", () => {
  assert.deepEqual(rememberSeconds({}, "free", undefined, 600), {});
  assert.deepEqual(rememberSeconds({}, "todo", "t1", 999999), { "todo:t1": MAX_STEP_SECONDS });
  assert.deepEqual(rememberSeconds({}, "habit", "h1", 1), { "habit:h1": MIN_STEP_SECONDS });
});

test("prefs from storage survive junk", () => {
  const p = cleanFocusPrefs({ pomodoro: "yes", workSeconds: -3, lastSeconds: { x: 0, y: 60 } });
  assert.equal(p.pomodoro, false);
  assert.equal(p.workSeconds, MIN_STEP_SECONDS);
  assert.deepEqual(p.lastSeconds, { y: 60 });
  assert.deepEqual(cleanFocusPrefs(null), defaultFocusPrefs());
});

// --------------------------------------------------------------- queue --

test("the same habit or to-do is never queued twice", () => {
  const q = items();
  const again = addToQueue(q, makeItem({ label: "Stretch", seconds: 60, source: "habit", refId: "h1" }));
  assert.equal(again, q);
  const free = addToQueue(q, makeItem({ label: "Inbox", seconds: 60, source: "free" }));
  assert.equal(free.length, 4);
});

test("editing a duration clamps it, so a typo cannot eat the afternoon", () => {
  const q = patchQueueSeconds(items(), "c", 10 * 3600);
  assert.equal(q.find((s) => s.id === "c")!.seconds, MAX_STEP_SECONDS);
});

test("reordering keeps every item and respects the floor while running", () => {
  const q = items();
  assert.deepEqual(moveInQueue(q, "c", 0).map((s) => s.id), ["c", "a", "b"]);
  assert.deepEqual(moveInQueue(q, "a", 99).map((s) => s.id), ["b", "c", "a"]);
  // Running on step 1: nothing may move to or from index 0 or 1.
  assert.deepEqual(moveInQueue(q, "c", 0, 2).map((s) => s.id), ["a", "b", "c"]);
  assert.equal(moveInQueue(q, "a", 2, 2), q);
  assert.equal(moveInQueue(q, "missing", 0), q);
});

test("a break goes between two work steps and nowhere else", () => {
  const q = insertBreakAfter(items(), 0, 300);
  assert.deepEqual(q.map((s) => s.isBreak ?? false), [false, true, false, false]);
  assert.equal(q[1]!.source, "free");
  assert.equal(q[1]!.seconds, 300);
  // Not after a break, not before one, not after the last step.
  assert.equal(insertBreakAfter(q, 1).length, q.length);
  assert.equal(insertBreakAfter(q, 0).length, q.length);
  assert.equal(insertBreakAfter(items(), 2).length, 3);
  assert.equal(BREAK_SECONDS, 300);
});

test("finishing a run clears what was done and the breaks, and keeps what was skipped", () => {
  const q = insertBreakAfter(items(), 0);
  assert.deepEqual(pruneFinished(q, ["a"]).map((s) => s.id), ["b", "c"]);
});

test("the next three skip breaks and start from where the run is", () => {
  const q = insertBreakAfter(items(), 0);
  assert.deepEqual(nextUp(q).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(nextUp(q, 1).map((s) => s.id), ["b", "c"]);
  assert.deepEqual(nextUp(q, 0, 1).map((s) => s.id), ["a"]);
});

// ------------------------------------------------------------ day plan --

const plan: TimeBlock[] = [
  { id: "sleep", label: "Sleep", hours: 8, color: "#000", fixed: true, start: 23 },
  { id: "work", label: "Work", hours: 9, color: "#111", fixed: true },
  { id: "deep", label: "Deep work", hours: 2, color: "#222", fixed: false },
  { id: "free", label: "Evening", hours: 5, color: "#333", fixed: false },
];

test("pulling from the plan takes flexible blocks only, capped, and only once", () => {
  const pulled = itemsFromPlan(plan);
  assert.deepEqual(pulled.map((s) => s.label), ["Deep work", "Evening"]);
  assert.equal(pulled[0]!.seconds, 2 * 3600);
  assert.equal(pulled[1]!.seconds, MAX_STEP_SECONDS);
  assert.equal(pulled[0]!.refId, blockRef("deep"));
  assert.equal(itemsFromPlan(plan, pulled).length, 0);
});

test("now finds the block the clock is in and what is left of it", () => {
  // 23:00 + 8h sleep = 07:00, + 9h work = 16:00, deep work 16:00–18:00.
  const at = nowInPlan(plan, 17.5);
  assert.equal(at?.arc.block.id, "deep");
  assert.equal(at?.leftHours, 0.5);
  // Sleep crosses midnight: at 01:00 there are six hours of it left.
  const night = nowInPlan(plan, 1);
  assert.equal(night?.arc.block.id, "sleep");
  assert.equal(night?.leftHours, 6);
});

// -------------------------------------------------------------- resume --

test("a run survives a process kill with its clock intact", () => {
  const r = queueAsRoutine(DATE, items());
  const run = startRun(r, T0);
  const stored = JSON.parse(JSON.stringify(run));
  const back = reviveRun(stored, T0 + 60_000);
  assert.deepEqual(back, run);
});

test("a run from yesterday morning is not resumed", () => {
  const run = startRun(queueAsRoutine(DATE, items()), T0);
  assert.equal(reviveRun(run, T0 + STALE_RUN_MS + 1), null);
  assert.equal(reviveRun(null), null);
  assert.equal(reviveRun({ routineId: "" }), null);
  assert.equal(reviveRun({ routineId: "x", startedAt: "nope" }), null);
});

test("a clock moved backwards cannot give a step more time than it had", () => {
  const run = startRun(queueAsRoutine(DATE, items()), T0);
  const back = reviveRun(run, T0 - 5000)!;
  assert.equal(back.stepStartedAt, T0 - 5000);
  assert.ok(back.startedAt <= T0 - 5000);
});

// -------------------------------------------------------- live snapshot --

test("the lock screen is given an end time, not a number to tick", () => {
  const r = queueAsRoutine(DATE, items());
  const run = startRun(r, T0);
  const s = snapshotOf(r, run, T0 + 60_000);
  assert.equal(s.label, "Write report");
  assert.equal(s.position, 1);
  assert.equal(s.total, 3);
  assert.equal(s.remainingSeconds, 1440);
  assert.equal(s.stepEndsAt, T0 + 1500 * 1000);
  assert.equal(s.nextLabel, "Stretch");
  assert.equal(s.paused, false);
});

test("after the screen was locked past the end, remaining reads zero, never negative", () => {
  const r = queueAsRoutine(DATE, items());
  const run = startRun(r, T0);
  const s = snapshotOf(r, run, T0 + 3 * 3600 * 1000);
  assert.equal(s.remainingSeconds, 0);
  assert.equal(s.finished, false);
});

test("paused shows no end time, and resuming moves the end by the pause", () => {
  const r = queueAsRoutine(DATE, items());
  const run = startRun(r, T0);
  const paused = pauseRun(run, T0 + 100_000);
  const p = snapshotOf(r, paused, T0 + 400_000);
  assert.equal(p.paused, true);
  assert.equal(p.stepEndsAt, null);
  assert.equal(p.remainingSeconds, 1400);
  const resumed = resumeRun(paused, T0 + 400_000);
  const q = snapshotOf(r, resumed, T0 + 400_000);
  assert.equal(q.stepEndsAt, T0 + 300_000 + 1500 * 1000);
  assert.equal(q.remainingSeconds, 1400);
});

test("only meaningful changes change the key", () => {
  const r = queueAsRoutine(DATE, items());
  const run = startRun(r, T0);
  assert.equal(snapshotKey(snapshotOf(r, run, T0)), snapshotKey(snapshotOf(r, run, T0 + 9000)));
  const next = completeStep(r, run, T0 + 9000);
  assert.notEqual(snapshotKey(snapshotOf(r, run, T0)), snapshotKey(snapshotOf(r, next, T0 + 9000)));
});

test("a finished run says so and has nothing counting", () => {
  const r = queueAsRoutine(DATE, items().slice(0, 1));
  const done = completeStep(r, startRun(r, T0), T0 + 1000);
  const s = snapshotOf(r, done, T0 + 1000);
  assert.equal(s.finished, true);
  assert.equal(s.stepEndsAt, null);
  assert.equal(s.position, 1);
});

// ----------------------------------------------------------------- log --

test("time spent is recorded per step, pauses removed, skipped included", () => {
  const r = queueAsRoutine(DATE, items());
  let run = startRun(r, T0);
  run = pauseRun(run, T0 + 60_000);
  run = resumeRun(run, T0 + 600_000);
  run = completeStep(r, run, T0 + 660_000); // 120s on "a"
  run = skipStep(r, run, T0 + 690_000); // 30s on "b"
  assert.deepEqual(run.spent, { a: 120, b: 30 });
  const byRef = spentByRef(r, run, T0 + 750_000); // 60s so far on "c"
  assert.deepEqual(byRef, { "todo:t1": 120, "habit:h1": 30, free: 60 });
});

test("a session summary counts done steps and leaves breaks out of the plan", () => {
  const q = insertBreakAfter(items(), 0, 60);
  const r = queueAsRoutine(DATE, q);
  let run = startRun(r, T0);
  run = completeStep(r, run, T0 + 100_000);
  run = completeStep(r, run, T0 + 160_000); // the break
  const s = summarise(r, run, DATE, T0 + 200_000);
  assert.equal(s.kind, "focus");
  assert.equal(s.steps, 3);
  assert.equal(s.done, 1);
  assert.equal(s.plannedSeconds, 2400);
  assert.equal(s.spentSeconds, 200);
  assert.equal(s.bySource.break, 60);
  assert.equal(s.bySource.todo, 100);
  assert.equal(s.bySource.habit, 40);
  assert.equal(completionRate(s), 33);
});

test("the log stays small and skips empty runs", () => {
  const base: FocusSession = {
    id: "x", date: DATE, kind: "focus", name: "Focus", startedAt: T0, endedAt: T0,
    plannedSeconds: 60, spentSeconds: 60, steps: 1, done: 1,
    bySource: { habit: 0, todo: 0, free: 60, break: 0 },
  };
  let log: FocusSession[] = [];
  for (let i = 0; i < MAX_LOG + 20; i++) log = appendLog(log, { ...base, id: String(i) });
  assert.equal(log.length, MAX_LOG);
  assert.equal(log.at(-1)!.id, String(MAX_LOG + 19));
  assert.equal(appendLog([], { ...base, spentSeconds: 1, done: 0 }).length, 0);
});

// -------------------------------------------------------------- budget --

test("the day budget compares queued and spent against flexible time", () => {
  const spent = addSpent(addSpent({}, { "todo:t1": 600, free: 300 }), { break: 300, "todo:t1": 60 });
  assert.deepEqual(spent, { "todo:t1": 660, free: 300, break: 300 });
  const b = dayBudget(items(), spent, 2);
  assert.equal(b.queuedSeconds, 2400);
  assert.equal(b.spentSeconds, 960);
  assert.equal(b.spentBySource.todo, 660);
  assert.equal(b.flexSeconds, 7200);
  assert.equal(b.leftoverSeconds, 7200 - 2400 - 960);
});

test("habit time targets read the spent map and cap at done", () => {
  const spent = { [DATE]: { "habit:h1": 900 } };
  assert.equal(habitFocusSeconds(spent, DATE, "h1"), 900);
  assert.equal(habitFocusSeconds(spent, "2026-01-01", "h1"), 0);
  assert.equal(targetProgress(900, 30), 0.5);
  assert.equal(targetProgress(9000, 30), 1);
  assert.equal(targetProgress(900, undefined), 0);
});

test("a run finds its list: a saved routine by id, or the queue for its date", () => {
  const saved = { ...queueAsRoutine(DATE, items()), id: "rt-1", name: "Morning" };
  const queues = { [DATE]: items() };
  assert.equal(routineForRun({ routineId: "rt-1" }, [saved], queues)?.name, "Morning");
  assert.equal(routineForRun({ routineId: focusIdFor(DATE) }, [saved], queues)?.steps.length, 3);
  assert.equal(routineForRun({ routineId: "gone" }, [saved], queues), null);
  assert.equal(routineForRun(null, [saved], queues), null);
});
