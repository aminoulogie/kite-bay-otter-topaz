import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOMENTUM_DAYS, PROJECT_COLORS, STALE_DAYS, addStep, cleanProject, daysLeft, daysSinceMove,
  doneCount, isComplete, isStale, lastMoveAt, nextStep, pace, paceLabel, progress, rateWords,
  moveStep, removeStep, setStep, sortProjects, stepsOf, summarise, ticksSince,
  type Project,
} from "./projects.ts";

const DAY = 86400000;
const NOW = Date.parse("2026-09-13T12:00:00Z");
const TODAY = "2026-09-13";

const proj = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Ship it",
  color: PROJECT_COLORS[0]!,
  steps: [],
  status: "active",
  createdAt: NOW,
  ...over,
});

const steps = (...done: boolean[]) =>
  done.map((d, i) => ({ id: `s${i}`, label: `step ${i}`, done: d }));

// ------------------------------------------------------------- progress --

test("an empty project is nought done, not everything done", () => {
  // The naive count is 0/0, which reads as complete and would file a project
  // in the finished pile the moment it was created.
  assert.equal(progress(proj()), 0);
  assert.equal(isComplete(proj()), false);
});

test("progress is the count of ticked steps, not a number anyone types", () => {
  assert.equal(progress(proj({ steps: steps(true, false, false, false) })), 0.25);
  assert.equal(doneCount(proj({ steps: steps(true, true, false) })), 2);
});

test("every step ticked is complete", () => {
  assert.equal(isComplete(proj({ steps: steps(true, true) })), true);
  assert.equal(isComplete(proj({ steps: steps(true, false) })), false);
});

test("the next step is the first one still to do", () => {
  const p = proj({ steps: steps(true, false, false) });
  assert.equal(nextStep(p)?.id, "s1");
  assert.equal(nextStep(proj({ steps: steps(true) })), null);
  assert.equal(nextStep(proj()), null);
});

// ------------------------------------------------------------ deadlines --

test("days left counts forward, and backwards when overdue", () => {
  assert.equal(daysLeft(proj({ due: "2026-09-20" }), TODAY), 7);
  assert.equal(daysLeft(proj({ due: "2026-09-13" }), TODAY), 0);
  assert.equal(daysLeft(proj({ due: "2026-09-10" }), TODAY), -3);
});

test("no deadline is null, not zero", () => {
  // Zero means "due today", which is a very different thing to say.
  assert.equal(daysLeft(proj(), TODAY), null);
  assert.equal(daysLeft(proj({ due: "nonsense" }), TODAY), null);
});

// --------------------------------------------------------------- stale --

test("nothing ticked for a long time is drifting", () => {
  assert.equal(isStale(proj({ touchedAt: NOW - (STALE_DAYS + 1) * DAY }), NOW), true);
  assert.equal(isStale(proj({ touchedAt: NOW - DAY }), NOW), false);
});

test("a paused project is not nagged about", () => {
  // Deliberately setting something down is not a failure, and warning about it
  // teaches people to ignore the warning.
  const old = { touchedAt: NOW - 90 * DAY };
  assert.equal(isStale(proj({ ...old, status: "paused" }), NOW), false);
  assert.equal(isStale(proj({ ...old, status: "done" }), NOW), false);
  assert.equal(isStale(proj({ ...old, status: "active" }), NOW), true);
});

test("a project nobody has touched falls back to when it was made", () => {
  assert.equal(isStale(proj({ createdAt: NOW - 30 * DAY }), NOW), true);
});

// -------------------------------------------------------------- editing --

test("ticking a step stamps it and marks the project as moving", () => {
  const p = setStep(proj({ steps: steps(false) }), "s0", true, NOW);
  assert.equal(p.steps[0]!.done, true);
  assert.equal(p.steps[0]!.at, NOW);
  assert.equal(p.touchedAt, NOW);
});

test("unticking clears the stamp rather than leaving a stale one", () => {
  const on = setStep(proj({ steps: steps(false) }), "s0", true, NOW);
  const off = setStep(on, "s0", false, NOW + 1000);
  assert.equal(off.steps[0]!.done, false);
  assert.equal(off.steps[0]!.at, undefined);
});

test("a blank step is not added", () => {
  assert.equal(addStep(proj(), "   ", NOW).steps.length, 0);
  assert.equal(addStep(proj(), "Draft", NOW).steps.length, 1);
  assert.equal(addStep(proj(), "  Draft  ", NOW).steps[0]!.label, "Draft");
});

test("removing a step leaves the others alone", () => {
  const p = removeStep(proj({ steps: steps(true, false, false) }), "s1", NOW);
  assert.deepEqual(p.steps.map((s) => s.id), ["s0", "s2"]);
});

// --------------------------------------------------------------- order --

