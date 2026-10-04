/**
 * The reading plan: which books, which pages, which week.
 *
 * Written down as it was given rather than generated, because a plan is
 * something you agreed to, and a schedule that recomputes itself every time a
 * day slips is one you can never fall behind on — which is the same as one you
 * can never be on.
 */

import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";

export interface PlanBlock {
  /** "Week 9", or "Buffer". */
  label: string;
  /** First and last day, as local date keys, inclusive. */
  start: string;
  end: string;
  what: string;
}

export const READING_PLAN: PlanBlock[] = [
  { label: "Week 9", start: "2026-11-30", end: "2026-12-06", what: "Finish Kokoro, then Mastery pages 1 to 90" },
  { label: "Week 10", start: "2026-12-07", end: "2026-12-13", what: "Mastery pages 91 to 260" },
  { label: "Week 11", start: "2026-12-14", end: "2026-12-20", what: "Finish Mastery, then all of Tao Te Ching" },
  { label: "Week 12", start: "2026-12-21", end: "2026-12-27", what: "Siddhartha, all of it" },
  { label: "Buffer", start: "2026-12-28", end: "2026-12-31", what: "Catch up or reread" },
];

export const PLAN_RULES: { title: string; text: string }[] = [
  { title: "Same slot every day", text: "30 to 45 minutes at the same time, with your phone in another room." },
  { title: "Catch-up rule", text: "If you miss a day, add 10 pages to each of the next 2 days. Never try to make it up in one sitting." },
  { title: "One rule per book", text: "When you finish a book, write 1 sentence on what you'll do differently. That's the part that actually shifts your mindset." },
  { title: "Sunday check", text: "Log your weekly pages in the app and bring them to a check-in." },
];

export type PlanState =
  | { phase: "before"; next: PlanBlock; inDays: number }
  | { phase: "during"; block: PlanBlock; index: number; dayOf: number; days: number }
  | { phase: "between"; next: PlanBlock; inDays: number }
  | { phase: "done" };

function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDateKey(b).getTime() - parseLocalDateKey(a).getTime()) / 86_400_000);
}

/** Where today sits in the plan. Date keys compare as strings. */
export function planState(today: string, plan: PlanBlock[] = READING_PLAN): PlanState {
  const index = plan.findIndex((b) => b.start <= today && today <= b.end);
  if (index >= 0) {
    const block = plan[index]!;
    return { phase: "during", block, index, dayOf: daysBetween(block.start, today) + 1, days: daysBetween(block.start, block.end) + 1 };
  }
  const next = plan.find((b) => b.start > today);
  if (!next) return { phase: "done" };
  return { phase: today < plan[0]!.start ? "before" : "between", next, inDays: daysBetween(today, next.start) };
}

/** Monday of the week holding `date`, and that week's seven keys. */
export function weekKeys(date: string): string[] {
  const d = parseLocalDateKey(date);
  const back = (d.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => getLocalDateKey(addDays(d, i - back)));
}

/** Pages logged against books in the week holding `date`. */
export function pagesThisWeek(entries: { kind: string; date: string; count?: number }[], date: string): number {
  const keys = new Set(weekKeys(date));
  let n = 0;
  for (const e of entries) {
    if (e.kind === "book" && keys.has(e.date) && Number.isFinite(e.count)) n += Math.max(0, e.count as number);
  }
  return n;
}

export function isSunday(date: string): boolean {
  return parseLocalDateKey(date).getDay() === 0;
}
