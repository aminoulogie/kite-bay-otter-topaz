import { Play, Zap } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { focusIdFor, nextUp } from "@/lib/focus";
import { tapMedium } from "@/lib/haptics";
import { clock, duration, type RoutineStep } from "@/lib/routine";
import { useSoma } from "@/lib/store";

/**
 * The next three things in today's focus list, and a button to start.
 *
 * A glance for the Home page: what am I doing next, and how long did I give
 * it. Starting from here opens the same runner as the Time tab — SessionHost
 * is mounted app-wide, so there is no need to go and find it.
 */
export function FocusNext() {
  const activeDate = useSoma((s) => s.activeDate);
  const queue = useSoma((s) => s.focusQueues[s.activeDate]) ?? EMPTY;
  const run = useSoma((s) => s.dayRoutineRun);
  const begin = useSoma((s) => s.beginFocus);
  const setTab = useSoma((s) => s.setTab);

  const runningHere = run?.routineId === focusIdFor(activeDate);
  const items = nextUp(queue, runningHere && run ? run.index : 0, 3);

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-1.5">
          <Zap className="size-4 text-accent" /> Next up
        </span>
        {queue.length > 0 && (
          <span className="text-[0.65rem] font-bold uppercase tracking-wider tabular text-faint">
            {duration(queue.filter((s) => !s.isBreak).reduce((a, s) => a + s.seconds, 0))}
          </span>
        )}
      </CardTitle>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => setTab("time")}
          className="w-full rounded-xl border border-dashed border-border py-3 text-xs font-bold text-faint"
        >
          Nothing queued — build today's focus list on Time
        </button>
      ) : (
        <>
          <ol className="mb-2 space-y-1">
            {items.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[0.6rem] font-extrabold tabular text-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{s.label}</span>
                <span className="shrink-0 text-[0.7rem] tabular text-faint">{clock(s.seconds)}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              tapMedium();
              begin();
            }}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-bold text-accent-ink"
          >
            <Play className="size-4" fill="currentColor" /> {runningHere ? "Open the run" : "Run"}
          </button>
        </>
      )}
    </Card>
  );
}

const EMPTY: RoutineStep[] = [];
