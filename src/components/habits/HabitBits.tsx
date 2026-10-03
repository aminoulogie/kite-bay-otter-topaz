import {
  Activity, Bed, BookOpen, Brain, Check, Droplet, Dumbbell, Footprints, Laptop, Moon, PenLine, Pill,
  Salad, Smartphone, Sparkles, Sun, Wallet, type LucideIcon,
} from "lucide-react";
import { canChange, canTickOn } from "@/lib/habit-lock";
import { tapLight, tapMedium } from "@/lib/haptics";
import { progress, stepCount, targetOf } from "@/lib/habit-steps";
import { status } from "@/lib/habit-ramp";
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

export function HabitIcon({ habit, size = "md" }: { habit: Habit; size?: "md" | "lg" }) {
  const Icon = iconFor(habit.name);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        size === "lg" ? "size-16 rounded-[1.4rem]" : "size-11 rounded-2xl",
      )}
      style={{ background: `color-mix(in srgb, ${habit.color} 20%, transparent)`, color: habit.color }}
    >
      {Icon ? (
        <Icon className={size === "lg" ? "size-8" : "size-5"} strokeWidth={2.2} />
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
        "grid shrink-0 place-items-center rounded-full border-2 transition-transform active:scale-90 disabled:opacity-40",
        size === "lg" ? "size-14" : "size-11",
        !done && "border-border-strong text-faint",
      )}
      style={done ? { background: habit.color, borderColor: habit.color, color: "#0b0c10" } : undefined}
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
        <Check className={size === "lg" ? "size-7" : "size-5"} strokeWidth={3} />
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
 * Weeks as columns of rounded dots, Monday on top. Done days take the habit's
 * colour; today is ringed so it reads as a position, not a state.
 */
export function DotGrid({
  habit, cols, today, cell,
}: {
  habit: Habit;
  cols: (string | null)[][];
  today: string;
  /** Fixed cell size in px; omit to stretch the columns across the width. */
  cell?: number;
}) {
  return (
    <div
      className="grid grid-flow-col grid-rows-7 gap-[3px]"
      style={{
        gridTemplateColumns: cell ? `repeat(${cols.length}, ${cell}px)` : `repeat(${cols.length}, minmax(0, 1fr))`,
        gridAutoRows: cell ? `${cell}px` : undefined,
      }}
    >
      {cols.flatMap((col, ci) =>
        col.map((d, ri) => {
          const on = !!d && habit.history[d] === true;
          return (
            <span
              key={`${ci}-${ri}`}
              title={d ?? undefined}
              className={cn("block aspect-square rounded-[3px]", !d ? "opacity-0" : d > today && "opacity-30")}
              style={{
                background: on ? habit.color : "color-mix(in srgb, var(--color-fg) 8%, transparent)",
                outline: d === today ? `1.5px solid ${habit.color}` : undefined,
                outlineOffset: d === today ? "1px" : undefined,
              }}
            />
          );
        }),
      )}
    </div>
  );
}
