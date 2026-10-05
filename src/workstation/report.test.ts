import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../lib/projects.ts";
import type { LedgerEntry } from "../lib/types.ts";
import { buildReport, reportSheets } from "./report.ts";

const t = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
const projects = [
  {
    id: "a",
    name: "Audit",
    client: "Acme",
    rate: 6000,
    status: "active",
    color: "",
    createdAt: 0,
    steps: [
      { id: "s1", label: "Fieldwork", done: true },
      { id: "s2", label: "Report", done: false },
    ],
  },
  { id: "b", name: "Site", client: "Own", status: "active", color: "", createdAt: 0, steps: [] },
] as Project[];
const timeEntries = [
  { id: "1", projectId: "a", start: t(3, 9), end: t(3, 12) },
  { id: "2", projectId: "a", start: t(20, 9), end: t(20, 10), billable: false },
  { id: "3", projectId: "a", start: t(40, 9), end: t(40, 10) },
  { id: "4", projectId: "b", start: t(3, 9), end: t(3, 11) },
];
const ledger = [
  { id: "x", date: "2026-10-10", kind: "income", amount: 30000, category: "Fees", projectId: "a" },
  {
    id: "y",
    date: "2026-10-11",
    kind: "spend",
    amount: 20,
    currency: "EUR",
    category: "Travel",
    projectId: "a",
  },
  { id: "z", date: "2026-10-11", kind: "income", amount: 999, category: "Other" },
] as LedgerEntry[];

test("a client's report over October", () => {
  const r = buildReport(
    { client: "Acme", from: "2026-10-01", to: "2026-10-31" },
    { projects, timeEntries, ledger, rates: { EUR: 150, USD: 135 } },
  );
  assert.equal(r.title, "Acme");
  assert.deepEqual(r.summary, {
    hours: 4,
    billableHours: 3,
    billableValue: 18000,
    revenue: 30000,
    costs: 3000,
    net: 27000,
    projects: 1,
    stepsDone: 1,
    stepsTotal: 2,
    workedHours: 0,
    workedValue: 0,
  });
  assert.deepEqual(r.openSteps, [{ project: "Audit", step: "Report" }]);
  const sheets = reportSheets(r, "October 2026");
  assert.deepEqual(
    sheets.map((s) => s.name),
    ["Summary", "Projects", "Time", "Money", "Findings", "Open steps"],
  );
  assert.equal(sheets[2]!.rows.length, 3);
});

test("all clients, all time", () => {
  const r = buildReport({ client: "" }, { projects, timeEntries, ledger });
  assert.equal(r.summary.hours, 7);
  assert.equal(r.summary.projects, 2);
});

test("work log shifts: per client, rate applied, activities named by project", () => {
  const r = buildReport(
    { client: "Acme", from: "2026-10-01", to: "2026-10-31" },
    {
      projects,
      timeEntries: [],
      ledger: [],
      clientRates: { Acme: 4000 },
      shifts: [
        {
          id: "w1",
          client: "Acme",
          start: t(5, 9),
          end: t(5, 17),
          breaks: [{ start: t(5, 12), end: t(5, 13) }],
          activities: [{ id: "x", projectId: "a", text: "Interviews", done: true }],
        },
        { id: "w2", client: "Other", start: t(6, 9), end: t(6, 10), breaks: [], activities: [] },
      ],
      now: t(20, 0),
    },
  );
  assert.equal(r.shifts.length, 1);
  assert.equal(r.shifts[0]!.hours, 7);
  assert.equal(r.shifts[0]!.value, 28000);
  assert.deepEqual(r.shifts[0]!.done, ["Audit: Interviews (done)"]);
  assert.equal(r.summary.workedHours, 7);
  assert.ok(reportSheets(r, "Oct").some((s) => s.name === "Work log" && s.rows.length === 2));
});
