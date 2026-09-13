import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROJECT_COLORS, STALE_DAYS, addStep, cleanProject, daysLeft, doneCount, isComplete,
  isStale, nextStep, progress, removeStep, setStep, sortProjects, stepsOf, summarise,
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
