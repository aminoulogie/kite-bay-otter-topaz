import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { useSoma } from "@/lib/store";
import type { NutritionDay } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * What was actually eaten against what was aimed for.
 *
 * The target is drawn as a dashed reference line rather than a second series,
 * because it is a threshold and not a measurement: plotting it as a line
 * implies it varied day to day, and makes the eye compare two wiggles instead
 * of reading distance from a mark.
 *
 * Days with nothing logged are gaps, not zeros. A zero would read as a day of
 * fasting and would drag every average down — the same distinction the day
 * score makes between "not logged" and "none".
 */

type Nutrient = "cals" | "p" | "c" | "f" | "fiber";

const NUTRIENTS: { id: Nutrient; label: string; unit: string; goal: keyof import("@/lib/types").Goals }[] = [
  { id: "cals", label: "Calories", unit: "kcal", goal: "cals" },
  { id: "p", label: "Protein", unit: "g", goal: "protein" },
  { id: "c", label: "Carbs", unit: "g", goal: "carbs" },
  { id: "f", label: "Fat", unit: "g", goal: "fat" },
  { id: "fiber", label: "Fiber", unit: "g", goal: "fiber" },
];

const RANGES = [
  { id: "14", days: 14, label: "2W" },
  { id: "30", days: 30, label: "1M" },
  { id: "90", days: 90, label: "3M" },
  { id: "365", days: 365, label: "1Y" },
] as const;

export function NutritionGraphs() {
  const nutrition = useSoma((s) => s.nutrition);
  const [nutrient, setNutrient] = useState<Nutrient>("p");
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("30");

  const spec = NUTRIENTS.find((n) => n.id === nutrient)!;
  const days = RANGES.find((r) => r.id === rangeId)!.days;

  const { data, target, average, hitRate } = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const rows: { date: string; t: number; value: number | null }[] = [];
    let goal = 0;
    let sum = 0;
    let logged = 0;
    let hits = 0;

    for (const [date, day] of Object.entries(nutrition || {}).sort()) {
      if (new Date(date) < cutoff) continue;
      const d = day as NutritionDay;
      const items = d?.items ?? [];
      if (d?.goals?.[spec.goal]) goal = d.goals[spec.goal];

      // Nothing logged is unknown, not zero.
      const value = items.length
        ? items.reduce((t, i) => t + (Number(i[nutrient as keyof typeof i]) || 0), 0)
        : null;

      if (value != null) {
        logged += 1;
        sum += value;
        if (goal && value >= goal * 0.9) hits += 1;
      }
      rows.push({ date, t: new Date(date).getTime(), value: value == null ? null : Math.round(value) });
    }

    return {
      data: rows,
      target: goal,
      average: logged ? Math.round(sum / logged) : 0,
      hitRate: logged ? Math.round((hits / logged) * 100) : 0,
    };
  }, [nutrition, nutrient, days, spec.goal]);

  return (
    <Card>
      <CardTitle>Intake vs target</CardTitle>

      <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
        {NUTRIENTS.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setNutrient(n.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[0.7rem] font-bold transition-colors",
              nutrient === n.id
                ? "border-accent bg-accent text-accent-ink"
                : "border-border bg-surface-2 text-muted",
            )}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRangeId(r.id)}
            className={cn(
              "h-8 flex-1 rounded-lg text-[0.68rem] font-bold transition-colors",
              rangeId === r.id ? "bg-surface-3 text-fg" : "bg-surface-2 text-faint",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {data.filter((d) => d.value != null).length < 2 ? (
        <p className="py-10 text-center text-xs text-muted">
          Not enough logged days in this range to draw a trend.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-3 text-[0.7rem]">
            <span className="text-muted">
              avg <b className="text-fg tabular-nums">{average}</b> {spec.unit}
            </span>
            {target > 0 && (
              <>
                <span className="text-muted">
                  target <b className="text-fg tabular-nums">{target}</b>
                </span>
                <span className="ml-auto text-muted">
                  hit <b className={cn("tabular-nums", hitRate >= 70 ? "text-emerald-400" : "text-warn")}>
                    {hitRate}%
                  </b>{" "}
                  of logged days
                </span>
              </>
            )}
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer>
              <AreaChart data={data} /* left margin was negative, which pushed the axis labels off the
                   card and clipped "1200" into "200". */
                margin={{ top: 6, right: 10, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="fill-nutrient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  stroke="var(--color-border)"
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => new Date(t as number).toLocaleDateString()}
                  formatter={(v) => [`${v} ${spec.unit}`, spec.label]}
                />
                {target > 0 && (
                  // Dashed, because a target is a threshold rather than a
                  // measurement — a solid line would read as a second series.
                  <ReferenceLine
                    y={target}
                    stroke="var(--color-warn)"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `target ${target}`,
                      position: "insideTopRight",
                      fill: "var(--color-warn)",
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#fill-nutrient)"
                  // Gaps stay gaps: joining across an unlogged day would invent
                  // a meal that was never eaten.
                  connectNulls={false}
                  dot={{ r: 2 }}
                  isAnimationActive
                  animationDuration={400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-1 text-[0.6rem] text-faint">
            Days with nothing logged are left as gaps, not zeros.
          </p>
        </>
      )}
    </Card>
  );
}
