/**
 * The minutes a book counts for itself.
 *
 * `reading-goal.ts` was written when the sentence in its own header was true:
 * SOMA was not the reader, so the minutes had to come from a timer you
 * remembered to start. SOMA is the reader now. A book that is open on the
 * screen knows precisely when it was being read, and a tracker that makes you
 * tell it what it can see is a tracker you stop telling.
 *
 * Two things make that harder than a stopwatch.
 *
 * THE PHONE GOES AWAY MID-SENTENCE. You put the book down without closing it,
 * lock the screen, get up. A clock that runs from open to close hands you four
 * hours for a chapter. So the run ends at the last sign of life plus a grace,
 * and anything past that wall is not counted — the wall stays where it is
 * however long the silence lasts, and moves only when somebody comes back.
 *
 * THE APP CAN DIE AT ANY POINT. iOS discards a backgrounded web view without
 * warning or ceremony, and whatever was held in memory goes with it. So this
 * hands over whole minutes as they are earned rather than at the end, and
 * keeps the remainder: read ninety seconds twice and you have read three
 * minutes, not two.
 */

import { MAX_SESSION_MIN } from "./reading-goal.ts";

/**
 * Silence longer than this is not reading.
 *
 * It has to be longer than a page takes, and a page of a novel is well under
 * a minute while a page of anything technical can be several. Five minutes is
 * past the slowest honest page and well short of a walk to the kitchen.
 */
export const IDLE_MS = 5 * 60_000;

/** The same ceiling the manual timer uses, for the same reason. */
export const MAX_RUN_MS = MAX_SESSION_MIN * 60_000;

export interface Clock {
  /** When the run in progress began, or null while nothing is counting. */
  since: number | null;
  /** The last sign that somebody is actually there. */
  seen: number;
  /** Milliseconds counted and not yet banked, because a minute is the unit. */
  carry: number;
}

/** A book has just been opened. Opening it is itself a sign of life. */
export function startClock(now: number): Clock {
  return { since: now, seen: now, carry: 0 };
}

/** Where the run in progress has to stop, whether or not it knows it yet. */
function wall(c: Clock): number {
  return c.seen + IDLE_MS;
}

/** Milliseconds the open run has earned by `now`, idle wall and cap applied. */
export function runningMs(c: Clock, now: number): number {
  if (c.since === null) return 0;
  const end = Math.min(now, wall(c));
  return Math.min(MAX_RUN_MS, Math.max(0, end - c.since));
}

/**
 * Move what the open run has earned into the carry, and keep counting.
 *
 * The run restarts from wherever it was counted to rather than from `now`,
 * which is what makes this safe to call as often as you like: fold twice in
 * the same millisecond and the second one earns nothing. It is also what
 * stalls the clock against the idle wall — once the run has been counted up
 * to `seen + IDLE_MS`, every later fold adds zero until somebody comes back.
 */
export function fold(c: Clock, now: number): Clock {
  if (c.since === null) return c;
  const ms = runningMs(c, now);
  return { since: Math.min(now, wall(c)), seen: c.seen, carry: c.carry + ms };
}

/**
 * Somebody is there: a page turned, a word held, a finger on the paper.
 *
 * Coming back after the wall does not retroactively count the silence. The run
 * is settled at the wall first and a fresh one starts at `now`, so putting the
 * book down for an hour costs you the hour and not the grace.
 */
export function sawActivity(c: Clock, now: number): Clock {
  if (c.since === null) return { since: now, seen: now, carry: c.carry };
  if (now > wall(c)) {
    const settled = fold(c, now);
    return { since: now, seen: now, carry: settled.carry };
  }
  return { since: c.since, seen: Math.max(c.seen, now), carry: c.carry };
}

/** The reader went away — backgrounded, closed, screen locked. */
export function stopClock(c: Clock, now: number): Clock {
  const settled = fold(c, now);
  return { since: null, seen: settled.seen, carry: settled.carry };
}

/** And came back. Returning is a sign of life, so the wall moves with it. */
export function resumeClock(c: Clock, now: number): Clock {
  if (c.since !== null) return sawActivity(c, now);
  return { since: now, seen: now, carry: c.carry };
}

/**
 * Take the whole minutes out, leaving the remainder behind.
 *
 * The remainder is the point. Banking `floor` and discarding what is left
 * loses up to a minute every time it is called, and this is called every
 * minute — a reader that counted nothing but fifty-nine-second fragments
 * would show a zero after an hour.
 */
export function bankMinutes(c: Clock, now: number): { clock: Clock; minutes: number } {
  const settled = fold(c, now);
  const minutes = Math.floor(settled.carry / 60_000);
  if (minutes <= 0) return { clock: settled, minutes: 0 };
  return { clock: { ...settled, carry: settled.carry - minutes * 60_000 }, minutes };
}
