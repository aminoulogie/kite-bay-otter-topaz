import assert from "node:assert/strict";
import { test } from "node:test";
import { costPerSession, inMonth, monthOf, shiftMonth, totals } from "./money.ts";
import type { LedgerEntry } from "./types.ts";

const e = (p: Partial<LedgerEntry>): LedgerEntry =>
  ({ id: p.id ?? "x", date: "2026-09-05", kind: "spend", amount: 10, category: "Food", ...p });

test("a month is the first seven characters, not a parsed date", () => {
  // Parsing would drag the timezone in, and the log is already local-dated.
  assert.equal(monthOf("2026-09-05"), "2026-09");
  assert.equal(monthOf("2026-12-31"), "2026-12");
});

test("only this month's entries count towards this month", () => {
  const all = [e({ id: "a" }), e({ id: "b", date: "2026-08-31" }), e({ id: "c", date: "2026-10-01" })];
  assert.deepEqual(inMonth(all, "2026-09").map((x) => x.id), ["a"]);
});

test("spend and income are told apart by kind, not by sign", () => {
  // Amounts are stored positive, so a negative one is a typo rather than a
  // refund — and it must not quietly reduce the month's spend.
  const t = totals([
    e({ id: "1", amount: 2000, kind: "income", category: "" }),
    e({ id: "2", amount: 500, category: "Rent" }),
    e({ id: "3", amount: -50, category: "Food" }),
  ]);
  assert.equal(t.income, 2000);
  assert.equal(t.spend, 550, "the mistyped -50 is counted as 50 spent, not -50");
  assert.equal(t.net, 1450);
});

test("overspending reads as a negative net", () => {
  const t = totals([e({ id: "1", amount: 100, kind: "income" }), e({ id: "2", amount: 250 })]);
  assert.equal(t.net, -150);
});

test("categories come back biggest first", () => {
  const t = totals([
    e({ id: "1", amount: 30, category: "Food" }),
    e({ id: "2", amount: 90, category: "Rent" }),
    e({ id: "3", amount: 20, category: "Food" }),
  ]);
  assert.deepEqual(t.byCategory, [
    { category: "Rent", total: 90 },
    { category: "Food", total: 50 },
  ]);
});

test("an uncategorised spend lands in Other rather than under an empty name", () => {
  assert.deepEqual(totals([e({ id: "1", amount: 5, category: "" })]).byCategory, [
    { category: "Other", total: 5 },
  ]);
});

test("cost per session divides training money by sessions trained", () => {
  const month = [
    e({ id: "1", amount: 3000, category: "Gym" }),
    e({ id: "2", amount: 1500, category: "Supplements" }),
    e({ id: "3", amount: 800, category: "Food" }),
  ];
  assert.equal(costPerSession(month, 15), 300, "food is not a training cost");
});

test("a month with no training has no cost per session, not infinity", () => {
  assert.equal(costPerSession([e({ id: "1", amount: 3000, category: "Gym" })], 0), null);
  assert.equal(costPerSession([e({ id: "1", amount: 500, category: "Food" })], 12), null);
});

test("walking backwards past January lands in the previous year", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-09", -3), "2026-06");
});
