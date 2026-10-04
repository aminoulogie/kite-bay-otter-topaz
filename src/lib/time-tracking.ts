/**
 * Hours on projects: timers you start and stop, and entries typed in after.
 *
 * Stored as start and end instants rather than a duration, so an entry can be
 * placed on a timesheet, moved between days, and a timer left running is
 * simply an entry with no end yet. Only one timer runs at a time — two
 * clocks running at once is double-billing, not multitasking.
 */

import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";

export interface TimeEntry {
  id: string;
  projectId: string;
  /** Epoch ms. */
  start: number;
  /** Epoch ms; absent while the timer is running. */
  end?: number;
  note?: string;
  /** Counted towards what is billed. Defaults to true. */
  billable?: boolean;
}

/** A timer left on overnight was forgotten, not worked. Running entries stop counting at this. */
export const MAX_ENTRY_MS = 12 * 3600_000;

export function newTimeId(): string {
  return `te-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function durationMs(e: TimeEntry, now = Date.now()): number {
  const end = e.end ?? now;
  return Math.max(0, Math.min(MAX_ENTRY_MS, end - e.start));
}

export const running = (entries: TimeEntry[]) => entries.find((e) => e.end === undefined) ?? null;

/** "1:05:09" for a live clock, "3h 20m" for totals. */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function hours(ms: number): string {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** Hours to two decimals, as a timesheet shows them. */
export const decimalHours = (ms: number) => Math.round((ms / 3600_000) * 100) / 100;

export const dayOf = (ms: number) => getLocalDateKey(new Date(ms));

/** Total per project per day for the week starting `monday`. */
export function timesheet(entries: TimeEntry[], monday: string, now = Date.now()) {
  const days = Array.from({ length: 7 }, (_, i) => getLocalDateKey(addDays(parseLocalDateKey(monday), i)));
  const rows = new Map<string, number[]>();
  for (const e of entries) {
    const i = days.indexOf(dayOf(e.start));
    if (i < 0) continue;
    const row = rows.get(e.projectId) ?? new Array<number>(7).fill(0);
    row[i]! += durationMs(e, now);
    rows.set(e.projectId, row);
  }
  const dayTotals = days.map((_, i) => [...rows.values()].reduce((a, r) => a + r[i]!, 0));
  return { days, rows, dayTotals, total: dayTotals.reduce((a, b) => a + b, 0) };
}

/** Billable time and its value per project, over entries in [from, to) (date keys, inclusive start). */
export function billable(entries: TimeEntry[], rateOf: (projectId: string) => number, from?: string, to?: string, now = Date.now()) {
  const out = new Map<string, { ms: number; billableMs: number; value: number }>();
  for (const e of entries) {
    const d = dayOf(e.start);
    if ((from && d < from) || (to && d >= to)) continue;
    const ms = durationMs(e, now);
    const r = out.get(e.projectId) ?? { ms: 0, billableMs: 0, value: 0 };
    r.ms += ms;
    if (e.billable !== false) {
      r.billableMs += ms;
      r.value += (ms / 3600_000) * (rateOf(e.projectId) || 0);
    }
    out.set(e.projectId, r);
  }
  for (const r of out.values()) r.value = Math.round(r.value);
  return out;
}

/** A backup or synced value made safe. */
export function asTimeEntries(raw: unknown): TimeEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TimeEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Partial<TimeEntry>;
    const start = Number(r.start);
    if (typeof r.id !== "string" || typeof r.projectId !== "string" || !Number.isFinite(start)) continue;
    const end = r.end === undefined || r.end === null ? undefined : Number(r.end);
    out.push({
      id: r.id,
      projectId: r.projectId,
      start,
      end: end !== undefined && Number.isFinite(end) && end >= start ? end : undefined,
      note: typeof r.note === "string" && r.note ? r.note : undefined,
      billable: r.billable === false ? false : undefined,
    });
  }
  return out;
}
