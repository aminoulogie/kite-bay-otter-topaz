import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../lib/projects.ts";
import type { LedgerEntry } from "../lib/types.ts";
import { byClient, filterLedger } from "./money.ts";

const e = (o: Partial<LedgerEntry>): LedgerEntry => ({
  id: Math.random().toString(36),
  date: "2026-10-03",
  kind: "spend",
  amount: 100,
  category: "Food",
  ...o,
});
const projects = [
  { id: "a", name: "Audit", client: "Acme" },
  { id: "b", name: "Site", client: "Acme" },
  { id: "c", name: "Own thing" },
] as Project[];

test("filters by month, kind, account, project and text; newest first", () => {
  const l = [
    e({ date: "2026-10-01", note: "lunch" }),
    e({ date: "2026-10-05", kind: "income", category: "Salary" }),
    e({ date: "2026-09-30" }),
    e({ date: "2026-10-02", accountId: "card1", projectId: "a" }),
  ];
  assert.equal(filterLedger(l, { month: "2026-10" }).length, 3);
  assert.equal(filterLedger(l, { month: "2026-10" })[0]!.date, "2026-10-05");
  assert.equal(filterLedger(l, { kind: "income" }).length, 1);
  assert.equal(filterLedger(l, { accountId: "main" }).length, 3);
  assert.equal(filterLedger(l, { projectId: "a" }).length, 1);
  assert.equal(filterLedger(l, { q: "LUNCH" }).length, 1);
});

test("income and cost per client through tagged projects, in base currency", () => {
  const l = [
    e({ kind: "income", amount: 1000, projectId: "a" }),
    e({ kind: "income", amount: 10, currency: "EUR", projectId: "b" }),
    e({ kind: "spend", amount: 300, projectId: "a" }),
    e({ kind: "income", amount: 500, projectId: "c" }),
    e({ kind: "income", amount: 999 }),
  ];
  assert.deepEqual(byClient(l, projects, { EUR: 150, USD: 135 }), [
    { client: "Acme", income: 2500, cost: 300, net: 2200 },
    { client: "Own thing", income: 500, cost: 0, net: 500 },
  ]);
});
