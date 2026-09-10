/**
 * Coming back to what you wrote down.
 *
 * The Mind tab already insists on a takeaway for an article, on the grounds
 * that one you cannot summarise in a line is one you skimmed. That was half
 * the job. The other half is that a takeaway written once and never read again
 * is the same as not writing it: the log becomes a record of things you have
 * forgotten, kept in enough detail to prove you once knew them.
 *
 * So three passes, at two days, a week and a month. The intervals are the
 * conventional expanding schedule, not a claim about anyone's forgetting
 * curve — the value is almost entirely in coming back at all, and any
 * schedule that widens beats one that does not.
 *
 * Three deliberate limits:
 *
 *  - Only entries WITH a takeaway ever enter the queue. "Read 30 pages" has
 *    nothing to review, and putting it in the queue would train the user to
 *    dismiss the queue.
 *  - After the third pass an entry graduates and never returns. A queue that
 *    grows without bound is one nobody opens twice.
 *  - Overdue is not punished or reset. Missing a review by a fortnight is
 *    normal; making the user start again would be a rule invented for the
 *    sake of having one.
 */

import type { MindEntry } from "./types.ts";

/** Days after the previous pass that the next one falls due. */
export const INTERVALS = [2, 7, 30] as const;

/** Passes completed at which an entry is done with. */
export const GRADUATED = INTERVALS.length;

export interface QueueItem {
  entry: MindEntry;
  /** 0, 1 or 2 — which pass is next. */
  stage: number;
  /** The date it fell or falls due. */
  due: string;
  /** Negative when not yet due; positive is days overdue. */
  overdueDays: number;
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T12:00:00`);
  if (Number.isNaN(t.getTime())) return date;
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00`);
  const b = Date.parse(`${to}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Passes already done. Anything not an array of dates counts as none. */
export function stageOf(entry: MindEntry): number {
  const r = (entry as MindEntry & { reviews?: unknown }).reviews;
  return Array.isArray(r) ? Math.min(GRADUATED, r.length) : 0;
}

/** Whether this entry is something there is anything to review. */
export function reviewable(entry: MindEntry): boolean {
  return !!entry.takeaway?.trim();
}

/**
 * When the next pass falls due, or null once graduated.
 *
 * Counted from the last pass rather than from the entry's date, so a review
 * done late pushes the next one out instead of stacking two together.
 */
export function dueDateOf(entry: MindEntry): string | null {
  if (!reviewable(entry)) return null;
  const stage = stageOf(entry);
  if (stage >= GRADUATED) return null;
  const reviews = ((entry as MindEntry & { reviews?: string[] }).reviews ?? []).filter(
    (d): d is string => typeof d === "string",
  );
  const from = reviews.length ? reviews[reviews.length - 1]! : entry.date;
  return addDays(from, INTERVALS[stage]!);
}

/** Everything due on or before `today`, most overdue first. */
export function dueQueue(entries: MindEntry[], today: string): QueueItem[] {
  const out: QueueItem[] = [];
  for (const entry of entries ?? []) {
    const due = dueDateOf(entry);
    if (!due || due > today) continue;
    out.push({
      entry,
      stage: stageOf(entry),
      due,
      overdueDays: daysBetween(due, today),
    });
  }
  return out.sort(
    (a, b) => b.overdueDays - a.overdueDays || (a.entry.title < b.entry.title ? -1 : 1),
  );
}

/** The next thing coming, for the "nothing due" state. */
export function nextUp(entries: MindEntry[], today: string): QueueItem | null {
  let best: QueueItem | null = null;
  for (const entry of entries ?? []) {
    const due = dueDateOf(entry);
    if (!due || due <= today) continue;
    const item = { entry, stage: stageOf(entry), due, overdueDays: daysBetween(due, today) };
    if (!best || item.due < best.due) best = item;
  }
  return best;
}

/**
 * The patch that records a pass.
 *
 * A patch rather than a mutation so the store stays the only thing that
 * writes, and so a second tap on the same day cannot count twice.
 */
export function markReviewed(entry: MindEntry, today: string): { reviews: string[] } | null {
  if (!reviewable(entry)) return null;
  const reviews = ((entry as MindEntry & { reviews?: string[] }).reviews ?? []).filter(
    (d): d is string => typeof d === "string",
  );
  if (reviews.length >= GRADUATED) return null;
  if (reviews[reviews.length - 1] === today) return null;
  return { reviews: [...reviews, today] };
}

/** "in 5 days" / "due today" / "3 days late", for one line under the title. */
export function dueLabel(item: QueueItem): string {
  if (item.overdueDays === 0) return "due today";
  if (item.overdueDays > 0) {
    return `${item.overdueDays} day${item.overdueDays === 1 ? "" : "s"} late`;
  }
  const n = -item.overdueDays;
  return `in ${n} day${n === 1 ? "" : "s"}`;
}

/** Which pass this is, in words, so the schedule is visible rather than magic. */
export function stageLabel(stage: number): string {
  const day = INTERVALS[Math.min(stage, INTERVALS.length - 1)]!;
  return `pass ${Math.min(stage, GRADUATED - 1) + 1} of ${GRADUATED} · ${day}-day`;
}
