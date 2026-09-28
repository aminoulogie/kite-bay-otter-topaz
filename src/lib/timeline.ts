/**
 * One day, as a calendar's day view draws it: what is on, from when to when.
 *
 * Three kinds of thing share the timeline:
 *   - to-dos you have put at a time (`slot`), which you tick off there;
 *   - the session you trained, from Train's own record of when it ended and
 *     how long it ran;
 *   - the day plan's blocks, drawn faintly behind — the shape you meant the
 *     day to have, under what is actually in it.
 *
 * Minutes from midnight throughout. Events that overlap sit side by side in
 * columns, the way Calendar lays out a double booking, rather than on top of
 * each other where neither can be read or tapped.
 */
import type { HistorySession, TodoItem, TodoSlot } from "./types.ts";

export const DAY_MINUTES = 24 * 60;
/** The finest a slot is placed or moved by. */
export const SNAP_MINUTES = 15;
export const DEFAULT_SLOT_MINUTES = 30;

export interface TimelineEvent {
  id: string;
  kind: "todo" | "workout";
  label: string;
  start: number;
  end: number;
  done?: boolean;
  color?: string;
  /** The to-do behind it, when there is one. */
  todoId?: string;
}

export interface PlacedEvent extends TimelineEvent {
  /** Which of `columns` side-by-side columns this sits in. */
  column: number;
  columns: number;
}

export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round((Number(minutes) || 0) / step) * step;
}

/** A slot read back from storage or a form, made safe. */
export function cleanSlot(slot: TodoSlot): TodoSlot {
  const start = Math.max(0, Math.min(DAY_MINUTES - SNAP_MINUTES, snap(slot.start)));
  const mins = Math.max(SNAP_MINUTES, Math.min(DAY_MINUTES - start, snap(slot.mins) || DEFAULT_SLOT_MINUTES));
  return { date: String(slot.date), start, mins };
}

/** "13:45" from 825. */
export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** "45:30" → 45.5 minutes. */
function durationMinutes(formatted: string | undefined): number {
  const m = String(formatted ?? "").match(/^(\d+):([0-5]?\d)$/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : 0;
}

/** Everything on the timeline for one day, earliest first. */
export function eventsFor(
  date: string,
  todos: readonly TodoItem[],
  session?: HistorySession | null,
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const t of todos) {
    if (!t.slot || t.slot.date !== date) continue;
    const slot = cleanSlot(t.slot);
    out.push({
      id: `todo:${t.id}`,
      kind: "todo",
      label: t.text,
      start: slot.start,
      end: slot.start + slot.mins,
      done: t.done,
      todoId: t.id,
    });
  }
  if (session?.timestamp) {
    // Saved when the session was finished, so it ENDS here.
    const end = minutesOf(new Date(session.timestamp));
    const length = Math.max(SNAP_MINUTES, Math.round(durationMinutes(session.durationFormatted)));
    const start = Math.max(0, end - length);
    out.push({
      id: "workout",
      kind: "workout",
      label: session.split ? `Workout · ${session.split}` : "Workout",
      start,
      end: Math.max(start + SNAP_MINUTES, end),
      done: true,
    });
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Side-by-side columns for overlapping events.
 *
 * Events are grouped into clusters that overlap one another; inside a
 * cluster each takes the first column free at its start, and every event in
 * the cluster is drawn at the cluster's width, so a clash reads as two
 * halves rather than one card hiding another.
 */
export function layout(events: readonly TimelineEvent[]): PlacedEvent[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PlacedEvent[] = [];
  let cluster: PlacedEvent[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];

  const flush = () => {
    const n = Math.max(1, colEnds.length);
    for (const e of cluster) e.columns = n;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };

  for (const e of sorted) {
    if (cluster.length && e.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= e.start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(e.end);
    } else {
      colEnds[col] = e.end;
    }
    cluster.push({ ...e, column: col, columns: 1 });
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  if (cluster.length) flush();
  return out;
}
