import { useMemo } from "react";
import { toast } from "sonner";
import { MoneySheet } from "@/components/money/money-ui";
import { ExerciseIcon } from "@/components/ExerciseIcon";
import { PPL_WEEK, SPLIT_NAMES, buildSplit, type Bucket } from "@/lib/split-builder";
import { WEEKDAYS, isRestSplit } from "@/lib/programs";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";

const PROGRAM_ID = "ppl-from-log";
/** Saturday first, the way the week is meant to be read. */
const ORDER = [6, 0, 1, 2, 3, 4, 5];

/**
 * Build the week from the log: the exercises that kept coming back, split
 * into push, pull and legs, then made the active programme — Saturday legs,
 * push, pull, legs, push, pull, Friday rest.
 */
export function BuildSplitSheet({ onClose }: { onClose: () => void }) {
  const history = useSoma((s) => s.history);
  const routines = useSoma((s) => s.routines);
  const saveRoutine = useSoma((s) => s.saveRoutine);
  const programs = useSoma((s) => s.programs);
  const setPrograms = useSoma((s) => s.setPrograms);
  const setActiveProgram = useSoma((s) => s.setActiveProgram);
  const resetLive = useSoma((s) => s.resetLive);
  const loadSplit = useSoma((s) => s.loadSplit);
  const today = getLocalDateKey(new Date());
  const split = useMemo(() => buildSplit(history, today), [history, today]);
  const empty = (["push", "pull", "legs"] as const).filter((b) => split.days[b].length === 0);

  const apply = () => {
    const existing = routines();
    for (const b of ["push", "pull", "legs"] as const) {
      const name = SPLIT_NAMES[b];
      // A day with nothing logged keeps whatever that routine already had.
      if (!split.days[b].length) continue;
      const err = saveRoutine(name, split.days[b].map((n) => ({ name: n })), name in existing ? name : undefined);
      if (err) {
        toast.error(`${name}: ${err}`);
        return;
      }
    }
    setPrograms([
      ...programs.filter((p) => p.id !== PROGRAM_ID),
      { id: PROGRAM_ID, name: "PPL · Friday rest", kind: "week", days: [...PPL_WEEK] },
    ]);
    setActiveProgram(PROGRAM_ID);
    // Today's session, if nothing is ticked yet, reopens on the new split.
    const live = useSoma.getState().live;
    if (!live.finished && !live.exercises.some((e) => e.sets.some((x) => x.done))) {
      resetLive();
      const split = useSoma.getState().live.split;
      if (!isRestSplit(split)) loadSplit(split);
    }
    toast.success("New split is your programme now");
    onClose();
  };

  return (
    <MoneySheet title="Build my split" onClose={onClose}>
      <p className="mb-3 text-xs text-muted">
        From {split.sessions} {split.sessions === 1 ? "session" : "sessions"} in the last {split.windowDays} days:
        the exercises you kept repeating, sorted into push, pull and legs.
      </p>

      <div className="mb-3 grid grid-cols-7 gap-1 text-center">
        {ORDER.map((d) => (
          <div key={d} className="rounded-xl bg-surface-2 px-0.5 py-1.5">
            <div className="text-[0.55rem] font-bold uppercase text-faint">{WEEKDAYS[d]!.slice(0, 3)}</div>
            <div className="truncate text-[0.62rem] font-extrabold">
              {isRestSplit(PPL_WEEK[d]!) ? "Rest" : PPL_WEEK[d]}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {(["legs", "push", "pull"] as Bucket[]).map((b) => (
          <div key={b} className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-1.5 font-display text-sm font-extrabold">{SPLIT_NAMES[b]}</div>
            {split.days[b].length ? (
              <ol className="space-y-1">
                {split.days[b].map((n, i) => (
                  <li key={n} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-right tabular text-faint">{i + 1}</span>
                    <ExerciseIcon name={n} size={20} />
                    <span className="truncate font-semibold">{n}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-faint">Nothing logged for this day — it keeps its current exercises.</p>
            )}
          </div>
        ))}
      </div>

      {split.sessions === 0 ? (
        <p className="mt-3 text-xs text-warn">No logged workouts yet to build from.</p>
      ) : (
        <button
          type="button"
          onClick={apply}
          className="mt-4 h-12 w-full rounded-2xl bg-accent text-sm font-extrabold text-accent-ink active:scale-[0.99]"
        >
          Use this split{empty.length ? ` (keeps your ${empty.map((b) => SPLIT_NAMES[b]).join(", ")})` : ""}
        </button>
      )}
    </MoneySheet>
  );
}
