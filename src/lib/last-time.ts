/**
 * What you did last time, for the exercise you are standing in front of.
 *
 * The app already knew this — it is in `history` — and showed it nowhere near
 * where you decide what to load. `lastPerformance` returns the single heaviest
 * set of the last session, which answers "what is my best" rather than "what
 * do I put on the bar for set two", and those are different questions.
 *
 * So this returns the whole session, set by set, in order. Set two is compared
 * against set two: a top set of 82.5 tells you nothing about the back-off you
 * are about to do.
 */

import type { HistorySession, WorkoutSet } from "./types.ts";

export interface LastTime {
  date: string;
  /** Working sets only, in the order they were done. */
  sets: WorkoutSet[];
}

/**
 * The most recent session containing this exercise, excluding one date.
 *
 * `excludeDate` is what stops today comparing against itself. Re-opening a
 * session already saved — which backfilling and editing both do — would
 * otherwise show you your own numbers as though they were history, and the
 * placeholder would be whatever you just typed.
 *
 * Warm-ups are dropped. A 20kg warm-up is not a suggestion for a working set,
 * and offering it as one is worse than offering nothing.
 */
export function lastTimeFor(
  history: Record<string, HistorySession>,
  name: string,
  excludeDate?: string,
): LastTime | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;

  let best: LastTime | null = null;
  for (const [date, session] of Object.entries(history)) {
    if (date === excludeDate || !session?.exercises) continue;
    const match = session.exercises.find((e) => e.name.trim().toLowerCase() === wanted);
    if (!match) continue;
    const sets = match.sets.filter((s) => s.type !== "warmup" && s.done);
    if (!sets.length) continue;
    // Compared by date key rather than by timestamp: a backfilled session is
    // stamped when it was typed, not when it was trained, so timestamps put
    // last week's entry ahead of yesterday's workout.
    if (!best || date > best.date) best = { date, sets };
  }
  return best;
}

/** The set at this index last time, or null when last time was shorter. */
export function lastSetAt(last: LastTime | null, index: number): WorkoutSet | null {
  return last?.sets[index] ?? null;
}

/** "82.5 × 8" — what to show where the number goes. */
export function formatSet(set: WorkoutSet | null): string {
  if (!set) return "";
  const w = Number(set.weight) || 0;
  const r = Number(set.reps) || 0;
  if (!w && !r) return "";
  return `${w || "—"} × ${r || "—"}`;
}

/** "82.5 × 8, 80 × 8, 80 × 7" — the whole of last time, for the card header. */
export function summarise(last: LastTime | null, max = 4): string {
  if (!last?.sets.length) return "";
  const parts = last.sets.slice(0, max).map((s) => formatSet(s)).filter(Boolean);
  const more = last.sets.length - parts.length;
  return parts.join(", ") + (more > 0 ? ` +${more}` : "");
}

/**
 * How long ago, in the words a person would use.
 *
 * Days rather than a date, because "6 days ago" answers the question a date
 * makes you do arithmetic for.
 */
export function agoLabel(date: string, today: string): string {
  const a = Date.parse(`${date}T12:00:00`);
  const b = Date.parse(`${today}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return date;
  const days = Math.round((b - a) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
