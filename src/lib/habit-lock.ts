/**
 * Habits are ticked on the day, not after it.
 *
 * Backfilling a missed day is the easiest way to lie to a streak, so only
 * today can be marked done. Clearing stays open for any day: taking a tick
 * back never flatters the record, and a slip of the finger on the heatmap has
 * to be undoable.
 */
import { getLocalDateKey } from "./soma/dates.ts";

/** True when `date` may be marked done — today, and only today. */
export function canTickOn(date: string, now = new Date()): boolean {
  return date === getLocalDateKey(now);
}

/** True when a day in a habit may be changed: any done day, or an undone today. */
export function canChange(done: boolean, date: string, now = new Date()): boolean {
  return done || canTickOn(date, now);
}
