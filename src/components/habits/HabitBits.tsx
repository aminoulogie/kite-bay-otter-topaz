import { useEffect, useState } from "react";
import {
  Activity, Bed, BookOpen, Brain, Check, Droplet, Dumbbell, Footprints, Laptop, Moon, PenLine, Pill,
  Salad, Smartphone, Sparkles, Sun, Wallet, type LucideIcon,
} from "lucide-react";
import { canChange, canTickOn } from "@/lib/habit-lock";
import { tapLight, tapMedium } from "@/lib/haptics";
import { progress, stepCount, targetOf } from "@/lib/habit-steps";
import { status } from "@/lib/habit-ramp";
import { getPhoto } from "@/lib/habit-photos";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RampRow } from "@/components/views/HabitsView";
import type { Habit } from "@/lib/types";

const ICONS: [RegExp, LucideIcon][] = [
  [/water|hydrat|drink/i, Droplet],
  [/gym|train|lift|workout|push|pull|leg/i, Dumbbell],
  [/run|cardio|walk|step/i, Footprints],
  [/read|book|page/i, BookOpen],
  [/meditat|mindful|breath|pray/i, Sparkles],
  [/sleep|bed/i, Bed],
  [/night|evening/i, Moon],
  [/morning|sun|wake/i, Sun],
  [/journal|write|note/i, PenLine],
  [/creatine|vitamin|pill|supplement/i, Pill],
  [/protein|eat|food|veg|salad|meal/i, Salad],
  [/code|work|deep|focus|study/i, Laptop],
  [/learn|language|brain/i, Brain],
  [/screen|phone|social/i, Smartphone],
  [/money|spend|budget|save/i, Wallet],
  [/stretch|yoga|mobility/i, Activity],
];

function iconFor(name: string): LucideIcon | null {
  return ICONS.find(([re]) => re.test(name))?.[1] ?? null;
}

/**
 * Today's photo for a habit, as an object URL, or null.
 *
 * Minted in an effect and revoked in its cleanup, never during render:
 * revoking a URL the browser has not finished fetching leaves a blank tile,
 * which is a bug the photo calendar already had to fix once.
 */
export function useHabitPhoto(habitId: string, date: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void (async () => {
      const p = await getPhoto(habitId, date);
      if (!alive || !p) return;
      made = URL.createObjectURL(p.thumb);
      setUrl(made);
    })();
    return () => {
      alive = false;
      setUrl(null);
      if (made) URL.revokeObjectURL(made);
    };
  }, [habitId, date]);
  return url;
}

/**
 * The habit's face: the day's photograph when there is one, otherwise the
 * glyph its name suggests.
 *
 * The photo WINS. A dumbbell is a guess made from the word "Train"; a picture
 * of you under the bar is the day itself, and it is the thing worth looking at
 * on a list scrolled past every morning. The tile keeps its shape, size and
 * colour ring either way, so swapping one for the other never reflows the row.
 */
export function HabitIcon({ habit, size = "md" }: { habit: Habit; size?: "md" | "lg" }) {
  const Icon = iconFor(habit.name);
  const activeDate = useSoma((s) => s.activeDate);
  const photo = useHabitPhoto(habit.id, activeDate);

  if (photo) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden",
          size === "lg" ? "size-[4.5rem] rounded-[1.4rem]" : "size-12 rounded-[0.95rem]",
        )}
        style={{ boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${habit.color} 70%, transparent)` }}
      >
        <img src={photo} alt="" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        size === "lg" ? "size-[4.5rem] rounded-[1.4rem]" : "size-12 rounded-[0.95rem]",
      )}
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${habit.color} 42%, #0b0c10), color-mix(in srgb, ${habit.color} 18%, #0b0c10))`,
        boxShadow: `inset 0 1px 0 color-mix(in srgb, ${habit.color} 35%, transparent)`,
        color: `color-mix(in srgb, ${habit.color} 85%, white)`,
      }}
    >
      {Icon ? (
        <Icon className={size === "lg" ? "size-9" : "size-6"} strokeWidth={2.2} />
      ) : (
        <span className={cn("font-display font-extrabold", size === "lg" ? "text-2xl" : "text-base")}>
          {habit.name.trim().slice(0, 1).toUpperCase() || "•"}
        </span>
      )}
    </span>
  );
}

/** The round tick. With a checklist it shows the fraction until it is done. */
export function HabitCheck({ habit, size = "md" }: { habit: Habit; size?: "md" | "lg" }) {
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const activeDate = useSoma((s) => s.activeDate);
  const done = !!habit.history[activeDate];
  const steps = habit.steps ?? [];
  const list = progress(habit, activeDate);
  return (
    <button
      type="button"
      disabled={!canChange(done, activeDate)}
      onClick={() => {
        toggleHabit(habit.id);
        if (!done) tapMedium();
        else tapLight();
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 transition-[transform,background-color] duration-200 active:scale-90 disabled:opacity-40",
        size === "lg" ? "size-14" : "size-10",
        !done && "border-[color-mix(in_srgb,var(--color-fg)_45%,transparent)] text-transparent",
      )}
      style={
        done
          ? {
              background: habit.color,
              borderColor: habit.color,
              color: "#0b0c10",
              boxShadow: `0 0 16px color-mix(in srgb, ${habit.color} 45%, transparent)`,
            }
          : undefined
      }
      aria-label={
        steps.length
          ? `${list.done} of ${list.total} steps done. ${done ? "Clear them all" : "Mark them all done"}`
          : done
            ? `Uncheck ${habit.name}`
            : `Complete ${habit.name}`
      }
    >
      {steps.length && !done ? (
        <span className="text-xs font-extrabold tabular" style={list.done ? { color: habit.color } : undefined}>
          {list.done}/{list.total}
        </span>
      ) : (
        <Check className={size === "lg" ? "size-7" : "size-5"} strokeWidth={3.2} />
      )}
    </button>
  );
}

