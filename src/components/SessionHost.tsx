import { useMemo } from "react";
import { Pause, Timer } from "lucide-react";
import { RoutineRunner } from "@/components/RoutineRunner";
import { routineForRun } from "@/lib/focus";
import { clock, stepLeftSeconds } from "@/lib/routine";
import { useSoma } from "@/lib/store";
import { useFocusSession } from "@/lib/use-focus-session";
import { cn } from "@/lib/utils";

/**
 * The one place a running routine or focus queue lives on screen.
 *
 * It used to be mounted inside RoutineCard, which meant a run only existed
 * while the Time tab was open — start one from the dashboard's "next 3" and
 * there was nowhere for it to appear, and a run restored after the app was
 * killed had no screen until you went looking for it. Mounted once in the
 * shell, it shows whatever `dayRoutineRun` points at, from anywhere.
 *
 * Minimised, it is a pill above the dock: the "focus is on" state. It keeps
 * the clock visible while you look something up in another tab, and tapping
 * it brings the runner back. Nothing is blocked — this app has no way to
 * block other apps reliably, so it does not pretend to.
 */
export function SessionHost() {
  const run = useSoma((s) => s.dayRoutineRun);
  const routines = useSoma((s) => s.dayRoutines);
  const queues = useSoma((s) => s.focusQueues);
  const minimised = useSoma((s) => s.focusMinimised);
  const setMinimised = useSoma((s) => s.setFocusMinimised);

  const routine = useMemo(() => routineForRun(run, routines, queues), [run, routines, queues]);
  // Always mounted while anything runs, minimised or not: this is what keeps
  // the lock screen and the step-end notification in step with the run.
  const snap = useFocusSession(routine, run);

  if (!run || !routine) return null;

  if (!minimised) {
    return <RoutineRunner routine={routine} onMinimise={() => setMinimised(true)} />;
  }

  const left = stepLeftSeconds(routine, run, Date.now());
  const paused = !!run.pausedAt;
  return (
    <button
      type="button"
      onClick={() => setMinimised(false)}
      aria-label={`${routine.name} running: ${snap?.label ?? ""}. Open.`}
      className="fixed inset-x-3 z-[45] mx-auto flex max-w-md items-center gap-2.5 rounded-full border border-border-strong bg-surface px-3 py-2 shadow-lg"
      style={{ bottom: "calc(var(--dock-h, 7rem) + 0.5rem)" }}
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full text-accent-ink"
        style={{ background: routine.color }}
      >
        {paused ? <Pause className="size-4" /> : <Timer className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
          {snap?.finished ? `${routine.name} · done` : `${routine.name} · ${snap?.position ?? 0}/${snap?.total ?? 0}`}
        </span>
        <span className="block truncate text-sm font-bold">{snap?.label}</span>
      </span>
      {!snap?.finished && (
        <span
          className={cn(
            "shrink-0 font-display text-lg font-extrabold tabular",
            paused && "opacity-50",
            left < 0 && "text-danger",
          )}
        >
          {left < 0 ? `+${clock(-left)}` : clock(left)}
        </span>
      )}
    </button>
  );
}
