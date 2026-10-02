import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAIN_ID, accountBalance, accountsOf, budgetRows, categoriesOf, dailySpend, formatMoney, goalSaved,
  monthFlows, toneOf, totalBalance,
} from "./money-model.ts";
import { totals } from "./money.ts";
import type { LedgerEntry, Settings } from "./types.ts";

const S = (over: Partial<Settings> = {}) => ({ unit: "kg", ...over }) as unknown as Settings;
const e = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: Math.random().toString(36), date: "2026-09-10", kind: "spend", amount: 100, category: "Food", ...over,
});
const RATES = { EUR: 150, USD: 135 };

test("older entries belong to Main, which opens with the old balance anchor", () => {
  const accounts = accountsOf(S({ moneyBalance: 5000, moneyBalanceDate: "2026-09-01" }));
  assert.equal(accounts[0]!.id, MAIN_ID);
  const ledger = [e({ amount: 300 }), e({ kind: "income", amount: 1000 }), e({ date: "2026-08-30", amount: 999 })];
  assert.equal(accountBalance(accounts[0]!, ledger, RATES), 5000 - 300 + 1000, "before the anchor does not count");
});

test("an entry in euros moves a dinar account at the set rate, and the other way round", () => {
  const [main] = accountsOf(S());
  const eur = { id: "e", name: "Euro", kind: "bank" as const, currency: "EUR" as const, opening: 100, openingDate: "0000-00-00", color: "#000" };
  const ledger = [
    e({ amount: 10, currency: "EUR" }), // 1500 DA from Main
    e({ accountId: "e", amount: 1500 }), // 1500 DA = €10 from the euro account
  ];
  assert.equal(accountBalance(main!, ledger, RATES), -1500);
  assert.equal(accountBalance(eur, ledger, RATES), 90);
  assert.equal(totalBalance([main!, eur], ledger, RATES), -1500 + 90 * 150);
});

test("money put into a goal leaves the account but is not spending", () => {
  const [main] = accountsOf(S());
  const ledger = [e({ amount: 200 }), e({ kind: "save", amount: 500, goalId: "g", category: "Savings" })];
  assert.equal(accountBalance(main!, ledger, RATES), -700);
  assert.equal(totals(ledger, RATES).spend, 200);
  assert.equal(monthFlows(ledger, "2026-09", RATES).spend, 200);
  assert.equal(goalSaved({ id: "g", name: "Car", icon: "car", color: "#fff", target: 1000, createdAt: 0 }, ledger, RATES), 500);
});

test("budgets warn at 80% and go red over 100%", () => {
  assert.equal(toneOf(0.5), "ok");
  assert.equal(toneOf(0.8), "warn");
  assert.equal(toneOf(1.2), "over");
  const cats = categoriesOf(S(), []);
  const rows = budgetRows([e({ amount: 900 }), e({ category: "Rent", amount: 100 })], "2026-09", cats, { Food: 1000, Transport: 500 }, RATES);
  assert.deepEqual(rows.map((r) => [r.category.name, r.spent, r.budget, r.tone]), [
    ["Food", 900, 1000, "warn"],
    ["Rent", 100, 0, "ok"],
    ["Transport", 0, 500, "ok"],
  ]);
});

test("old category names keep their place, with an icon and colour", () => {
  const cats = categoriesOf(S({ spendCategories: ["Fun"] }), [e({ category: "Coffee" })]);
  for (const n of ["Fun", "Coffee", "Food", "Salary"]) assert.ok(cats.some((c) => c.name === n), n);
});

test("daily spending puts each day in its slot", () => {
  const d = dailySpend([e({ date: "2026-09-01", amount: 50 }), e({ date: "2026-09-30", amount: 70 }), e({ kind: "income", amount: 9 })], "2026-09", RATES);
  assert.equal(d.length, 30);
  assert.equal(d[0], 50);
  assert.equal(d[29], 70);
});

test("money reads the way it is written", () => {
  assert.match(formatMoney(12480), /^12.?480 DA$/);
  assert.equal(formatMoney(85.5, "EUR"), "€85.50");
  assert.equal(formatMoney(-3, "USD", { sign: true }), "−$3.00");
});
