/**
 * The reader logging its own minutes.
 *
 * Wire this into whatever is showing a book and the reading goal fills itself
 * in. What it replaced matters here: the shelf used to start the goal card's
 * stopwatch when a book opened and stop it when the book closed, which is the
 * obvious version and is wrong in two ways — one loses minutes you did read,
 * the other hands you minutes you did not.
 *
 * IT BANKS AS IT GOES, every minute rather than at the end. A stopwatch that
 * pays out on close pays out nothing when iOS discards the backgrounded web
 * view, which it does routinely and without telling anybody. Forty minutes and
 * a phone call used to be forty minutes lost.
 *
 * IT STOPS WHEN YOU DO. A book left open on the arm of a chair used to count
 * until something closed it. The run now ends at the last sign of life plus a
 * grace, and the wall stays there however long the silence lasts — see
 * `reading-clock.ts`, which holds the arithmetic and its tests.
 *
 * IT STOPS WHEN THE SCREEN DOES. `visibilitychange` fires when the app is
 * backgrounded and when the phone is locked, which are the two ways a session
 * ends without the book being closed.
 *
 * IT STANDS ASIDE FOR THE MANUAL TIMER. The stopwatch on the Reading card is
 * for paper. If you started it on purpose and then opened a book here, the
 * same minutes would be counted twice, and the one you started by hand wins.
 */

import { useCallback, useEffect, useRef } from "react";
import { type Clock, bankMinutes, resumeClock, sawActivity, startClock, stopClock } from "./reading-clock.ts";
import { getLocalDateKey } from "./soma";
import { useSoma } from "./store";

/** How often earned minutes are handed over. */
const BANK_MS = 60_000;

/**
 * @param active Whether a book is open and readable right now.
 * @param onDone Told the session's total when the reader goes away, for the
 *   "23 min read" that used to come from stopping the stopwatch.
 */
export function useReadingClock(active: boolean, onDone?: (minutes: number) => void): () => void {
  const clock = useRef<Clock | null>(null);
  const total = useRef(0);
  const running = useSoma((s) => s.readingSince !== null);

  const report = useRef(onDone);
  useEffect(() => {
    report.current = onDone;
  });

  /**
   * Bank into today, and not into the date being browsed elsewhere.
   *
   * `addReading` defaults to the store's active date, which is whichever day
   * you last tapped on the calendar. Reading happens now, and filing tonight's
   * chapter under a Tuesday you were looking at is a quiet corruption of the
   * one number this whole card is about.
   */
  const bank = useCallback((c: Clock, now: number): Clock => {
    const out = bankMinutes(c, now);
    if (out.minutes > 0) {
      total.current += out.minutes;
      useSoma.getState().addReading(out.minutes, getLocalDateKey(new Date()));
    }
    return out.clock;
  }, []);

  const saw = useCallback(() => {
    if (clock.current) clock.current = sawActivity(clock.current, Date.now());
  }, []);

  useEffect(() => {
    // Not reading, or reading on a clock somebody started by hand: settle
    // whatever is held and stand down. The carry survives in the ref, so a
    // book that finishes loading picks up where the last stretch left off.
    if (!active || running) {
      if (clock.current) clock.current = bank(stopClock(clock.current, Date.now()), Date.now());
      return;
    }

    clock.current = clock.current
      ? resumeClock(clock.current, Date.now())
      : startClock(Date.now());

    const tick = () => {
      if (clock.current) clock.current = bank(clock.current, Date.now());
    };
    const seen = () => {
      if (clock.current) clock.current = sawActivity(clock.current, Date.now());
    };
    const away = () => {
      if (!clock.current) return;
      const now = Date.now();
      clock.current =
        document.visibilityState === "hidden"
          ? bank(stopClock(clock.current, now), now)
          : resumeClock(clock.current, now);
    };
    const gone = () => {
      if (clock.current) clock.current = bank(stopClock(clock.current, Date.now()), Date.now());
    };

    const id = setInterval(tick, BANK_MS);
    window.addEventListener("pointerdown", seen, true);
    window.addEventListener("keydown", seen, true);
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", gone);

    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", seen, true);
      window.removeEventListener("keydown", seen, true);
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", gone);
      gone();
    };
  }, [active, running, bank]);

  /**
   * The session's total, once, on the way out.
   *
   * Declared after the effect that does the counting so React runs this
   * cleanup second: the last minutes have to be banked before anything reads
   * the total, and cleanups run in the order their effects were declared.
   */
  useEffect(
    () => () => {
      if (total.current > 0) report.current?.(total.current);
    },
    [],
  );

  return saw;
}
