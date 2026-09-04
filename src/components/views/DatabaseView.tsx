import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import {
  allDates, buildTrainingLog, dayBest, formatDay, groupsOf, type ExerciseLog,
} from "@/lib/training-log";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Every set ever done, as exercises x dates.
 *
 * The heat scale is normalised PER EXERCISE and never across them: 100kg is a
 * personal record on one lift and a warm-up on another, so a shared scale
 * would paint the whole table by which exercise happens to be heaviest.
 *
 * Colour is never the only signal. A personal best also carries a PR badge and
 * bolder text, so the table still reads without colour vision — the tiers are
 * ordered by lightness as well as hue for the same reason.
 */

const COL_W = 132; // px per date column
const NAME_W = 148; // frozen exercise column
const OVERSCAN = 4; // columns rendered beyond the viewport, to cover fast scrolls

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

export function DatabaseView() {
  const history = useSoma((s) => s.history);
  const log = useMemo(() => buildTrainingLog(history), [history]);
  const groups = useMemo(() => groupsOf(log), [log]);

  const [group, setGroup] = useState<string | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  // Deferred so dragging the scrollbar never blocks on re-rendering cells.
  const deferredScroll = useDeferredValue(scrollLeft);

  const rows: ExerciseLog[] = useMemo(
    () => (group ? log.filter((e) => e.group === group) : []),
    [log, group],
  );
  const dates = useMemo(() => {
    if (!rows.length) return [];
    const s = new Set<string>();
    for (const e of rows) for (const d of Object.keys(e.days)) s.add(d);
    return [...s].sort();
  }, [rows]);

  // Personal best per exercise, over that exercise's whole history.
  const bests = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of rows) {
      let best = 0;
      for (const sets of Object.values(e.days)) best = Math.max(best, dayBest(sets));
      m.set(e.name, best);
    }
    return m;
  }, [rows]);

  // Only the columns on screen are built. With a few hundred dates a static
  // grid would mount thousands of cells and drop frames on every scroll.
  const viewW = scroller.current?.clientWidth ?? 360;
  const first = Math.max(0, Math.floor((deferredScroll - NAME_W) / COL_W) - OVERSCAN);
  const last = Math.min(dates.length, first + Math.ceil(viewW / COL_W) + OVERSCAN * 2);
  const visible = dates.slice(first, last);

  if (!group) {
    return (
      <Card>
        <CardTitle>Database</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Every set you have logged, {allDates(log).length} training days across{" "}
          {log.length} exercises. Pick a muscle group.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {groups.map((g) => {
            const n = log.filter((e) => e.group === g).length;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-3 text-left transition-colors active:bg-surface-3"
              >
                <span className="text-sm font-bold">{g}</span>
                <span className="text-xs font-semibold text-faint">{n}</span>
              </button>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setGroup(null)}
          className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold text-muted"
        >
          ← Groups
        </button>
        <span className="font-display text-sm font-extrabold">{group}</span>
        <span className="ml-auto text-[0.7rem] text-faint">
          {rows.length} exercises · {dates.length} days
        </span>
      </div>

      {dates.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-xs text-muted">
            Nothing logged for {group} yet.
          </p>
        </Card>
      ) : (
        <div
          ref={scroller}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          className="relative max-h-[62vh] overflow-auto rounded-2xl border border-border bg-surface"
        >
          <div style={{ width: NAME_W + dates.length * COL_W }} className="relative">
            {/* Header: sticky on both axes so the corner cell stays put. */}
            <div className="sticky top-0 z-20 flex h-9 border-b border-border bg-surface-2">
              <div
                style={{ width: NAME_W }}
                className="sticky left-0 z-30 flex shrink-0 items-center border-r border-border bg-surface-2 px-2 text-[0.65rem] font-bold uppercase tracking-wide text-faint"
              >
                Exercise
              </div>
              <div style={{ width: first * COL_W }} className="shrink-0" />
              {visible.map((d) => (
                <div
                  key={d}
                  style={{ width: COL_W }}
                  className="flex shrink-0 items-center justify-center border-r border-border/50 text-[0.65rem] font-bold tabular-nums text-muted"
                >
                  {d.slice(8, 10)}/{d.slice(5, 7)}/{d.slice(2, 4)}
                </div>
              ))}
            </div>

            {rows.map((ex) => {
              const best = bests.get(ex.name) ?? 0;
              return (
                <div key={ex.name} className="flex h-12 border-b border-border/40">
                  <div
                    style={{ width: NAME_W }}
                    className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-surface px-2 text-[0.7rem] font-bold leading-tight"
                  >
                    <span className="line-clamp-2">{ex.name}</span>
                  </div>
                  <div style={{ width: first * COL_W }} className="shrink-0" />
                  {visible.map((d) => {
                    const sets = ex.days[d];
                    if (!sets?.length) {
                      return <div key={d} style={{ width: COL_W }} className="shrink-0 border-r border-border/30" />;
                    }
                    const tier = tierFor(best, dayBest(sets));
                    const t = TIERS[tier];
                    return (
                      <div
                        key={d}
                        style={{ width: COL_W }}
                        className={cn(
                          "relative flex shrink-0 items-center border-r border-border/30 px-1.5",
                          t.bg,
                        )}
                        title={`${ex.name} · ${d}\n${formatDay(sets)}`}
                      >
                        <span
                          className={cn(
                            "text-[0.68rem] leading-tight tabular-nums",
                            t.fg,
                            tier === "pr" ? "font-extrabold" : "font-semibold",
                          )}
                        >
                          {formatDay(sets)}
                        </span>
                        {tier === "pr" && (
                          <span className="absolute right-1 top-1 rounded bg-red-50 px-1 text-[0.5rem] font-extrabold text-red-900">
                            PR
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        {(Object.keys(TIERS) as Tier[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[0.65rem] text-muted">
            <span className={cn("size-2.5 rounded", TIERS[k].bg)} />
            <b className="text-fg">{TIERS[k].label}</b> {TIERS[k].hint}
          </span>
        ))}
        <span className="text-[0.65rem] text-faint">Scaled per exercise, not across them.</span>
      </div>
    </div>
  );
}
