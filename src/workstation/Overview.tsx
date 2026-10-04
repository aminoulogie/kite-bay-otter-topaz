import { useMemo } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Users } from "lucide-react";
import { daysLeft, doneCount, progress, stepsOf } from "@/lib/projects";
import { DEFAULT_GOALS, addDays, getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { isActive, mondayOf } from "@/lib/todos";
import { durationMs, hours as fmtHours } from "@/lib/time-tracking";
import { attention, clientsOf, projectStats, recentActivity } from "./metrics";
import { byClient as moneyByClient } from "./money";
import { formatMoney, ratesOf } from "@/lib/money-model";
import type { PageId } from "./Workstation";

const fmt = (n: number) => Math.round(n).toLocaleString();

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function dueLabel(d: number | null): string {
  if (d === null) return "";
  if (d < 0) return `${-d} d overdue`;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} d`;
}

/**
 * Everything at a glance: the audit view across projects, tasks, training
 * and food, with what needs looking at first.
 */
export function Overview({
  onOpenProject,
  onGo,
}: {
  onOpenProject: (id: string) => void;
  onGo: (p: PageId) => void;
}) {
  const projects = useSoma((s) => s.projects);
  const todos = useSoma((s) => s.todos);
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const ledger = useSoma((s) => s.ledger);
  const timeEntries = useSoma((s) => s.timeEntries);
  const findings = useSoma((s) => s.findings);
  const settings = useSoma((s) => s.settings);
  const today = getLocalDateKey();
  const revenue = useMemo(
    () =>
      new Map(moneyByClient(ledger, projects, ratesOf(settings)).map((r) => [r.client, r.income])),
    [ledger, projects, settings],
  );

  const stats = useMemo(() => projectStats(projects, today), [projects, today]);
  const needs = useMemo(
    () => attention(projects, todos, today, Date.now(), findings),
    [projects, todos, today, findings],
  );
  const openFindings = findings.filter((f) => f.status === "open" || f.status === "in-progress");
  const severe = openFindings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  ).length;
  const activity = useMemo(() => recentActivity(projects, 10), [projects]);
  const monday = mondayOf(today);
  const weekHours = timeEntries
    .filter((e) => getLocalDateKey(new Date(e.start)) >= monday)
    .reduce((a, e) => a + durationMs(e), 0);
  const openTodos = todos.filter((t) => !t.done && isActive(t, today)).length;

  const weekAgo = getLocalDateKey(addDays(new Date(), -6));
  const sessions = Object.keys(history).filter((k) => k >= weekAgo && k <= today).length;
  const day = nutrition[today];
  const eaten = (day?.items ?? []).reduce((a, i) => a + (i.cals || 0), 0);
  const goal = (day?.goals ?? DEFAULT_GOALS).cals;

  const upcoming = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active" && p.due)
        .map((p) => ({ p, d: daysLeft(p, today) }))
        .filter((x) => x.d !== null && x.d >= 0 && x.d <= 30)
        .sort((a, b) => a.d! - b.d!)
        .slice(0, 8),
    [projects, today],
  );

  const byClient = useMemo(
    () =>
      clientsOf(projects).map((c) => {
        const ps = projects.filter((p) => p.client?.trim() === c);
        const active = ps.filter((p) => p.status === "active");
        const steps = ps.reduce((a, p) => a + stepsOf(p).length, 0);
        const done = ps.reduce((a, p) => a + doneCount(p), 0);
        return {
          client: c,
          total: ps.length,
          active: active.length,
          overdue: active.filter((p) => (daysLeft(p, today) ?? 0) < 0).length,
          pct: steps ? done / steps : 0,
        };
      }),
    [projects, today],
  );

  return (
    <div className="ws-page">
      <h1>Overview</h1>
      <p className="ws-sub">
        {new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}{" "}
        · everything across your projects, tasks and health.
      </p>

      <div className="ws-kpis">
        <Kpi label="Active projects" value={stats.active} hint={`${stats.openSteps} steps open`} />
        <Kpi
          label="Overdue"
          value={stats.overdue}
          hint="projects past due"
          tone={stats.overdue ? "bad" : undefined}
        />
        <Kpi
          label="Due this week"
          value={stats.dueSoon}
          hint="next 7 days"
          tone={stats.dueSoon ? "warn" : undefined}
        />
        <Kpi
          label="Drifting"
          value={stats.stale}
          hint="no progress in 10+ days"
          tone={stats.stale ? "warn" : undefined}
        />
        <Kpi label="Steps done" value={stats.stepsWeek} hint="last 7 days" />
        <Kpi label="To-dos today" value={openTodos} hint="still open" />
        <Kpi label="Hours tracked" value={fmtHours(weekHours)} hint="this week" />
        <Kpi
          label="Open findings"
          value={openFindings.length}
          hint={`${severe} critical or high`}
          tone={severe ? "bad" : undefined}
        />
        <Kpi label="Training" value={sessions} hint="sessions, last 7 days" />
        <Kpi label="Calories" value={fmt(eaten)} hint={`of ${fmt(goal)} today`} />
      </div>

      <div className="ws-grid" style={{ gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)" }}>
        <section className="ws-card">
          <header>
            <AlertTriangle size={14} className="ws-amber" /> Needs attention{" "}
            <small>{needs.length}</small>
          </header>
          {needs.length ? (
            <ul className="ws-list">
              {needs.slice(0, 12).map((n) => (
                <li
                  key={n.id}
                  className={n.projectId ? "click" : undefined}
                  onClick={() =>
                    n.kind === "finding"
                      ? onGo("findings")
                      : n.projectId
                        ? onOpenProject(n.projectId)
                        : onGo("tasks")
                  }
                >
                  <span
                    className={`ws-pill ${n.kind === "finding" ? "high" : n.kind === "overdue" || n.kind === "todo-overdue" ? "overdue" : n.kind === "stale" ? "stale" : "active"}`}
                  >
                    {n.kind === "finding"
                      ? "Finding"
                      : n.kind === "overdue"
                        ? "Overdue"
                        : n.kind === "todo-overdue"
                          ? "To-do"
                          : n.kind === "stale"
                            ? "Drifting"
                            : "Due soon"}
                  </span>
                  <span className="t">{n.title}</span>
                  <span className="d">{n.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-empty">Nothing overdue or drifting. Good.</p>
          )}
        </section>

        <section className="ws-card">
          <header>
            <CalendarClock size={14} className="ws-muted" /> Upcoming deadlines{" "}
            <small>next 30 days</small>
          </header>
          {upcoming.length ? (
            <ul className="ws-list">
              {upcoming.map(({ p, d }) => (
                <li key={p.id} className="click" onClick={() => onOpenProject(p.id)}>
                  <span className="ws-swatch" style={{ background: p.color }} />
                  <span className="t">
                    {p.name}
                    {p.client && <span className="ws-faint"> · {p.client}</span>}
                  </span>
                  <span className={`d ${d! <= 3 ? "ws-amber" : ""}`}>{dueLabel(d)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-empty">
              No deadlines in the next 30 days. Give a project a due date to see it here.
            </p>
          )}
        </section>

        <section className="ws-card">
          <header>
            <Users size={14} className="ws-muted" /> By client <small>{byClient.length}</small>
          </header>
          {byClient.length ? (
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Projects</th>
                  <th>Active</th>
                  <th>Overdue</th>
                  <th>Progress</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {byClient.map((c) => (
                  <tr key={c.client} onClick={() => onGo("projects")}>
                    <td>{c.client}</td>
                    <td className="ws-num">{c.total}</td>
                    <td className="ws-num">{c.active}</td>
                    <td className={c.overdue ? "ws-red" : "ws-num"}>{c.overdue}</td>
                    <td>
                      <span className="ws-bar">
                        <i style={{ width: `${Math.round(c.pct * 100)}%` }} />
                      </span>
                      <span className="ws-num">{Math.round(c.pct * 100)}%</span>
                    </td>
                    <td className="ws-num" style={{ textAlign: "right" }}>
                      {revenue.get(c.client) ? formatMoney(revenue.get(c.client)!) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ws-empty">
              Set a client on your projects to see the work grouped by business.
            </p>
          )}
        </section>

        <section className="ws-card">
          <header>
            <CheckCircle2 size={14} className="ws-muted" /> Recent activity
          </header>
          {activity.length ? (
            <ul className="ws-list">
              {activity.map((a) => (
                <li
                  key={`${a.projectId}-${a.at}`}
                  className="click"
                  onClick={() => onOpenProject(a.projectId)}
                >
                  <CheckCircle2 size={13} className="ws-faint" />
                  <span className="t">
                    {a.step} <span className="ws-faint">· {a.project}</span>
                  </span>
                  <span className="d">{ago(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-empty">Ticked steps show up here.</p>
          )}
        </section>
      </div>

      {projects.length > 0 && (
        <p className="ws-faint" style={{ marginTop: 14 }}>
          {projects.filter((p) => p.status === "done").length} finished · overall{" "}
          {Math.round((projects.reduce((a, p) => a + progress(p), 0) / projects.length) * 100)}%
          through all projects.
        </p>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone?: "warn" | "bad";
}) {
  return (
    <div className={`ws-kpi ${tone ?? ""}`}>
      <span>{label}</span>
      <b>{value}</b>
      <small>{hint}</small>
    </div>
  );
}
