import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetsFrom, comparePlan, shareOf, TEMPLATES } from "./spend-templates.ts";

const t5030 = TEMPLATES.find((t) => t.id === "50-30-20")!;

test("categories fall into needs, wants and giving by name", () => {
  assert.equal(shareOf("Rent"), "needs");
  assert.equal(shareOf("Groceries"), "needs");
  assert.equal(shareOf("Restaurants"), "wants");
  assert.equal(shareOf("Charity"), "give");
});

test("a month is held against a template, as shares of income", () => {
  const rows = comparePlan({ Rent: 40000, Groceries: 20000, Restaurants: 30000 }, 10000, 100000, t5030);
  const by = Object.fromEntries(rows.map((r) => [r.share, r]));
  assert.equal(by.needs!.actualPct, 0.6);
  assert.equal(by.wants!.target, 30000);
  assert.equal(by.save!.actual, 10000);
});

test("budgets split each share over its categories by last month's spending", () => {
  const b = budgetsFrom(t5030, 100000, ["Rent", "Groceries", "Restaurants"], { Rent: 30000, Groceries: 10000 });
  assert.equal(b.Rent, 37500);
  assert.equal(b.Groceries, 12500);
  assert.equal(b.Restaurants, 30000);
});
