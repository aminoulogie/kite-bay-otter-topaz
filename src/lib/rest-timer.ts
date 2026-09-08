/**
 * The rest timer, and the part of it that was actually broken.
 *
 * The countdown itself was never the problem: `restEndsAt` has always been a
 * timestamp, so locking the phone and coming back recomputes correctly. What
 * did not work is the thing you need in a gym — being TOLD. The timer only
 * existed while you were looking at it, and between sets nobody is looking at
 * it. So a 90-second rest meant unlocking the phone to check a number.
 *
 * Three things fix that, in descending order of how far they reach:
 *
 *   1. a scheduled local notification, which arrives on the lock screen even
 *      with the app closed. Needs the native wrapper — Safari cannot schedule
 *      a notification for later, so in the browser this does nothing and says
 *      so rather than pretending.
 *   2. a chime and a vibration the moment it hits zero, which works whenever
 *      the app is open, including in the background on Android.
 *   3. catching up on return: if it elapsed while you were away, the app says
 *      "rest done" when you come back instead of quietly showing 0.
 *
 * Nothing here assumes a timer fires on time. A tab that was frozen for two
 * minutes wakes with the deadline long gone, and that has to read as finished
 * rather than as a negative countdown.
 */

/** Seconds left, never negative, rounded up so 0.4s left still reads "1s". */
export function secondsLeft(endsAt: number | null, now: number): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Whether a running timer has reached its end. */
export function hasElapsed(endsAt: number | null, now: number): boolean {
  return endsAt != null && now >= endsAt;
}

/**
 * How much of the rest is done, 0 to 1, for a progress ring.
 *
 * Guards a zero total: a timer started with no duration would divide by zero
 * and paint NaN across the ring.
 */
export function restProgress(endsAt: number | null, total: number, now: number): number {
  if (!endsAt || !(total > 0)) return 0;
  const left = secondsLeft(endsAt, now);
  return Math.max(0, Math.min(1, 1 - left / total));
}

/** "1:30", "0:45" — minutes and seconds, which is how rest is spoken. */
export function formatRest(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * How often to re-render a running timer.
 *
 * A quarter second was four times the work for no visible gain — the display
 * is whole seconds. Returns null when nothing is running, so an idle Train tab
 * stops waking the phone every tick.
 */
export function tickMs(endsAt: number | null): number | null {
  return endsAt ? 1000 : null;
}