test("active comes before paused comes before done", () => {
  const list = [
    proj({ id: "d", status: "done" }),
    proj({ id: "p", status: "paused" }),
    proj({ id: "a", status: "active" }),
  ];
  assert.deepEqual(sortProjects(list, TODAY).map((p) => p.id), ["a", "p", "d"]);
});

test("within a status, the nearest deadline comes first", () => {
  const list = [
    proj({ id: "far", due: "2026-10-01" }),
    proj({ id: "near", due: "2026-09-15" }),
    proj({ id: "late", due: "2026-09-01" }),
  ];
  assert.deepEqual(sortProjects(list, TODAY).map((p) => p.id), ["late", "near", "far"]);
});

test("a project with a deadline outranks one without", () => {
  const list = [proj({ id: "none" }), proj({ id: "dated", due: "2026-12-01" })];
  assert.deepEqual(sortProjects(list, TODAY).map((p) => p.id), ["dated", "none"]);
});

test("sorting does not mutate the list it was given", () => {
  const list = [proj({ id: "b", status: "done" }), proj({ id: "a" })];
  sortProjects(list, TODAY);
  assert.equal(list[0]!.id, "b");
});

// ------------------------------------------------------------- summary --

test("the board counts what is open, late and drifting", () => {
  const s = summarise(
    [
      proj({ id: "1", steps: steps(true, false, false) }),
      proj({ id: "2", due: "2026-09-01", steps: steps(false) }),
      proj({ id: "3", status: "done", steps: steps(true) }),
      proj({ id: "4", touchedAt: NOW - 40 * DAY, steps: steps(false, false) }),
    ],
    TODAY,
    NOW,
  );
  assert.equal(s.active, 3);
  assert.equal(s.done, 1);
  assert.equal(s.overdue, 1);
  assert.equal(s.stale, 1);
  assert.equal(s.stepsLeft, 2 + 1 + 2, "a finished project's steps are not still to do");
});

// --------------------------------------------------------------- clean --

test("rubbish in storage does not become a project", () => {
  for (const junk of [null, undefined, 7, "x", {}, { id: "" }]) {
    assert.equal(cleanProject(junk), null);
  }
});

test("a half-written project is repaired rather than dropped", () => {
  const p = cleanProject({ id: "x", steps: [{ id: "a", label: "go" }, null, { label: "no id" }] })!;
  assert.equal(p.name, "Untitled");
  assert.equal(p.status, "active");
  assert.equal(p.color, PROJECT_COLORS[0]);
  assert.deepEqual(p.steps.map((s) => s.id), ["a"]);
  assert.equal(p.steps[0]!.done, false);
});

test("a malformed deadline is dropped, not kept as a broken date", () => {
  assert.equal(cleanProject({ id: "x", due: "next tuesday" })!.due, undefined);
  assert.equal(cleanProject({ id: "x", due: "2026-09-13" })!.due, "2026-09-13");
});

test("stepsOf survives a project whose steps are not a list", () => {
  assert.deepEqual(stepsOf({ steps: "nope" } as unknown as Project), []);
  assert.deepEqual(stepsOf(undefined), []);
});

// ---------------------------------------------------------------- pace --

/** Steps carrying tick times, as days-ago offsets. undefined = not done. */
const ticked = (...agoDays: (number | undefined)[]) =>
  agoDays.map((ago, i) => ({
    id: `s${i}`,
    label: `step ${i}`,
    done: ago !== undefined,
    at: ago === undefined ? undefined : NOW - ago * DAY,
  }));

test("the last move is the newest tick, not the newest edit", () => {
  // touchedAt moves when a step is merely added or renamed. Planning a project
  // is not progressing it, so the momentum read must ignore that.
  const p = proj({ steps: ticked(9, 2, undefined), touchedAt: NOW });
  assert.equal(lastMoveAt(p), NOW - 2 * DAY);
  assert.equal(daysSinceMove(p, NOW), 2);
});

test("a project nobody has ever ticked has no last move at all", () => {
  assert.equal(lastMoveAt(proj({ steps: steps(false, false) })), undefined);
  assert.equal(daysSinceMove(proj({ steps: steps(false) }), NOW), null);
});

test("ticks are counted only inside the window", () => {
  const p = proj({ steps: ticked(1, 3, 20, undefined) });
  assert.equal(ticksSince(p, 14, NOW), 2);
  assert.equal(ticksSince(p, 30, NOW), 3);
});

test("a project with no steps is not judged on pace", () => {
  const p = pace(proj(), TODAY, NOW);
  assert.equal(p.verdict, "no-steps");
  assert.equal(p.required, null);
});

test("a fully ticked project is done rather than behind", () => {
  const p = pace(proj({ steps: ticked(1, 2), due: "2026-09-01" }), TODAY, NOW);
  assert.equal(p.verdict, "done");
  assert.equal(p.left, 0);
});

