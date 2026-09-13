/**
 * How a deadline reads, in words and in urgency.
 *
 * Shared rather than written per list, because a date is the one thing every
 * list in this app will eventually want and the phrasing has to be identical
 * everywhere. "2 days late" on one screen and "-2d" on another is two dialects
 * of the same fact.
 *
 * The one decision worth stating: TODAY IS NOT LATE. A deadline of today is
 * met right up until midnight, and colouring it red at breakfast trains people
 * to ignore the colour — which is the only thing it is for.
 */

export type DueTone = "none" | "later" | "soon" | "today" | "late";

/** Within this many days, a deadline is worth drawing attention to. */
export const SOON_DAYS = 2;

/** Whole days from `todayKey` to `dueKey`; negative is overdue. */
export function daysUntil(dueKey: string | undefined, todayKey: string): number | null {
  if (!dueKey) return null;
  const due = Date.parse(`${dueKey}T00:00:00`);
  const today = Date.parse(`${todayKey}T00:00:00`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return null;
  return Math.round((due - today) / 86400000);
}

export function toneFor(dueKey: string | undefined, todayKey: string): DueTone {
  const d = daysUntil(dueKey, todayKey);
  if (d === null) return "none";
  if (d < 0) return "late";
  if (d === 0) return "today";
  return d <= SOON_DAYS ? "soon" : "later";
}

/** "3d late", "today", "tomorrow", "in 5d". */
export function dueLabel(dueKey: string | undefined, todayKey: string): string {
  const d = daysUntil(dueKey, todayKey);
  if (d === null) return "";
  if (d < 0) return `${-d}d late`;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d}d`;
}

/**
 * The order a list with deadlines should be in.
 *
 * Done sinks, whatever its date — a finished thing has no deadline any more.
 * Then soonest first, and anything undated after everything dated: giving a
 * task a date is a commitment, and it should outrank one nobody committed to.
 * Ties keep the order they were added in, which is the only stable thing left.
 */
export function byDue<T extends { done?: boolean; due?: string }>(
  items: T[],
  todayKey: string,
): T[] {
  return (items ?? [])
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ad = a.item?.done === true;
      const bd = b.item?.done === true;
      if (ad !== bd) return ad ? 1 : -1;
      const au = daysUntil(a.item?.due, todayKey);
      const bu = daysUntil(b.item?.due, todayKey);
      if (au === null && bu !== null) return 1;
      if (au !== null && bu === null) return -1;
      if (au !== null && bu !== null && au !== bu) return au - bu;
      return a.i - b.i;
    })
    .map((x) => x.item);
}

/** How many are past their date and still not done. */
export function overdueCount<T extends { done?: boolean; due?: string }>(
  items: T[],
  todayKey: string,
): number {
  return (items ?? []).filter((t) => t?.done !== true && toneFor(t?.due, todayKey) === "late").length;
}

/** A stored value kept only if it is a real "YYYY-MM-DD". */
export function cleanDue(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
