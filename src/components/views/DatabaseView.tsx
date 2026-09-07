import { useMemo, useState } from "react";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import {
  allDates, buildTrainingLog, dayBest, formatSet, groupsOf,
  type ExerciseLog, type LoggedSet,
} from "@/lib/training-log";
import { rateAllExercises, ratingBreakdown, ratingLabel, ratingTone } from "@/lib/exercise-ratings";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Every set ever done.
 *
 * Built as muscle group → exercise → that exercise's own dates, rather than as
 * one wide exercise-by-date grid. The grid was mostly empty: an exercise
 * trained twenty times across two hundred training days is 90% blank cells, and
 * on a phone that meant scrolling sideways through nothing to find anything.
 *
 * Each exercise opens into a fixed-height window that scrolls INSIDE itself, so
 * the page never grows and the app stays where it was. Newest first, because
 * the last session is the one you are trying to beat.
 */

type SortBy = "date" | "e1rm" | "top";

const SORTS: { id: SortBy; label: string }[] = [
  { id: "date", label: "Newest" },
  { id: "e1rm", label: "Best 1RM" },
  { id: "top", label: "Heaviest" },
];

type Tier = "pr" | "near" | "mid" | "light";

const TIERS: Record<Tier, { bg: string; fg: string; label: string; hint: string }> = {
  pr: { bg: "bg-[#7f1d1d]", fg: "text-red-50", label: "PR", hint: "personal best" },
  near: { bg: "bg-[#9a3412]", fg: "text-orange-50", label: "Near", hint: "within 10%" },
  mid: { bg: "bg-[#78350f]", fg: "text-amber-50", label: "Mid", hint: "working weight" },
  light: { bg: "bg-[#14532d]", fg: "text-green-50", label: "Light", hint: "well below best" },
};

function tierFor(best: number, dayValue: number): Tier {
  if (!best || !dayValue) return "light";
  const r = dayValue / best;
  if (r >= 0.995) return "pr";
  if (r >= 0.9) return "near";
  if (r >= 0.75) return "mid";
  return "light";
}

function topWeight(sets: LoggedSet[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight), 0);
}

