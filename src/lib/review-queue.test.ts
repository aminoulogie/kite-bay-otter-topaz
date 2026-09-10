import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GRADUATED, INTERVALS, dueDateOf, dueLabel, dueQueue, markReviewed, nextUp, reviewable,
  stageOf,
} from "./review-queue.ts";
import type { MindEntry } from "./types.ts";

const entry = (over: Partial<MindEntry> = {}): MindEntry => ({
  id: "m1",
  date: "2026-09-01",
  kind: "article",
  title: "Something worth keeping",
  takeaway: "The point of it.",
  ...over,
});

test("an entry with nothing written down has nothing to review", () => {
  assert.equal(reviewable(entry({ takeaway: undefined })), false);
  assert.equal(reviewable(entry({ takeaway: "   " })), false);
  assert.equal(dueDateOf(entry({ takeaway: "" })), null);
  assert.deepEqual(dueQueue([entry({ takeaway: undefined })], "2026-12-01"), []);
});

test("the first pass falls two days after it was logged", () => {
  assert.equal(dueDateOf(entry()), "2026-09-03");
  assert.equal(INTERVALS[0], 2);
});

test("each pass is counted from the last one, not from the entry", () => {
  // Otherwise a review done a fortnight late stacks the next one on top of it.
  const late = entry({ reviews: ["2026-09-20"] });
  assert.equal(stageOf(late), 1);
  assert.equal(dueDateOf(late), "2026-09-27");
});

test("three passes and it is finished with", () => {
  const done = entry({ reviews: ["2026-09-03", "2026-09-10", "2026-10-10"] });
  assert.equal(stageOf(done), GRADUATED);
  assert.equal(dueDateOf(done), null);
  assert.deepEqual(dueQueue([done], "2027-01-01"), []);
});

test("the most overdue comes first", () => {
  const old = entry({ id: "a", title: "Older", date: "2026-08-01" });
  const recent = entry({ id: "b", title: "Newer", date: "2026-09-05" });
  const q = dueQueue([recent, old], "2026-09-10");
  assert.deepEqual(q.map((i) => i.entry.id), ["a", "b"]);
  assert.ok(q[0]!.overdueDays > q[1]!.overdueDays);
});

test("nothing due yet is not the same as nothing at all", () => {
  const soon = entry({ date: "2026-09-09" });
  assert.deepEqual(dueQueue([soon], "2026-09-10"), []);
  const next = nextUp([soon], "2026-09-10");
  assert.equal(next?.due, "2026-09-11");
  assert.equal(dueLabel(next!), "in 1 day");
});

test("being late is not punished with a reset", () => {
  // Missing a review by a fortnight is normal; making the user start again
  // would be a rule invented for the sake of having one.
  const late = entry({ date: "2026-08-01" });
  const q = dueQueue([late], "2026-09-10");
  assert.equal(q[0]!.stage, 0);
  const patch = markReviewed(late, "2026-09-10")!;
  assert.deepEqual(patch.reviews, ["2026-09-10"]);
});

test("a second tap on the same day does not count twice", () => {
  const once = entry({ reviews: ["2026-09-10"] });
  assert.equal(markReviewed(once, "2026-09-10"), null);
  assert.ok(markReviewed(once, "2026-09-11"));
});

test("a graduated entry cannot be reviewed again", () => {
  const done = entry({ reviews: ["2026-09-03", "2026-09-10", "2026-10-10"] });
  assert.equal(markReviewed(done, "2026-11-01"), null);
});

test("junk in the reviews field does not break the schedule", () => {
  const junk = entry({ reviews: [null, 7, "2026-09-03"] as never });
  // Three entries means stage 3 by count, which is graduation — the count is
  // the state, and a corrupt list must not resurrect a finished entry.
  assert.equal(stageOf(junk), GRADUATED);
  assert.equal(dueDateOf(junk), null);
});

test("a malformed date does not produce an Invalid Date due date", () => {
  const bad = entry({ date: "not a date" });
  assert.equal(dueDateOf(bad), "not a date");
  assert.ok(!/NaN|Invalid/.test(String(dueDateOf(bad))));
});

test("the schedule is stated, not hidden", () => {
  const q = dueQueue([entry()], "2026-09-03");
  assert.equal(dueLabel(q[0]!), "due today");
  assert.equal(dueLabel({ ...q[0]!, overdueDays: 3 }), "3 days late");
});
