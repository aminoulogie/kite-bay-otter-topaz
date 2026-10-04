/**
 * Audit findings: what an engagement turned up, how bad it is, who owns the
 * fix and by when. Each belongs to a project, and so to a client.
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type FindingStatus = "open" | "in-progress" | "resolved" | "accepted";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
export const FINDING_STATUSES: FindingStatus[] = ["open", "in-progress", "resolved", "accepted"];
export const STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  "in-progress": "In progress",
  resolved: "Resolved",
  accepted: "Risk accepted",
};

export interface Finding {
  id: string;
  projectId: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  /** The process or area it sits in: "Payroll", "Access control"… */
  area?: string;
  description?: string;
  recommendation?: string;
  /** Who is responsible for the fix, on the client's side. */
  owner?: string;
  /** Date key the fix is due by. */
  due?: string;
  createdAt: number;
  /** When it was resolved or accepted. */
  closedAt?: number;
}

export const isClosed = (f: Pick<Finding, "status">) => f.status === "resolved" || f.status === "accepted";

export function newFindingId(): string {
  return `fd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Open first, then by severity, then by due date. */
export function sortFindings(list: Finding[]): Finding[] {
  return [...list].sort(
    (a, b) =>
      Number(isClosed(a)) - Number(isClosed(b)) ||
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      b.createdAt - a.createdAt,
  );
}

export function countBySeverity(list: Finding[], openOnly = true): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of list) if (!openOnly || !isClosed(f)) out[f.severity]++;
  return out;
}

/** A backup or synced value made safe. */
export function asFindings(raw: unknown): Finding[] {
  if (!Array.isArray(raw)) return [];
  const out: Finding[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Partial<Finding>;
    if (typeof r.id !== "string" || typeof r.projectId !== "string" || typeof r.title !== "string") continue;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
    out.push({
      id: r.id,
      projectId: r.projectId,
      title: r.title,
      severity: SEVERITIES.includes(r.severity as Severity) ? (r.severity as Severity) : "medium",
      status: FINDING_STATUSES.includes(r.status as FindingStatus) ? (r.status as FindingStatus) : "open",
      area: str(r.area),
      description: str(r.description),
      recommendation: str(r.recommendation),
      owner: str(r.owner),
      due: typeof r.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : undefined,
      createdAt: Number(r.createdAt) || Date.now(),
      closedAt: Number(r.closedAt) || undefined,
    });
  }
  return out;
}
