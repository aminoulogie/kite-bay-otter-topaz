import { useEffect, useRef, useState } from "react";
import { snapshotKey, snapshotOf } from "./focus.ts";
import { cancelAlert, endLive, scheduleAlert, showLive } from "./live-activity.ts";
import { buzz, chime, notifyNow } from "./rest-alarm.ts";
import type { Routine, RunState } from "./routine.ts";

/** The one notification id a running step uses, so a new step replaces it. */
const ALERT_ID = "soma-focus-step";

/**
 * Keeps everything outside the runner in step with the run.
 *
 * The same shape as use-rest-timer, for the same reasons: nothing assumes a
 * timer fires on time, and a frozen tab catches up on `visibilitychange`.
 * Three outputs, each only on a change that matters:
 *
 *   - the Live Activity (native only), updated when the snapshot key changes —
 *     a new step, a pause, the end — and re-sent whenever the app comes back
 *     to the foreground, which is what brings it back if iOS ended it;
 *   - a scheduled lock-screen notification for the moment the current step's
 *     time runs out, rescheduled when that moment moves and cancelled when
 *     the step is finished, paused or the run ends;
 *   - a soft in-app alert (chime + buzz) the first time a step is seen past
 *     its end while the app is open. Soft, because the step is NOT advanced:
 *     the user says when a step is done.
 */
export function useFocusSession(routine: Routine | null, run: RunState | null) {
  const [now, setNow] = useState(() => Date.now());
  const lastKey = useRef<string | null>(null);
  const firedFor = useRef<string | null>(null);
  const wasRunning = useRef(false);

  const snap = routine && run ? snapshotOf(routine, run, now) : null;
  const key = snap ? snapshotKey(snap) : null;

  // A slow tick — the runner has its own fast one. This only has to notice
  // that a step's time is up.
  useEffect(() => {
    if (!run || run.pausedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      // Forget what was last sent, so the next render re-sends it: the
      // activity may have been ended by the system while we were away.
      lastKey.current = null;
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run, run?.pausedAt]);

  // Live Activity + scheduled alert, on meaningful change only.
  useEffect(() => {
    if (!snap || !key) {
      if (wasRunning.current) {
        wasRunning.current = false;
        lastKey.current = null;
        void endLive(0);
        void cancelAlert(ALERT_ID);
      }
      return;
    }
    wasRunning.current = true;
    if (lastKey.current === key) return;
    lastKey.current = key;

    void showLive(snap);
    if (snap.finished) {
      void cancelAlert(ALERT_ID);
      // Long enough to see "Done" on the lock screen, then it goes.
      void endLive(8);
      return;
    }
    if (snap.stepEndsAt && snap.stepEndsAt > Date.now()) {
      void scheduleAlert({
        id: ALERT_ID,
        at: snap.stepEndsAt,
        title: `Time's up: ${snap.label}`,
        body: snap.nextLabel
          ? `Next: ${snap.nextLabel}. Open SOMA and tap Done when you are.`
          : "Last one. Open SOMA and tap Done when you are.",
      });
    } else {
      void cancelAlert(ALERT_ID);
    }
    // `snap` is derived from the key's inputs; the key is the change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The soft alert, once per step, when its time is seen to be up.
  useEffect(() => {
    if (!snap || snap.finished || snap.paused || !snap.stepEndsAt || !run) return;
    const stepId = `${run.routineId}:${run.index}:${snap.stepEndsAt}`;
    if (now < snap.stepEndsAt || firedFor.current === stepId) return;
    firedFor.current = stepId;
    void chime();
    buzz();
    if (document.visibilityState !== "visible") {
      void notifyNow(`Time's up: ${snap.label}`, "Tap Done when you are.");
    }
  }, [now, snap, run]);

  // Leaving the page entirely (the tab closes) is not an end: the run is
  // persisted and resumes. Only an explicit end tears the activity down.
  return snap;
}