export function DatabaseView() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);

  // Bodyweight lifts carry the body's own load, which lives in the nutrition log.
  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);

  const log = useMemo(() => buildTrainingLog(history, bodyweights), [history, bodyweights]);
  const groups = useMemo(() => groupsOf(log), [log]);
  const ratings = useMemo(() => rateAllExercises(history, log), [history, log]);

  const [group, setGroup] = useState<string | null>(null);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [sort, setSort] = useState<SortBy>("date");

  const rows = useMemo(
    () =>
      (group ? log.filter((e) => e.group === group) : []).sort(
        (a, b) => Object.keys(b.days).length - Object.keys(a.days).length,
      ),
    [log, group],
  );

  if (!group) {
    return (
      <Card>
        <CardTitle>Database</CardTitle>
        <p className="mb-3 text-xs text-muted">
          {allDates(log).length} training days across {log.length} exercises.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-3 text-left active:bg-surface-3"
            >
              <span className="text-sm font-bold">{g}</span>
              <span className="text-xs font-semibold text-faint">
                {log.filter((e) => e.group === g).length}
              </span>
            </button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setGroup(null);
            setOpenExercise(null);
          }}
          className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold text-muted"
        >
          ← Groups
        </button>
        <span className="font-display text-sm font-extrabold">{group}</span>
        <span className="ml-auto text-[0.7rem] text-faint">{rows.length} exercises</span>
      </div>

      {rows.map((ex) => {
        const open = openExercise === ex.name;
        const dates = Object.keys(ex.days);
        const best = Math.max(0, ...Object.values(ex.days).map(dayBest));
        const heaviest = Math.max(0, ...Object.values(ex.days).map(topWeight));
        const rated = ratings.get(ex.name);

        return (
          <div key={ex.name} className="overflow-hidden rounded-2xl border border-border bg-surface">
            <button
              type="button"
              onClick={() => setOpenExercise(open ? null : ex.name)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-3 py-3 text-left active:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8rem] font-bold">{ex.name}</div>
                <div className="mt-0.5 text-[0.65rem] text-faint">
                  {dates.length} {dates.length === 1 ? "session" : "sessions"} · best{" "}
                  {Math.round(best)}kg 1RM
                </div>
              </div>
              {/* Shown only once there is enough quality data to mean
                  something. A number on five unrated sets would look earned
                  and be noise. */}
              {rated?.usable ? (
                <div className="shrink-0 text-right">
                  <div className={cn("font-display text-sm font-extrabold tabular-nums", ratingTone(rated.rating.score))}>
                    {rated.rating.score.toFixed(1)}
                  </div>
                  <div className="text-[0.55rem] text-faint">/10</div>
                </div>
              ) : (
                <div className="shrink-0 text-[0.55rem] text-faint">unrated</div>
              )}
              <ChevronDown
                className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
              />
            </button>

            {open && (
              <ExerciseWindow
                ex={ex}
                best={best}
                heaviest={heaviest}
                sort={sort}
                onSort={setSort}
                rated={ratings.get(ex.name)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One exercise's sessions, in a window that scrolls inside itself.
 *
 * Fixed to under half the viewport so opening an exercise never pushes the page
 * around — the list you were reading stays where it was.
 */
function ExerciseWindow({
  ex, best, heaviest, sort, onSort, rated,
}: {
  ex: ExerciseLog;
  best: number;
  heaviest: number;
  sort: SortBy;
  onSort: (s: SortBy) => void;
  rated?: { rating: import("@/lib/set-quality").Rating; usable: boolean };
}) {
  // Which day is open for editing, if any. One at a time: two open editors in
  // a 42vh window is more chrome than data.
  const [editDate, setEditDate] = useState<string | null>(null);

  const entries = useMemo(() => {
    const list = Object.entries(ex.days).map(([date, sets]) => ({
      date,
      sets,
      e1rm: dayBest(sets),
      top: topWeight(sets),
    }));
    if (sort === "e1rm") return list.sort((a, b) => b.e1rm - a.e1rm);
    if (sort === "top") return list.sort((a, b) => b.top - a.top);
    // Newest first: the last session is the one being chased.
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [ex.days, sort]);

  return (
    <div className="soma-expand border-t border-border">
      {rated?.usable ? (
        <div className="border-b border-border bg-surface-2 px-3 py-2">
          <div className="mb-1 flex items-baseline gap-2">
            <span className={cn("font-display text-sm font-extrabold", ratingTone(rated.rating.score))}>
              {rated.rating.score.toFixed(1)}/10
            </span>
            <span className="text-[0.65rem] font-bold text-muted">
              {ratingLabel(rated.rating.score)}
            </span>
            <span className="ml-auto text-[0.58rem] text-faint">
              {rated.rating.sampleSets} rated sets · {rated.rating.confidence} confidence
            </span>
          </div>
          {/* A bare number invites arguing with it; the breakdown makes it
              checkable and points at what would move it. */}
          <div className="space-y-0.5">
            {ratingBreakdown(rated.rating).map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-[0.58rem] text-muted">{b.label}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${b.pct}%` }} />
                </div>
                <span className="w-7 shrink-0 text-right text-[0.55rem] tabular-nums text-faint">
                  {b.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="border-b border-border bg-surface-2 px-3 py-2 text-[0.6rem] leading-snug text-faint">
          Not rated yet — rate the sets on this lift for a few sessions and a score appears.
          Imported history carries no set ratings, so it cannot be scored.
        </p>
      )}
      <div className="flex items-center gap-1 border-b border-border bg-surface-2 px-2 py-1.5">
        <span className="mr-1 text-[0.6rem] font-bold uppercase tracking-wide text-faint">Sort</span>
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSort(s.id)}
            className={cn(
              "rounded-md px-2 py-1 text-[0.65rem] font-bold transition-colors",
              sort === s.id ? "bg-accent text-accent-ink" : "text-muted",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Scrolls inside itself: the page height never changes. */}
      <div className="max-h-[42vh] overflow-y-auto overscroll-contain">
        {entries.map((row) => {
          const tier = tierFor(best, row.e1rm);
          const t = TIERS[tier];
          const isHeaviest = row.top >= heaviest && heaviest > 0;
          // Only days that came from a session logged in the app can be
          // written back. Imported spreadsheet history has no session behind
          // it, so it is shown but not offered for editing.
          const src = ex.sources?.[row.date];
          const editing = editDate === row.date && !!src;
          return (
            <div key={row.date} className="border-b border-border/40 px-3 py-2 last:border-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[0.7rem] font-bold tabular-nums">
                  {new Date(row.date + "T00:00:00").toLocaleDateString(undefined, {
                    day: "2-digit", month: "short", year: "2-digit",
                  })}
                </span>
                <span
                  className={cn("rounded px-1.5 py-0.5 text-[0.55rem] font-extrabold", t.bg, t.fg)}
                >
                  {t.label}
                </span>
                {isHeaviest && (
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.55rem] font-extrabold text-fg">
                    HEAVIEST
                  </span>
                )}
                <span className="ml-auto text-[0.62rem] tabular-nums text-faint">
                  {Math.round(row.e1rm)}kg 1RM
                </span>
                {src && (
                  <button
                    type="button"
                    aria-label={editing ? "Stop editing this day" : `Edit ${row.date}`}
                    onClick={() => setEditDate(editing ? null : row.date)}
                    className={cn("shrink-0 p-0.5", editing ? "text-accent-text" : "text-faint")}
                  >
                    {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
                  </button>
                )}
              </div>

              {editing && src ? (
                <DayEditor
                  date={row.date}
                  exIdx={src.exIdx}
                  sets={row.sets}
                  exerciseName={ex.name}
                  onDone={() => setEditDate(null)}
                />
              ) : (
                /* Units kept and reps spelled out: "80kg x 12", not "80x12". */
                <div className="flex flex-wrap gap-1">
                  {row.sets.map((s, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.68rem] font-semibold tabular-nums"
                    >
                      {formatSet(s)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-surface-2 px-3 py-1.5">
        {(Object.keys(TIERS) as Tier[]).map((k) => (
          <span key={k} className="flex items-center gap-1 text-[0.58rem] text-muted">
            <span className={cn("size-2 rounded", TIERS[k].bg)} />
            {TIERS[k].label}
          </span>
        ))}
        <span className="text-[0.58rem] text-faint">scaled to this lift only</span>
      </div>
    </div>
  );
}

/**
 * Correcting a day that was logged in the app.
 *
 * The Database was read-only, so a set typed as 1000kg instead of 100kg stayed
 * wrong forever and dragged every chart, every personal best and every
 * "heaviest" badge along with it. The only workaround was to delete the whole
 * day and re-enter it.
 *
 * Edits are written straight to the saved session and the session's totals are
 * rebuilt from its sets, so volume, calories, the muscle tally, the graphs and
 * the body map all move with the correction rather than keeping the old
 * numbers and disagreeing with the sets they were drawn from.
 */
function DayEditor({
  date, exIdx, sets, exerciseName, onDone,
}: {
  date: string;
  exIdx: number;
  sets: LoggedSet[];
  exerciseName: string;
  onDone: () => void;
}) {
  const patchHistorySet = useSoma((s) => s.patchHistorySet);
  const removeHistorySet = useSoma((s) => s.removeHistorySet);
  const removeHistoryExercise = useSoma((s) => s.removeHistoryExercise);

  return (
    <div className="soma-expand rounded-xl border border-accent/40 bg-surface-2 p-2">
      <div className="mb-1.5 text-[0.58rem] font-bold uppercase tracking-wide text-faint">
        Editing {date}
      </div>

      <div className="space-y-1">
        {sets.map((s, i) => {
          // On a bodyweight lift the stored number is the added plate, not the
          // total load — so that is what is edited, or a correction would be
          // applied on top of the body's own weight.
          const stored = s.bodyweight ? (s.added ?? 0) : s.weight;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-8 shrink-0 text-[0.6rem] font-bold text-faint">#{i + 1}</span>
              <input
                type="number"
                inputMode="decimal"
                aria-label={`Set ${i + 1} weight`}
                defaultValue={stored}
                onBlur={(e) => {
                  const v = e.target.value === "" ? "" : Number(e.target.value);
                  if (v === stored) return;
                  patchHistorySet(date, exIdx, s.srcIdx ?? i, { weight: v as number | "" });
                }}
                className="h-8 w-full min-w-0 rounded-lg border border-border bg-surface px-1 text-center text-[0.72rem] font-semibold tabular-nums text-fg"
              />
              <span className="shrink-0 text-[0.6rem] text-faint">kg</span>
              <input
                type="number"
                inputMode="numeric"
                aria-label={`Set ${i + 1} reps`}
                defaultValue={s.reps}
                onBlur={(e) => {
                  const v = e.target.value === "" ? "" : Number(e.target.value);
                  if (v === s.reps) return;
                  patchHistorySet(date, exIdx, s.srcIdx ?? i, { reps: v as number | "" });
                }}
                className="h-8 w-full min-w-0 rounded-lg border border-border bg-surface px-1 text-center text-[0.72rem] font-semibold tabular-nums text-fg"
              />
              <span className="shrink-0 text-[0.6rem] text-faint">reps</span>
              <button
                type="button"
                aria-label={`Delete set ${i + 1}`}
                onClick={() => {
                  removeHistorySet(date, exIdx, s.srcIdx ?? i);
                  toast.success("Set removed");
                }}
                className="shrink-0 p-1 text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (!confirm(`Remove ${exerciseName} from the session on ${date}?`)) return;
            removeHistoryExercise(date, exIdx);
            toast.success(`Removed ${exerciseName} from ${date}`);
            onDone();
          }}
          className="h-8 flex-1 rounded-lg border border-danger/40 bg-surface text-[0.65rem] font-bold text-danger"
        >
          Delete this exercise
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-accent text-[0.65rem] font-extrabold text-accent-ink"
        >
          <Check className="size-3.5" /> Done
        </button>
      </div>
      <p className="mt-1.5 text-[0.55rem] leading-snug text-faint">
        Saved as you leave each field. Every statistic and chart is recomputed from the
        corrected sets.
      </p>
    </div>
  );
}
