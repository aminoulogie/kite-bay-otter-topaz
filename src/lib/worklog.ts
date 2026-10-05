/**
 * The work log: shifts worked for a client, clocked in and out, with breaks,
 * and what was done in them.
 *
 * A shift belongs to a CLIENT, not a project — a day at a client is usually
 * several projects, and the hours are owed to the client either way. Each
 * activity in the shift names the project it was for, the next step it left
 * and any notes; those flow into the project itself (see the store), so the
 * project file is where the story of the work ends up.
 */

import { getLocalDateKey } from "./soma/dates.ts";

export interface ShiftBreak {
  start: number;
  /** Absent while the break is running. */
  end?: number;
}

export interface Activity {
  id: string;
  projectId?: string;
  /** What was done. */
  text: string;
  /** What comes next on that project; added to it as a step. */
  nextStep?: string;
  /** The project step created from `nextStep`, so edits update it rather than add another. */
  stepId?: string;
  /** Finished, rather than in progress. */
  done?: boolean;
  /** Notes; filed in the project's notes feed under this activity's id. */
  notes?: string;
}

export interface Shift {
  id: string;
  client: string;
  /** Epoch ms. */
  start: number;
  /** Absent while clocked in. */
  end?: number;
  breaks: ShiftBreak[];
  activities: Activity[];
  notes?: string;
}

/** A shift left open past this was forgotten, not worked. */
export const MAX_SHIFT_MS = 16 * 3600_000;

export const newShiftId = () => `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const newActivityId = () => `ac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const openShift = (shifts: Shift[]) => shifts.find((s) => s.end === undefined) ?? null;
export const onBreak = (s: Shift | null) => !!s && s.end === undefined && s.breaks.some((b) => b.end === undefined);

function clampEnd(s: Shift, now: number): number {
  return Math.min(s.end ?? now, s.start + MAX_SHIFT_MS);
}

export function breakMs(s: Shift, now = Date.now()): number {
  const end = clampEnd(s, now);
  return s.breaks.reduce((a, b) => {
    const from = Math.max(b.start, s.start);
    const to = Math.min(b.end ?? end, end);
    return a + Math.max(0, to - from);
  }, 0);
}

/** Time on the clock minus breaks. */
export function workedMs(s: Shift, now = Date.now()): number {
  return Math.max(0, clampEnd(s, now) - s.start - breakMs(s, now));
}

export const shiftDay = (s: Shift) => getLocalDateKey(new Date(s.start));

/** Worked time per client over shifts starting in [from, to] (date keys, inclusive). */
export function byClient(shifts: Shift[], from?: string, to?: string, now = Date.now()) {
  const out = new Map<string, { ms: number; shifts: number }>();
  for (const s of shifts) {
    const d = shiftDay(s);
    if ((from && d < from) || (to && d > to)) continue;
    const r = out.get(s.client) ?? { ms: 0, shifts: 0 };
    r.ms += workedMs(s, now);
    r.shifts++;
    out.set(s.client, r);
  }
  return out;
}

/** A backup or synced value made safe. */
export function asShifts(raw: unknown): Shift[] {
  if (!Array.isArray(raw)) return [];
  const out: Shift[] = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Partial<Shift>;
    const start = Number(r.start);
    if (typeof r.id !== "string" || typeof r.client !== "string" || !Number.isFinite(start)) continue;
    const end = r.end == null ? undefined : Number(r.end);
    out.push({
      id: r.id,
      client: r.client,
      start,
      end: end !== undefined && Number.isFinite(end) && end >= start ? end : undefined,
      breaks: Array.isArray(r.breaks)
        ? r.breaks
            .filter((b) => b && Number.isFinite(Number(b.start)))
            .map((b) => ({ start: Number(b.start), end: b.end == null || !Number.isFinite(Number(b.end)) ? undefined : Number(b.end) }))
        : [],
      activities: Array.isArray(r.activities)
        ? r.activities
            .filter((a) => a && typeof a.id === "string")
            .map((a) => ({
              id: a.id,
              projectId: str(a.projectId),
              text: typeof a.text === "string" ? a.text : "",
              nextStep: str(a.nextStep),
              stepId: str(a.stepId),
              done: a.done === true ? true : undefined,
              notes: str(a.notes),
            }))
        : [],
      notes: str(r.notes),
    });
  }
  return out;
}

/** "HH:MM" of an epoch ms, local time. */
export const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * `time` ("HH:MM") on the shift's day, or the day after when that would fall
 * before `after` — a shift that runs past midnight, or a break in one.
 */
export function timeAfter(day: string, time: string, after?: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const [y, mo, d] = day.split("-").map(Number) as [number, number, number];
  let t = new Date(y, mo - 1, d, Number(m[1]), Number(m[2])).getTime();
  if (after !== undefined && t < after) t = new Date(y, mo - 1, d + 1, Number(m[1]), Number(m[2])).getTime();
  return t;
}
