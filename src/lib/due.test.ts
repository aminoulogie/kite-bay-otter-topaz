import assert from "node:assert/strict";
import { test } from "node:test";
import { byDue, cleanDue, daysUntil, dueLabel, overdueCount, toneFor } from "./due.ts";

const TODAY = "2026-09-13";

test("days count forward and backward from today", () => {
  assert.equal(daysUntil("2026-09-20", TODAY), 7);
  assert.equal(daysUntil("2026-09-13", TODAY), 0);
  assert.equal(daysUntil("2026-09-10", TODAY), -3);
});

test("no date is null, not zero", () => {
  // Zero means "due today", which is a very different thing to say.
  assert.equal(daysUntil(undefined, TODAY), null);
  assert.equal(daysUntil("soon", TODAY), null);
});

test("today is not late", () => {
  // A deadline of today is met until midnight. Colouring it red at breakfast
  // teaches people to ignore the colour, which is all it is for.
  assert.equal(toneFor(TODAY, TODAY), "today");
  assert.equal(toneFor("2026-09-12", TODAY), "late");
});

test("a date within a couple of days is soon, beyond that it is later", () => {
  assert.equal(toneFor("2026-09-15", TODAY), "soon");
  assert.equal(toneFor("2026-09-16", TODAY), "later");
  assert.equal(toneFor(undefined, TODAY), "none");
});

test("the label says the same thing everywhere", () => {
  assert.equal(dueLabel("2026-09-10", TODAY), "3d late");
  assert.equal(dueLabel(TODAY, TODAY), "today");
  assert.equal(dueLabel("2026-09-14", TODAY), "tomorrow");
  assert.equal(dueLabel("2026-09-18", TODAY), "in 5d");
  assert.equal(dueLabel(undefined, TODAY), "");
});

test("done sinks whatever its date", () => {
  const out = byDue(
    [
      { id: "done-late", done: true, due: "2026-01-01" },
      { id: "open", done: false },
    ],
    TODAY,
  );
  assert.deepEqual(out.map((x) => x.id), ["open", "done-late"]);
});

test("soonest first, and a dated task outranks an undated one", () => {
  const out = byDue(
    [
      { id: "none" },
      { id: "far", due: "2026-12-01" },
      { id: "late", due: "2026-09-01" },
      { id: "soon", due: "2026-09-14" },
    ],
    TODAY,
  );
  assert.deepEqual(out.map((x) => x.id), ["late", "soon", "far", "none"]);
});

test("ties keep the order they were added in", () => {
  const out = byDue([{ id: "a", due: undefined }, { id: "b", due: undefined }, { id: "c", due: undefined }], TODAY);
  assert.deepEqual(out.map((x) => x.id), ["a", "b", "c"]);
});

test("sorting does not mutate the list it was given", () => {
  const list = [{ id: "b", due: "2026-12-01" }, { id: "a", due: "2026-09-01" }];
  byDue(list, TODAY);
  assert.equal(list[0]!.id, "b");
});

test("overdue counts only what is open and past", () => {
  const n = overdueCount(
    [
      { done: false, due: "2026-09-01" },
      { done: true, due: "2026-09-01" },
      { done: false, due: TODAY },
      { done: false },
    ],
    TODAY,
  );
  assert.equal(n, 1);
});

test("a malformed stored date is dropped rather than kept as a broken one", () => {
  assert.equal(cleanDue("2026-09-13"), "2026-09-13");
  assert.equal(cleanDue("next tuesday"), undefined);
  assert.equal(cleanDue(""), undefined);
  assert.equal(cleanDue(17), undefined);
  assert.equal(cleanDue(undefined), undefined);
});
