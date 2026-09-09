import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAINS, buildDayMarks, domainsOn, summariseDay, type DayMarksInput } from "./day-marks.ts";

const empty: DayMarksInput = { history: {}, nutrition: {}, ledger: [], mind: [], habits: [] };

test("a day with nothing on it is not in the map at all", () => {
  const marks = buildDayMarks(empty);
  assert.equal(marks.size, 0);
  assert.deepEqual(domainsOn(marks, "2026-09-09"), []);
});

test("each domain marks its own day", () => {
  const marks = buildDayMarks({
    history: { "2026-09-01": { split: "Push" } as never },
    nutrition: { "2026-09-02": { items: [{ name: "x" }] } as never },
    ledger: [{ id: "1", date: "2026-09-03", kind: "spend", amount: 10, category: "Food" }],
    mind: [{ id: "2", date: "2026-09-04", kind: "book", title: "x" }],
    habits: [{ id: "h", name: "Read", history: { "2026-09-05": true } } as never],
  });
  assert.deepEqual(domainsOn(marks, "2026-09-01"), ["train"]);
  assert.deepEqual(domainsOn(marks, "2026-09-02"), ["food"]);
  assert.deepEqual(domainsOn(marks, "2026-09-03"), ["money"]);
  assert.deepEqual(domainsOn(marks, "2026-09-04"), ["mind"]);
  assert.deepEqual(domainsOn(marks, "2026-09-05"), ["habits"]);
});

test("a full day carries every mark, in a stable order", () => {
  const marks = buildDayMarks({
    history: { "2026-09-09": { split: "Push" } as never },
    nutrition: { "2026-09-09": { items: [{ name: "x" }] } as never },
    ledger: [{ id: "1", date: "2026-09-09", kind: "spend", amount: 10, category: "Food" }],
    mind: [{ id: "2", date: "2026-09-09", kind: "book", title: "x" }],
    habits: [{ id: "h", name: "Read", history: { "2026-09-09": true } } as never],
  });
  assert.deepEqual(domainsOn(marks, "2026-09-09"), [...DOMAINS]);
});

test("a day with an empty food log is not an eating day", () => {
  // ensureDay creates a blank day the moment the Fuel tab is opened, so an
  // existing key means nothing on its own.
  const marks = buildDayMarks({ ...empty, nutrition: { "2026-09-09": { items: [] } as never } });
  assert.deepEqual(domainsOn(marks, "2026-09-09"), []);
});

test("a habit actively marked not-done is not a thing that happened", () => {
  const marks = buildDayMarks({
    ...empty,
    habits: [{ id: "h", name: "Read", history: { "2026-09-09": false } } as never],
  });
  assert.deepEqual(domainsOn(marks, "2026-09-09"), []);
});

test("spend and income are summarised apart, and a blank day says nothing", () => {
  const input: DayMarksInput = {
    ...empty,
    ledger: [
      { id: "1", date: "2026-09-09", kind: "spend", amount: 2500, category: "Gym" },
      { id: "2", date: "2026-09-09", kind: "spend", amount: 640, category: "Food" },
      { id: "3", date: "2026-09-09", kind: "income", amount: 9000, category: "" },
    ],
  };
  const s = summariseDay(input, "2026-09-09");
  assert.equal(s.spend, 3140);
  assert.equal(s.income, 9000);
  // Not zero: "nothing logged" and "spent nothing" are different days.
  assert.equal(summariseDay(input, "2026-09-08").spend, null);
  assert.equal(summariseDay(input, "2026-09-08").income, null);
});

test("habits are counted done out of total", () => {
  const s = summariseDay({
    ...empty,
    habits: [
      { id: "a", name: "A", history: { "2026-09-09": true } } as never,
      { id: "b", name: "B", history: {} } as never,
    ],
  }, "2026-09-09");
  assert.equal(s.habitsDone, 1);
  assert.equal(s.habitsTotal, 2);
});
