import { useEffect, useRef, useState } from "react";
import { buzz, chime, notifyNow } from "./rest-alarm.ts";
import { hasElapsed, secondsLeft, tickMs } from "./rest-timer.ts";

/**
 * Drives the rest countdown and fires the alarm exactly once per timer.
 *
 * Two things this has to get right that a plain setInterval does not:
 *
 * The tick stops when no timer is running. The old one ran four times a second
 * for the whole session, re-rendering the Train tab between every set of every
 * workout, whether or not anything was counting.
 *
 * And it catches up. A backgrounded tab does not tick — iOS freezes it outright
 * when the screen locks — so the deadline routinely passes with no interval
 * having run. Firing on `visibilitychange` as well as on the tick means coming
 * back to the app tells you the rest is over, rather than showing a silent zero
 * and leaving you to work out how long you have been standing there.
 */
export function useRestTimer(endsAt: number | null, onDone?: () => void) {
  const [now, setNow] = useState(() => Date.now());
  // Which deadline has already sounded, so returning to the app twice does not
  // chime twice for the same rest.
  const fired = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    // A new timer is a new alarm, even if it happens to share a deadline.
    if (endsAt !== fired.current) fired.current = null;
  }, [endsAt]);

  useEffect(() => {
    const check = () => {
      const t = Date.now();
      setNow(t);
      if (!endsAt || fired.current === endsAt || !hasElapsed(endsAt, t)) return;
      fired.current = endsAt;
      void chime();
      buzz();
      void notifyNow("Rest over", "Next set.");
      done.current?.();
    };

    check();
    const every = tickMs(endsAt);
    const id = every ? setInterval(check, every) : null;
    // The one that matters on a phone: the tab was frozen, and this is the
    // first code to run after the screen came back on.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endsAt]);

  return { now, left: secondsLeft(endsAt, now) };
}
