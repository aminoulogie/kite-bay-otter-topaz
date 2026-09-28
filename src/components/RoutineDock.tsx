import { useEffect, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { RoutineRunner, useRoutineControls, useRunTick } from "@/components/RoutineRunner";
import { activityState } from "@/lib/routine-activity";
import { showRoutineActivity } from "@/lib/native/routine-activity";
import { clock, isFinished, spans, stepLeftSeconds, type Routine, type RunState } from "@/lib/routine";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * A running routine, wherever you are in the app.
 *
 * Full screen by default; pulled down, it shrinks to a player above the tab
 * bar — the way a music app's now-playing screen does — and the rest of the
 * app is usable underneath while the steps keep counting. Tap the player (or
 * swipe it up) to open it again.
 *
 * Mounted once, by the app shell, so the player follows you from tab to tab
 * instead of living inside the Time tab's card. It also keeps the lock
 * screen's Live Activity in step with the run (see lib/native/routine-activity).
 */
export function RoutineDock() {
  const run = useSoma((s) => s.dayRoutineRun);
  const routines = useSoma((s) => s.dayRoutines);
  const routine = routines.find((r) => r.id === run?.routineId);
  const [mini, setMini] = useState(false);

  // A routine that has just been started opens full screen.
  useEffect(() => {
    setMini(false);
  }, [run?.routineId, run?.startedAt]);

  // The lock screen and Dynamic Island follow the run: a new step, a pause,
  // a skip. Between those the phone counts down by itself. No run (stopped,
  // finished, or the app reopened after being closed) ends it.
  useEffect(() => {
    void showRoutineActivity(activityState(routine, run));
  }, [routine, run]);

  if (!run || !routine) return null;
  if (mini && !isFinished(routine, run)) {
    return <MiniPlayer routine={routine} run={run} onExpand={() => setMini(false)} />;
  }
  return <RoutineRunner routine={routine} onClose={() => undefined} onMinimize={() => setMini(true)} />;
}

function MiniPlayer({
  routine, run, onExpand,
}: {
  routine: Routine;
  run: RunState;
  onExpand: () => void;
}) {
  const { finishStep, togglePause } = useRoutineControls(routine);
  useRunTick(run, 500);

  const list = spans(routine);
  const cur = list[run.index];
  const next = list[run.index + 1];
  const left = stepLeftSeconds(routine, run, Date.now());
  const stepTotal = cur ? cur.endSeconds - cur.startSeconds : 1;
  const progress = Math.max(0, Math.min(1, 1 - left / stepTotal));
  const tone = left < 0 ? "var(--color-danger)" : left <= stepTotal * 0.2 ? "var(--color-warn)" : routine.color;

  // Swiping the player up opens it, as tapping it does.
  const from = useRef<number | null>(null);

  // The page leaves room for the player while it is showing, so the last
  // card on any tab can still be scrolled out from under it.
  useEffect(() => {
    document.documentElement.style.setProperty("--player-h", "4.25rem");
    return () => document.documentElement.style.removeProperty("--player-h");
  }, []);

  const R = 15;
  const C = 2 * Math.PI * R;

  return (
    <div
      className="soma-dock pointer-events-none fixed inset-x-0 z-[45] flex justify-center px-3 lg:bottom-4"
      style={{ bottom: "calc(var(--dock-h, 5.5rem) + 0.4rem)" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`${routine.name}: ${cur?.step.label ?? ""}, ${clock(left)} left. Open`}
        onClick={onExpand}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onExpand()}
        onPointerDown={(e) => {
          from.current = e.clientY;
        }}
        onPointerUp={(e) => {
          if (from.current != null && from.current - e.clientY > 30) onExpand();
          from.current = null;
        }}
        className="glass-dock pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-border-strong py-2 pl-2 pr-1.5 shadow-lg"
      >
        {/* The step, as a ring with the countdown beside it: the whole
            runner in the space of one row. */}
        <svg viewBox="0 0 36 36" className="size-10 shrink-0 -rotate-90" aria-hidden>
          <circle cx={18} cy={18} r={R} fill="none" stroke="var(--color-surface-3)" strokeWidth={4} />
          <circle
            cx={18}
            cy={18}
            r={R}
            fill="none"
            stroke={tone}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: "stroke-dashoffset 500ms linear, stroke 300ms" }}
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight">{cur?.step.label}</div>
          <div className="truncate text-[0.68rem] font-semibold text-faint">
            <span className={cn("tabular font-extrabold", run.pausedAt && "opacity-50")} style={{ color: tone }}>
              {left < 0 ? `${clock(-left)} over` : clock(left)}
            </span>
            {" · "}
            {run.pausedAt ? "paused" : next ? `next: ${next.step.label}` : routine.name}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePause();
          }}
          aria-label={run.pausedAt ? "Resume" : "Pause"}
          className="grid size-10 shrink-0 place-items-center rounded-full"
        >
          {run.pausedAt ? <Play className="size-5" /> : <Pause className="size-5" />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            finishStep();
          }}
          aria-label="Done with this step"
          className="grid size-10 shrink-0 place-items-center rounded-full"
          style={{ background: routine.color, color: "#0b0d12" }}
        >
          <Check className="size-5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
