import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Micronutrients for the day, against their targets.
 *
 * Separate from the macro rings because they behave differently: macros are a
 * budget you spend, micros are floors you clear. A bar that stops at 100% is
 * the right shape for a floor — going to 300% of your iron target is not three
 * times as good, and drawing it that way would suggest it is.
 *
 * A nutrient no food in the day carries any data for reads as unknown rather
 * than as zero. Most foods have no micronutrient figures at all, and showing
 * an empty bar for every one would say "you are deficient" when it means
 * "nobody wrote it down".
 */

const MICROS = [
  { key: "sodium", goal: "sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", goal: "potassium", label: "Potassium", unit: "mg" },
  { key: "calcium", goal: "calcium", label: "Calcium", unit: "mg" },
  { key: "iron", goal: "iron", label: "Iron", unit: "mg" },
  { key: "magnesium", goal: "magnesium", label: "Magnesium", unit: "mg" },
  { key: "zinc", goal: "zinc", label: "Zinc", unit: "mg" },
] as const;

export function MineralsCard() {
  const nutrition = useSoma((s) => s.nutrition);
  const activeDate = useSoma((s) => s.activeDate);
  const day = nutrition[activeDate];

  const rows = useMemo(() => {
    const items = day?.items ?? [];
    return MICROS.map((m) => {
      // "Any food reported a figure" — not "the total is above zero", which
      // cannot tell a genuinely absent nutrient from an unrecorded one.
      const known = items.some((i) => Number((i as unknown as Record<string, unknown>)[m.key]) > 0);
      const total = items.reduce(
        (t, i) => t + (Number((i as unknown as Record<string, unknown>)[m.key]) || 0),
        0,
      );
      const goal = Number(day?.goals?.[m.goal as keyof typeof day.goals]) || 0;
      return {
        ...m,
        known,
        total: Math.round(total),
        goal: Math.round(goal),
        pct: goal > 0 ? Math.min(100, (total / goal) * 100) : 0,
      };
    });
  }, [day]);

  const anyKnown = rows.some((r) => r.known);

  return (
    <Card>
      <CardTitle>Minerals</CardTitle>
      {!anyKnown ? (
        <p className="text-[0.68rem] leading-snug text-muted">
          None of today&apos;s foods carry mineral figures. Scanned products often do; foods
          entered by hand only have what you typed.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="text-[0.68rem] font-bold">{r.label}</span>
                <span className="text-[0.62rem] tabular-nums text-faint">
                  {r.known ? (
                    <>
                      <b className={cn(r.pct >= 90 ? "text-emerald-400" : "text-fg")}>{r.total}</b>
                      {r.goal ? ` / ${r.goal}` : ""} {r.unit}
                    </>
                  ) : (
                    "not recorded"
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn(
                    "soma-bar h-full rounded-full",
                    !r.known ? "bg-surface-3" : r.pct >= 90 ? "bg-emerald-400" : "bg-accent",
                  )}
                  style={{ width: `${r.known ? r.pct : 0}%` }}
                />
              </div>
            </div>
          ))}
          <p className="pt-1 text-[0.58rem] leading-snug text-faint">
            Bars stop at the target. Three times your iron target is not three times as
            good, so it is not drawn that way.
          </p>
        </div>
      )}
    </Card>
  );
}
