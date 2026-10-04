import assert from "node:assert/strict";
import { test } from "node:test";
import { READING_PLAN, isSunday, pagesThisWeek, planState, weekKeys } from "./reading-plan.ts";

test("every plan week runs Monday to Sunday and they follow on", () => {
  for (const b of READING_PLAN.slice(0, 4)) {
    assert.deepEqual(weekKeys(b.start), weekKeys(b.end));
    assert.equal(weekKeys(b.start)[0], b.start);
    assert.ok(isSunday(b.end));
  }
});

test("where today sits in the plan", () => {
  assert.deepEqual(planState("2026-11-28"), { phase: "before", next: READING_PLAN[0], inDays: 2 });
  const w10 = planState("2026-12-09");
  assert.equal(w10.phase, "during");
  if (w10.phase === "during") {
    assert.equal(w10.block.label, "Week 10");
    assert.equal(w10.dayOf, 3);
    assert.equal(w10.days, 7);
  }
  const buffer = planState("2026-12-31");
  assert.ok(buffer.phase === "during" && buffer.block.label === "Buffer" && buffer.days === 4);
  assert.deepEqual(planState("2027-01-01"), { phase: "done" });
});

test("pages this week count only book entries inside the week", () => {
  const entries = [
    { kind: "book", date: "2026-12-07", count: 30 },
    { kind: "book", date: "2026-12-13", count: 25 },
    { kind: "book", date: "2026-12-14", count: 99 },
    { kind: "language", date: "2026-12-08", count: 50 },
    { kind: "book", date: "2026-12-08" },
  ];
  assert.equal(pagesThisWeek(entries, "2026-12-10"), 55);
});
