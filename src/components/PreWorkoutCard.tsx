import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import {
  PRE_WINDOWS, checkPreWorkout, portionsFor, preTargets, type PreWindow,
} from "@/lib/preworkout";
import { BASE_FOOD_LIBRARY } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { FoodItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Fuelling the session that is coming.
 *
 * Reads what is already logged under the Pre-Workout meal rather than asking
 * for a separate declaration — food logged once should not need logging twice,
 * and a section that demands its own entry is one that gets skipped.
 *
 * Targets scale with bodyweight, because a fixed gram figure is wrong for
 * everyone except whoever it was written for.
 */
export function PreWorkoutCard() {
  const nutrition = useSoma((s) => s.nutrition);
  const activeDate = useSoma((s) => s.activeDate);
  const customFoods = useSoma((s) => s.customFoods);

  const [windowId, setWindowId] = useState<string>("snack");
  const win: PreWindow = PRE_WINDOWS.find((w) => w.id === windowId) ?? PRE_WINDOWS[1]!;

  const day = nutrition[activeDate];
  const bodyweight = useMemo(() => {
    const keys = Object.keys(nutrition || {}).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      const w = nutrition[keys[i]!]?.bodyWeight;
      if (w) return w;
    }
    return 0;
  }, [nutrition]);

  const target = useMemo(() => preTargets(bodyweight, win), [bodyweight, win]);
  const check = useMemo(() => checkPreWorkout(day, target), [day, target]);
  // Portions, not gram targets. "You need 63g of carbohydrate" leaves the
  // arithmetic to be done in the gym car park; "145g of rice" does not.
  const portions = useMemo(
    () =>
      portionsFor(
        [...BASE_FOOD_LIBRARY, ...customFoods] as FoodItem[],
        target,
        check.carbsG,
      ),
    [customFoods, target, check.carbsG],
  );

  const tone =
    check.verdict === "good"
      ? "text-emerald-400"
      : check.verdict === "heavy"
        ? "text-orange-400"
        : check.verdict === "light"
          ? "text-warn"
          : "text-faint";

  return (
    <Card>
      <CardTitle>Pre-workout</CardTitle>
      <p className="mb-2 text-[0.68rem] leading-snug text-muted">
        Scaled to {bodyweight ? `${bodyweight}kg` : "75kg (no weight logged)"}. Pick how long
        before you train — what helps three hours out is not what helps twenty minutes out.
      </p>

      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        {PRE_WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setWindowId(w.id)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1.5 text-[0.65rem] font-bold transition-colors",
              windowId === w.id
                ? "border-accent bg-accent text-accent-ink"
                : "border-border bg-surface-2 text-muted",
            )}
          >
            {w.label}
            <span className="ml-1 font-semibold opacity-70">
              {w.toMin >= 240 ? `${w.fromMin / 60}h+` : `${w.fromMin}–${w.toMin}m`}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Metric label="Carbs" value={`${check.carbsG}`} target={`${target.carbsG}g`} pct={check.carbsPct} />
        <Metric label="Protein" value={`${check.proteinG}`} target={`${target.proteinG}g`} pct={check.proteinPct} />
        <Metric label="Fat" value={`${check.fatG}`} target={`≤${target.maxFatG}g`} over={check.fatOver} />
        <Metric label="Fiber" value={`${check.fiberG}`} target={`≤${target.maxFiberG}g`} over={check.fiberOver} />
      </div>

      <p className={cn("mt-2 text-[0.7rem] font-bold", tone)}>
        {check.verdict === "empty" && "Nothing logged under Pre-Workout yet."}
        {check.verdict === "light" && "Under-fuelled for this window — more carbohydrate."}
        {check.verdict === "heavy" &&
          "Too much fat or fibre this close in. It will still be sitting there when you start."}
        {check.verdict === "good" && "Well fuelled for this window."}
      </p>
      <p className="mt-0.5 text-[0.6rem] leading-snug text-faint">{win.note}</p>

      {portions.length > 0 && check.verdict !== "good" && (
        <div className="mt-3">
          <div className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-faint">
            Any one of these closes the gap
          </div>
          <div className="space-y-1">
            {portions.map((p) => (
              <div
                key={p.food.name}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5",
                  p.overLimit ? "border-warn/40 bg-warn/5" : "border-border bg-surface-2",
                )}
              >
                <span className="min-w-0 truncate text-[0.7rem] font-bold">
                  {p.grams}
                  {p.food.unit || "g"} {p.food.name}
                </span>
                <span className="shrink-0 text-[0.6rem] tabular-nums text-faint">
                  {p.carbsG}c · {p.proteinG}p · {p.cals}kcal
                </span>
              </div>
            ))}
          </div>
          {portions.some((p) => p.overLimit) && (
            <p className="mt-1 text-[0.58rem] leading-snug text-warn">
              Highlighted portions clear the carbohydrate target but break this window&apos;s
              fat or fibre limit at the size needed.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Metric({
  label, value, target, pct, over,
}: {
  label: string;
  value: string;
  target: string;
  pct?: number;
  over?: boolean;
}) {
  const hit = pct != null && pct >= 90;
  return (
    <div className="rounded-lg bg-surface-2 px-1.5 py-1.5 text-center">
      <div className="text-[0.55rem] font-bold uppercase text-faint">{label}</div>
      <div
        className={cn(
          "font-display text-[0.85rem] font-extrabold tabular-nums",
          over ? "text-orange-400" : hit ? "text-emerald-400" : "text-fg",
        )}
      >
        {value}
      </div>
      <div className="text-[0.52rem] text-faint">{target}</div>
    </div>
  );
}