/** Today's ramp and checklist, when the habit has them. */
export function HabitWork({ habit }: { habit: Habit }) {
  const bumpHabitStep = useSoma((s) => s.bumpHabitStep);
  const logHabitAmount = useSoma((s) => s.logHabitAmount);
  const activeDate = useSoma((s) => s.activeDate);
  const steps = habit.steps ?? [];
  const ramp = habit.ramp ? status(habit.ramp, activeDate, habit.amountLog) : null;
  if (!ramp && !steps.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {habit.ramp && ramp && (
        <RampRow
          habit={habit}
          ramp={habit.ramp}
          state={ramp}
          onLog={(v: number | null) => logHabitAmount(habit.id, v, activeDate)}
        />
      )}
      {steps.length > 0 && (
        <div className="space-y-1">
          {steps.map((st) => {
            const target = targetOf(st);
            const n = stepCount(habit, activeDate, st.id);
            const stepIsDone = n >= target;
            return (
              <button
                key={st.id}
                type="button"
                disabled={!canTickOn(activeDate)}
                onClick={() => {
                  bumpHabitStep(habit.id, st.id);
                  tapLight();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors active:scale-[0.99]",
                  stepIsDone ? "border-transparent bg-surface-2" : "border-border bg-surface-2/50",
                )}
                aria-label={
                  target > 1
                    ? `${st.name}, ${n} of ${target} done. Tap for one more.`
                    : stepIsDone
                      ? `${st.name} done. Tap to undo.`
                      : `${st.name}. Tap when done.`
                }
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border",
                    !stepIsDone && "border-border-strong text-transparent",
                  )}
                  style={stepIsDone ? { background: habit.color, borderColor: habit.color, color: "#0b0c10" } : undefined}
                >
                  <Check className="size-3.5" strokeWidth={3.5} />
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-xs font-bold", stepIsDone && "text-muted line-through")}>
                  {st.name}
                </span>
                {target > 1 && (
                  <span className={cn("shrink-0 text-[0.7rem] font-extrabold tabular", stepIsDone ? "text-muted" : "text-faint")}>
                    {n}/{target}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Weeks as columns of small round dots, Monday on top. A done day takes the
 * habit's colour, brighter the longer the streak that reached it; days after
 * today are left out rather than drawn as misses.
 */
export function DotGrid({
  habit, cols, today, cell, rowLabels, gap = 3, showFuture = false,
}: {
  habit: Habit;
  cols: (string | null)[][];
  today: string;
  /** Fixed dot pitch in px; omit to stretch the columns across the width. */
  cell?: number;
  /** Mon…Sun down the left, in the same grid so they line up with the rows. */
  rowLabels?: string[];
  gap?: number;
  /** Draw the rest of the period as faint dots instead of leaving it blank. */
  showFuture?: boolean;
}) {
  // Streak per day, walking forward through the grid's own dates.
  const run = new Map<string, number>();
  let streak = 0;
  for (const col of cols)
    for (const d of col) {
      if (!d) continue;
      streak = habit.history[d] === true ? streak + 1 : 0;
      run.set(d, streak);
    }
  return (
    <div
      className="grid grid-flow-col grid-rows-7"
      style={{
        gap,
        gridTemplateColumns:
          (rowLabels ? "1.6rem " : "") +
          (cell ? `repeat(${cols.length}, ${cell}px)` : `repeat(${cols.length}, minmax(0, 1fr))`),
        gridAutoRows: cell ? `${cell}px` : undefined,
      }}
    >
      {rowLabels?.map((l) => (
        <span key={l} className="self-center text-[0.5rem] font-medium leading-none text-muted">
          {l}
        </span>
      ))}
      {cols.flatMap((col, ci) =>
        col.map((d, ri) => {
          const n = d ? run.get(d) ?? 0 : 0;
          const on = n > 0;
          const future = !!d && d > today;
          return (
            <span
              key={`${ci}-${ri}`}
              title={d ?? undefined}
              className={cn(
                "block aspect-square rounded-full",
                !d ? "opacity-0" : future && (showFuture ? "opacity-40" : "opacity-0"),
              )}
              style={{
                background: on
                  ? `color-mix(in srgb, ${habit.color} ${Math.round(Math.min(100, 55 + n * 7))}%, #0b0c10)`
                  : "color-mix(in srgb, var(--color-fg) 9%, transparent)",
                boxShadow: d === today ? `0 0 0 1.5px ${habit.color}` : undefined,
              }}
            />
          );
        }),
      )}
    </div>
  );
}
