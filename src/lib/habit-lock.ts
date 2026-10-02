/**
 * Habits are ticked on the day, not after it.
 *
 * Backfilling a missed day is the easiest way to lie to a streak, so only
 * today can be marked done. Past days are read-only both ways: clearing used
 * to stay open, and a stray tap on the heatmap quietly erased a real day.
 */
import { getLocalDateKey } from "./soma/dates.ts";

/** True when `date` may be marked done — today, and only today. */
export function canTickOn(date: string, now = new Date()): boolean {
  return date === getLocalDateKey(now);
}

/** True when a day in a habit may be changed: today, done or not. Never a past day. */
export function canChange(_done: boolean, date: string, now = new Date()): boolean {
  return canTickOn(date, now);
}
