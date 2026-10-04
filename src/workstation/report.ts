/** A client report: everything about a client's (or one project's) work and money over a period. */

import { isClosed, sortFindings, type Finding } from "../lib/findings.ts";
import { toBase, type Rates } from "../lib/money.ts";
import { doneCount, progress, stepsOf, type Project } from "../lib/projects.ts";
import { dayOf, durationMs, type TimeEntry } from "../lib/time-tracking.ts";
import type { LedgerEntry } from "../lib/types.ts";
import type { Sheet } from "../lib/xlsx.ts";

export interface ReportScope {
  /** "" for every client, else a client name. */
  client: string;
  /** Narrows to one project when set. */
  projectId?: string;
  /** Date keys; `to` is inclusive. Empty means unbounded. */
  from?: string;
  to?: string;
}

export interface ReportData {
  title: string;
  projects: Project[];
  time: {
    date: string;
    project: string;
    hours: number;
    note: string;
    billable: boolean;
    value: number;
  }[];
  money: {
    date: string;
    project: string;
    kind: LedgerEntry["kind"];
    category: string;
    note: string;
    amount: number;
  }[];
  openSteps: { project: string; step: string }[];
  findings: (Finding & { project: string })[];
  summary: {
    hours: number;
    billableHours: number;
    billableValue: number;
    revenue: number;
    costs: number;
    net: number;
    projects: number;
    stepsDone: number;
    stepsTotal: number;
  };
}

const inRange = (d: string, s: ReportScope) => (!s.from || d >= s.from) && (!s.to || d <= s.to);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildReport(
  scope: ReportScope,
  data: {
    projects: Project[];
    timeEntries: TimeEntry[];
    ledger: LedgerEntry[];
    findings?: Finding[];
    rates?: Rates;
    now?: number;
  },
): ReportData {
  const projects = data.projects.filter((p) =>
    scope.projectId
      ? p.id === scope.projectId
      : !scope.client || (p.client?.trim() || "") === scope.client,
  );
  const ids = new Set(projects.map((p) => p.id));
  const byId = new Map(projects.map((p) => [p.id, p]));
  const now = data.now ?? Date.now();

  const time = data.timeEntries
    .filter((e) => ids.has(e.projectId) && inRange(dayOf(e.start), scope))
    .sort((a, b) => a.start - b.start)
    .map((e) => {
      const p = byId.get(e.projectId)!;
      const h = round2(durationMs(e, now) / 3600_000);
      const billable = e.billable !== false;
      return {
        date: dayOf(e.start),
        project: p.name,
        hours: h,
        note: e.note ?? "",
        billable,
        value: billable && p.rate ? Math.round(h * p.rate) : 0,
      };
    });

  const money = data.ledger
    .filter((e) => e.projectId && ids.has(e.projectId) && inRange(e.date, scope))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: e.date,
      project: byId.get(e.projectId!)!.name,
      kind: e.kind,
      category: e.category,
      note: e.note ?? "",
      amount: Math.round(toBase(Math.abs(Number(e.amount) || 0), e.currency, data.rates)),
    }));

  const revenue = money.filter((m) => m.kind === "income").reduce((a, m) => a + m.amount, 0);
  const costs = money.filter((m) => m.kind === "spend").reduce((a, m) => a + m.amount, 0);
  const hours = round2(time.reduce((a, t) => a + t.hours, 0));
  const billableHours = round2(time.filter((t) => t.billable).reduce((a, t) => a + t.hours, 0));

  const title = scope.projectId
    ? (byId.get(scope.projectId)?.name ?? "Project")
    : scope.client || "All clients";
  return {
    title,
    projects,
    time,
    money,
    // Findings: every one still open, plus those closed inside the period.
    findings: sortFindings(
      (data.findings ?? []).filter(
        (f) =>
          ids.has(f.projectId) &&
          (!isClosed(f) || (f.closedAt !== undefined && inRange(dayOf(f.closedAt), scope))),
      ),
    ).map((f) => ({ ...f, project: byId.get(f.projectId)!.name })),
    openSteps: projects
      .filter((p) => p.status !== "done")
      .flatMap((p) =>
        stepsOf(p)
          .filter((s) => !s.done)
          .map((s) => ({ project: p.name, step: s.label })),
      ),
    summary: {
      hours,
      billableHours,
      billableValue: time.reduce((a, t) => a + t.value, 0),
      revenue,
      costs,
      net: revenue - costs,
      projects: projects.length,
      stepsDone: projects.reduce((a, p) => a + doneCount(p), 0),
      stepsTotal: projects.reduce((a, p) => a + stepsOf(p).length, 0),
    },
  };
}

/** The same report as spreadsheet sheets. */
export function reportSheets(r: ReportData, period: string): Sheet[] {
  const s = r.summary;
  return [
    {
      name: "Summary",
      rows: [
        ["Report", r.title],
        ["Period", period],
        ["Projects", s.projects],
        ["Steps done", s.stepsDone],
        ["Steps total", s.stepsTotal],
        ["Hours", s.hours],
        ["Billable hours", s.billableHours],
        ["Billable value (DA)", s.billableValue],
        ["Revenue (DA)", s.revenue],
        ["Costs (DA)", s.costs],
        ["Net (DA)", s.net],
      ],
    },
    {
      name: "Projects",
      rows: [
        ["Project", "Client", "Status", "Progress %", "Steps done", "Steps", "Due", "Rate (DA/h)"],
        ...r.projects.map((p) => [
          p.name,
          p.client ?? "",
          p.status,
          Math.round(progress(p) * 100),
          doneCount(p),
          stepsOf(p).length,
          p.due ?? "",
          p.rate ?? "",
        ]),
      ],
    },
    {
      name: "Time",
      rows: [
        ["Date", "Project", "Hours", "Billable", "Value (DA)", "Note"],
        ...r.time.map((t) => [
          t.date,
          t.project,
          t.hours,
          t.billable ? "yes" : "no",
          t.value || "",
          t.note,
        ]),
      ],
    },
    {
      name: "Money",
      rows: [
        ["Date", "Project", "Type", "Category", "Amount (DA)", "Note"],
        ...r.money.map((m) => [m.date, m.project, m.kind, m.category, m.amount, m.note]),
      ],
    },
    {
      name: "Findings",
      rows: [
        [
          "Severity",
          "Finding",
          "Project",
          "Area",
          "Status",
          "Owner",
          "Due",
          "Description",
          "Recommendation",
        ],
        ...r.findings.map((f) => [
          f.severity,
          f.title,
          f.project,
          f.area ?? "",
          f.status,
          f.owner ?? "",
          f.due ?? "",
          f.description ?? "",
          f.recommendation ?? "",
        ]),
      ],
    },
    {
      name: "Open steps",
      rows: [["Project", "Step"], ...r.openSteps.map((o) => [o.project, o.step])],
    },
  ];
}
