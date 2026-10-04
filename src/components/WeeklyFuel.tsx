import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { DEFAULT_GOALS } from "@/lib/soma/data";
import { getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { summariseWeek, type DayTotals, type WeekRow } from "@/lib/week-fuel";
import { useSoma } from "@/lib/store";
import { totalWaterMl } from "@/lib/hydration";
import { useWidgetSize } from "@/components/WidgetGrid";
import { hasDetailRoom, hasFullRoom } from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";
import { MACRO_COLOR, NUTRIENT_COLOR } from "@/components/MacroStrip";
import { Glance, isGlance } from "@/components/Glance";

/**
 * The week, in the one place the week belongs.
 *
 * The charts below this answer "what has the trend been" over a month or a
 * year. This answers the smaller and more useful question: how did THIS week
 * go, and is it a week you would want to repeat. Seven bars and four counts,
 * because anything more becomes a second chart.
 *
 * Averages are over the days that were LOGGED — see lib/week-fuel.ts for why
 * dividing a four-day week by seven is a lie about a deficit nobody ran.
 */
const PICKS: { id: keyof DayTotals; label: string; unit: string }[] = [
  { id: "cals", label: "Calories", unit: "kcal" },
  { id: "protein", label: "Protein", unit: "g" },
  { id: "carbs", label: "Carbs", unit: "g" },
  { id: "fat", label: "Fat", unit: "g" },
  { id: "fiber", label: "Fiber", unit: "g" },
  { id: "water", label: "Water", unit: "L" },
];
/** The bright colours take dark type on a chosen chip. */
const DARK_TEXT = new Set<keyof DayTotals>(["protein", "water"]);

export function WeeklyFuel() {
  const nutrition = useSoma((s) => s.nutrition);
  const settings = useSoma((s) => s.settings);
  const size = useWidgetSize();

  const goals = { ...DEFAULT_GOALS, ...(settings.customGoals ?? {}) };

  const rows: WeekRow[] = useMemo(() => {
    const out: WeekRow[] = [];
    const today = new Date();
    for (let back = 6; back >= 0; back--) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      const date = getLocalDateKey(d);
      const day = nutrition[date];
      const items = day?.items ?? [];
      const totals = items.reduce(
        (a, i) => ({
          cals: a.cals + (i.cals || 0),
          protein: a.protein + (i.p || 0),
          carbs: a.carbs + (i.c || 0),
          fat: a.fat + (i.f || 0),
          fiber: a.fiber + (i.fiber || 0),
          water: a.water,
        }),
        { cals: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: totalWaterMl(day) },
      );
      out.push({ date, totals, logged: items.length > 0 || (day?.water ?? 0) > 0 });
    }
    return out;
  }, [nutrition]);

  const week = useMemo(
    () => summariseWeek(rows, { cals: goals.cals, protein: goals.protein, water: goals.water }),
    [rows, goals.cals, goals.protein, goals.water],
  );
  const [picked, setPicked] = useState<keyof DayTotals>("cals");

  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "The last seven days",
          short: "7 days",
          color: MACRO_COLOR.cals,
          value: week.loggedDays ? String(week.avg.cals) : null,
          unit: "kcal avg",
          sub: week.loggedDays ? `${week.onTarget}/${week.loggedDays} days on target · protein ${week.proteinHit}/${week.loggedDays}` : null,
          chart: { values: rows.map((r) => (r.logged ? r.totals.cals : null)) },
          empty: "Nothing logged this week",
          emptyShort: "No data",
        }}
      />
    );
  }
  if (!week.loggedDays) {
    return (
      <Card>
        <CardTitle>The last seven days</CardTitle>
        <p className="text-xs text-faint">
          Nothing logged this week yet. One day tells you almost nothing; seven tells you
          whether it is a week worth repeating.
        </p>
      </Card>
    );
  }

  const pick = PICKS.find((x) => x.id === picked)!;
  const color = NUTRIENT_COLOR[picked];
  // The same target the chart below draws: yours if you set one, else the
  // one the latest logged day was scored under, else the default.
  const latestGoal = [...rows].reverse().map((r) => nutrition[r.date]?.goals?.[picked]).find((g) => (g ?? 0) > 0);
  const goal = settings.customGoals?.[picked] || latestGoal || goals[picked] || 0;
  const minimum = settings.nutrientMins?.[picked] ?? 0;
  const values = rows.map((r) => (r.logged ? r.totals[picked] : 0));
  const top = Math.max(...values, 1) * 1.08;
  const hit = (v: number) =>
    minimum > 0
      ? v >= minimum
      : picked === "cals"
        ? goal > 0 && Math.abs(v - goal) <= goal * 0.1
        : goal > 0 && v >= goal * 0.9;
  const shown = (v: number) => (picked === "water" ? `${(v / 1000).toFixed(1)}` : String(Math.round(v)));

  return (
    <Card>
      <CardTitle>
        <span>The last seven days</span>
        <span className="tabular text-sm font-bold" style={{ color }}>
          {shown(week.avg[picked])} {pick.unit}
          <span className="ml-1 text-[0.6rem] font-bold text-faint">avg</span>
        </span>
      </CardTitle>

      {/* One nutrient at a time, each in its own colour: the week of protein
          and the week of calories are different questions. */}
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-0.5" data-no-swipe-nav>
        {PICKS.map((x) => {
          const on = x.id === picked;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setPicked(x.id)}
              aria-pressed={on}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-bold transition-colors",
                !on && "border-border bg-surface-2 text-muted",
              )}
              style={on ? { background: NUTRIENT_COLOR[x.id], borderColor: NUTRIENT_COLOR[x.id], color: DARK_TEXT.has(x.id) ? "#0b0d12" : "#fff" } : undefined}
            >
              {x.label}
            </button>
          );
        })}
      </div>

      {/* Seven bars, no lines across them: a day that made it is solid, one
          that did not is faded, and that says it without a ruler. */}
      <div className="relative flex h-24 gap-1.5">
        {rows.map((r, i) => {
          const v = values[i]!;
          return (
            <div key={r.date} className="flex min-h-0 flex-1 flex-col items-center gap-1">
              <div className="flex min-h-0 w-full flex-1 items-end">
                <div
                  className={cn("w-full rounded-t-md transition-[height]", !r.logged && "bg-surface-3")}
                  style={{
                    height: `${r.logged ? Math.max(6, (v / top) * 100) : 4}%`,
                    ...(r.logged ? { background: color, opacity: hit(v) ? 1 : 0.4 } : {}),
                  }}
                />
              </div>
              <span className="h-[14px] text-[0.55rem] font-bold uppercase leading-[14px] text-faint">
                {parseLocalDateKey(r.date).toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
            </div>
          );
        })}
      </div>

      {/* A small widget is a glance: the headline number and the bars are the
          glance, and four more counts under them would be unreadable at that
          size anyway. */}
      {hasDetailRoom(size) && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Count n={week.loggedDays} of={7} label="Logged" />
          <Count n={week.onTarget} of={week.loggedDays} label="On target" color={MACRO_COLOR.cals} />
          <Count n={week.proteinHit} of={week.loggedDays} label="Protein" color={MACRO_COLOR.p} />
          <Count n={week.waterHit} of={week.loggedDays} label="Water" color="#00d8ff" />
        </div>
      )}

      {hasFullRoom(size) && (
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-3">
          <Avg n={week.avg.protein} label="Protein" unit="g" color={MACRO_COLOR.p} />
          <Avg n={week.avg.carbs} label="Carbs" unit="g" color={MACRO_COLOR.c} />
          <Avg n={week.avg.fat} label="Fat" unit="g" color={MACRO_COLOR.f} />
          <Avg n={week.avg.fiber} label="Fiber" unit="g" color="#b18cff" />
        </div>
      )}

      {hasFullRoom(size) && week.streak > 1 && (
        <p className="mt-2 text-[0.65rem] text-faint">
          {week.streak} days logged in a row. The average above is over the{" "}
          {week.loggedDays} {week.loggedDays === 1 ? "day" : "days"} you logged, not over
          seven — a blank day is a day nobody measured, not a day of fasting.
        </p>
      )}
    </Card>
  );
}

function Count({ n, of, label, color }: { n: number; of: number; label: string; color?: string }) {
  return (
    <div
      className="rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-center"
      style={color ? { background: `linear-gradient(160deg, ${color}1f, transparent 70%), var(--color-surface-2)` } : undefined}
    >
      <div className="font-display text-base font-extrabold tabular leading-none" style={{ color }}>
        {n}
        <span className="text-[0.6rem] font-bold text-faint">/{of}</span>
      </div>
      <div className="mt-1 text-[0.52rem] font-bold uppercase tracking-wide text-faint">
        {label}
      </div>
    </div>
  );
}

function Avg({ n, label, unit, color }: { n: number; label: string; unit: string; color: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-sm font-extrabold tabular leading-none" style={{ color }}>
        {n}
        <span className="text-[0.6rem] font-bold text-faint">{unit}</span>
      </div>
      <div className="mt-0.5 text-[0.52rem] font-bold uppercase tracking-wide text-faint">
        {label}
      </div>
    </div>
  );
}
