/**
 * The numbers behind the workstation's Overview: one pass over all the data,
 * so the page that is meant to show everything at a glance does not have to
 * know how each part of the app stores itself.
 */

import { isClosed, type Finding } from "../lib/findings.ts";
import { daysLeft, doneCount, isStale, stepsOf, type Project } from "../lib/projects.ts";

export interface AttentionItem {
  kind: "overdue" | "stale" | "todo-overdue" | "due-soon" | "finding";
  id: string;
  title: string;
  detail: string;
  /** Days overdue (negative) or left; for sorting. */
  days: number;
  projectId?: string;
}

export interface Activity {
  at: number;
  projectId: string;
  project: string;
  step: string;
}

interface TodoLike {
  id: string;
  text: string;
  done: boolean;
  due?: string;
  cleared?: boolean;
}

const DAY = 86_400_000;

export function projectStats(projects: Project[], todayKey: string, now = Date.now()) {
  const active = projects.filter((p) => p.status === "active");
  const overdue = active.filter((p) => (daysLeft(p, todayKey) ?? 0) < 0);
  const stale = active.filter((p) => isStale(p, now));
  const dueSoon = active.filter((p) => {
    const d = daysLeft(p, todayKey);
    return d !== null && d >= 0 && d <= 7;
  });
  let stepsWeek = 0;
  for (const p of projects)
    for (const s of stepsOf(p)) if (s.done && s.at && now - s.at <= 7 * DAY) stepsWeek++;
  const openSteps = active.reduce((a, p) => a + stepsOf(p).length - doneCount(p), 0);
  return {
    active: active.length,
    overdue: overdue.length,
    stale: stale.length,
    dueSoon: dueSoon.length,
    stepsWeek,
    openSteps,
  };
}

/** What needs looking at, worst first. */
export function attention(
  projects: Project[],
  todos: TodoLike[],
  todayKey: string,
  now = Date.now(),
  findings: Finding[] = [],
): AttentionItem[] {
  const out: AttentionItem[] = [];
  const nameOf = new Map(projects.map((p) => [p.id, p.client || p.name]));
  for (const f of findings) {
    if (isClosed(f)) continue;
    const late = f.due && f.due < todayKey;
    if (!late && f.severity !== "critical" && f.severity !== "high") continue;
    const d = f.due
      ? Math.round((Date.parse(`${f.due}T00:00:00`) - Date.parse(`${todayKey}T00:00:00`)) / DAY)
      : 0;
    out.push({
      kind: "finding",
      id: `f-${f.id}`,
      title: f.title,
      detail: `${nameOf.get(f.projectId) ?? ""} · ${f.severity}${late ? ` · fix ${-d}d overdue` : ""}`,
      days: f.severity === "critical" ? -1000 + d : d,
      projectId: f.projectId,
    });
  }
  for (const p of projects) {
    if (p.status !== "active") continue;
    const d = daysLeft(p, todayKey);
    const who = p.client ? `${p.client} · ` : "";
    if (d !== null && d < 0) {
      out.push({
        kind: "overdue",
        id: `p-${p.id}`,
        title: p.name,
        detail: `${who}${-d} day${d === -1 ? "" : "s"} overdue`,
        days: d,
        projectId: p.id,
      });
    } else if (isStale(p, now)) {
      const idle = Math.floor((now - Number(p.touchedAt ?? p.createdAt)) / DAY);
      out.push({
        kind: "stale",
        id: `p-${p.id}`,
        title: p.name,
        detail: `${who}no progress in ${idle} days`,
        days: 1000 - idle,
        projectId: p.id,
      });
    } else if (d !== null && d <= 3) {
      out.push({
        kind: "due-soon",
        id: `p-${p.id}`,
        title: p.name,
        detail: `${who}${d === 0 ? "due today" : `due in ${d} day${d === 1 ? "" : "s"}`}`,
        days: d,
        projectId: p.id,
      });
    }
  }
  for (const t of todos) {
    if (t.done || t.cleared || !t.due || t.due >= todayKey) continue;
    const d = Math.round(
      (Date.parse(`${t.due}T00:00:00`) - Date.parse(`${todayKey}T00:00:00`)) / DAY,
    );
    out.push({
      kind: "todo-overdue",
      id: `t-${t.id}`,
      title: t.text,
      detail: `to-do · ${-d} day${d === -1 ? "" : "s"} overdue`,
      days: d,
    });
  }
  const rank = { finding: 0, overdue: 0, "todo-overdue": 1, "due-soon": 2, stale: 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.days - b.days);
}

/** The most recently ticked steps across every project. */
export function recentActivity(projects: Project[], limit = 12): Activity[] {
  const out: Activity[] = [];
  for (const p of projects)
    for (const s of stepsOf(p))
      if (s.done && s.at) out.push({ at: s.at, projectId: p.id, project: p.name, step: s.label });
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** Every client named on a project, most used first. */
export function clientsOf(projects: Project[]): string[] {
  const n = new Map<string, number>();
  for (const p of projects) {
    const c = p.client?.trim();
    if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}
