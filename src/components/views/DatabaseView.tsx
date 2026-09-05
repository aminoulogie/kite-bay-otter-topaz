import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import {
  allDates, dayBest, formatSet, groupsOf,
  type ExerciseLog, type LoggedSet,
} from "@/lib/training-log";
import { useTrainingLog } from "@/lib/use-training-log";
import { rateAllExercises, ratingBreakdown, ratingLabel, ratingTone } from "@/lib/exercise-ratings";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

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
  const log = useTrainingLog();
  const groups = useMemo(() => groupsOf(log), [log]);
  const ratings = useMemo(() => rateAllExercises(history, log), [history, log]);
  const [group, setGroup] = useState<string | null>(null);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [sort, setSort] = useState<SortBy>("date");
  const rows = useMemo(
    () => (group ? log.filter((e) => e.group === group) : []).sort((a, b) => Object.keys(b.days).length - Object.keys(a.days).length),
    [log, group],
  );
  if (!group) {
    return (
      <Card>
        <CardTitle>Database</CardTitle>
        <p className="mb-3 text-xs text-muted">{allDates(log).length} training days across {log.length} exercises. Includes workouts logged in Train.</p>
        <div className="grid grid-cols-2 gap-2">
          {groups.map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-3 text-left active:bg-surface-3">
              <span className="text-sm font-bold">{g}</span>
              <span className="text-xs font-semibold text-faint">{log.filter((e) => e.group === g).length}</span>
            </button>
          ))}
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setGroup(null); setOpenExercise(null); }} className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold text-muted">← Groups</button>
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
            <button type="button" onClick={() => setOpenExercise(open ? null : ex.name)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-3 text-left active:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8rem] font-bold">{ex.name}</div>
                <div className="mt-0.5 text-[0.65rem] text-faint">{dates.length} {dates.length === 1 ? "session" : "sessions"} · best {Math.round(best)}kg 1RM</div>
              </div>
              {rated?.usable ? (
                <div className="shrink-0 text-right">
                  <div className={cn("font-display text-sm font-extrabold tabular-nums", ratingTone(rated.rating.score))}>{rated.rating.score.toFixed(1)}</div>
                  <div className="text-[0.55rem] text-faint">/10</div>
                </div>
              ) : (
                <div className="shrink-0 text-[0.55rem] text-faint">unrated</div>
              )}
              <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
            </button>
            {open && <ExerciseWindow ex={ex} best={best} heaviest={heaviest} sort={sort} onSort={setSort} rated={ratings.get(ex.name)} />}
          </div>
        );
      })}
    </div>
  );
}

function ExerciseWindow({ ex, best, heaviest, sort, onSort, rated }: { ex: ExerciseLog; best: number; heaviest: number; sort: SortBy; onSort: (s: SortBy) => void; rated?: { rating: import("@/lib/set-quality").Rating; usable: boolean }; }) {
  const entries = useMemo(() => {
    const list = Object.entries(ex.days).map(([date, sets]) => ({ date, sets, e1rm: dayBest(sets), top: topWeight(sets) }));
    if (sort === "e1rm") return list.sort((a, b) => b.e1rm - a.e1rm);
    if (sort === "top") return list.sort((a, b) => b.top - a.top);
    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [ex.days, sort]);
  return (
    <div className="soma-expand border-t border-border">
      {rated?.usable ? (
        <div className="border-b border-border bg-surface-2 px-3 py-2">
          <div className="mb-1 flex items-baseline gap-2">
            <span className={cn("font-display text-sm font-extrabold", ratingTone(rated.rating.score))}>{rated.rating.score.toFixed(1)}/10</span>
            <span className="text-[0.65rem] font-bold text-muted">{ratingLabel(rated.rating.score)}</span>
          </div>
          <div className="space-y-0.5">
            {ratingBreakdown(rated.rating).map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-[0.58rem] text-muted">{b.label}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${b.pct}%` }} /></div>
                <span className="w-7 shrink-0 text-right text-[0.55rem] tabular-nums text-faint">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="border-b border-border bg-surface-2 px-3 py-2 text-[0.6rem] text-faint">Imported history has no set ratings. New Train sessions show here as soon as sets are ticked.</p>
      )}
      <div className="flex items-center gap-1 border-b border-border bg-surface-2 px-2 py-1.5">
        {SORTS.map((s) => (
          <button key={s.id} type="button" onClick={() => onSort(s.id)} className={cn("rounded-md px-2 py-1 text-[0.65rem] font-bold", sort === s.id ? "bg-accent text-accent-ink" : "text-muted")}>{s.label}</button>
        ))}
      </div>
      <div className="max-h-[42vh] overflow-y-auto overscroll-contain">
        {entries.map((row) => {
          const tier = tierFor(best, row.e1rm);
          const t = TIERS[tier];
          return (
            <div key={row.date} className="border-b border-border/40 px-3 py-2 last:border-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[0.7rem] font-bold tabular-nums">{new Date(row.date + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-[0.55rem] font-extrabold", t.bg, t.fg)}>{t.label}</span>
                <span className="ml-auto text-[0.62rem] tabular-nums text-faint">{Math.round(row.e1rm)}kg 1RM</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {row.sets.map((s, i) => (
                  <span key={i} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.68rem] font-semibold tabular-nums">{formatSet(s)}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