test("without a deadline there is a rate but nothing to be behind", () => {
  const p = pace(proj({ steps: ticked(1, undefined), createdAt: NOW - 14 * DAY }), TODAY, NOW);
  assert.equal(p.verdict, "no-deadline");
  assert.equal(p.required, null);
  assert.ok(p.actual > 0);
});

test("required pace is the steps left over the days left", () => {
  // Four to do, ten days: two every five days.
  const p = pace(
    proj({ steps: ticked(undefined, undefined, undefined, undefined), due: "2026-09-23" }),
    TODAY,
    NOW,
  );
  assert.equal(p.left, 4);
  assert.equal(p.days, 10);
  assert.equal(p.required, 0.4);
  assert.equal(p.verdict, "behind", "nothing ticked cannot be ahead of a real deadline");
});

test("a deadline of today still leaves today to work in", () => {
  // Dividing by the zero days remaining would demand an infinite rate of
  // someone who has until this evening.
  const p = pace(proj({ steps: ticked(undefined, undefined), due: TODAY }), TODAY, NOW);
  assert.equal(p.days, 0);
  assert.equal(p.required, 2);
  assert.ok(Number.isFinite(p.required!));
});

test("past the date is its own verdict, not a rate to chase", () => {
  const p = pace(proj({ steps: ticked(undefined), due: "2026-09-01" }), TODAY, NOW);
  assert.equal(p.verdict, "overdue");
  assert.equal(p.required, null);
});

test("a project started on Tuesday is not judged against a fortnight", () => {
  // Two days old, one step ticked yesterday. Measured over the full window
  // that is 1/14 a day and reads as a stall; measured over its actual life it
  // is half a step a day.
  const p = pace(
    proj({ createdAt: NOW - 2 * DAY, steps: ticked(1, undefined), due: "2026-09-16" }),
    TODAY,
    NOW,
  );
  assert.equal(p.actual, 0.5);
  assert.equal(p.verdict, "ahead");
});

test("the window never grows past MOMENTUM_DAYS however old the project is", () => {
  const p = pace(
    proj({ createdAt: NOW - 400 * DAY, steps: ticked(...Array(14).fill(1), undefined), due: "2026-09-20" }),
    TODAY,
    NOW,
  );
  assert.equal(p.actual, 14 / MOMENTUM_DAYS);
});

test("a rate below one a day is spoken as an interval", () => {
  assert.equal(rateWords(0), "nothing lately");
  assert.equal(rateWords(0.5), "1 every 2d");
  assert.equal(rateWords(1), "1/day");
  assert.equal(rateWords(2.5), "2.5/day");
});

test("every verdict has a sentence", () => {
  const verdicts = new Set<string>();
  for (const p of [
    pace(proj(), TODAY, NOW),
    pace(proj({ steps: ticked(1) }), TODAY, NOW),
    pace(proj({ steps: ticked(undefined), due: "2026-09-01" }), TODAY, NOW),
    pace(proj({ steps: ticked(undefined) }), TODAY, NOW),
    pace(proj({ steps: ticked(1, undefined), due: "2026-09-30" }), TODAY, NOW),
  ]) {
    verdicts.add(p.verdict);
    assert.ok(paceLabel(p).length > 0);
  }
  assert.equal(verdicts.size, 5);
});

// ---------------------------------------------------------------- move --

test("a step moves without losing its tick or its timestamp", () => {
  // The whole point: reordering used to mean delete-and-retype, which threw
  // away exactly the data the momentum read is built from.
  const p = proj({ steps: ticked(3, undefined, undefined) });
  const moved = moveStep(p, "s0", 2);
  assert.deepEqual(moved.steps.map((s) => s.id), ["s1", "s2", "s0"]);
  assert.equal(moved.steps[2]!.done, true);
  assert.equal(moved.steps[2]!.at, NOW - 3 * DAY);
});

test("a step cannot be moved off either end of the list", () => {
  const p = proj({ steps: steps(false, false, false) });
  assert.deepEqual(moveStep(p, "s0", -1).steps.map((s) => s.id), ["s0", "s1", "s2"]);
  assert.deepEqual(moveStep(p, "s2", 1).steps.map((s) => s.id), ["s0", "s1", "s2"]);
});

test("moving an unknown step changes nothing", () => {
  const p = proj({ steps: steps(false, true) });
  assert.equal(moveStep(p, "nope", 1), p);
});

test("rearranging the plan is not progress", () => {
  // Otherwise a drift warning could be cleared by shuffling the list, which
  // is precisely the self-grading the rest of this file exists to prevent.
  const p = proj({ steps: steps(false, false), touchedAt: NOW - 30 * DAY });
  assert.equal(moveStep(p, "s0", 1).touchedAt, NOW - 30 * DAY);
});

test("the next step follows the order, so moving one changes the card", () => {
  const p = proj({ steps: steps(false, false) });
  assert.equal(nextStep(p)!.id, "s0");
  assert.equal(nextStep(moveStep(p, "s1", -1))!.id, "s1");
});
