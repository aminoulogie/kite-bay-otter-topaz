import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { DEFAULT_GOALS } from "@/lib/soma/data";
import { getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { barHeights, summariseWeek, type WeekRow } from "@/lib/week-fuel";
import { useSoma } from "@/lib/store";
import { useWidgetSize } from "@/components/WidgetGrid";
import { hasDetailRoom, hasFullRoom } from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

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
        { cals: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: day?.water || 0 },
      );
      out.push({ date, totals, logged: items.length > 0 || (day?.water ?? 0) > 0 });
    }
    return out;
  }, [nutrition]);

  const week = useMemo(
    () => summariseWeek(rows, { cals: goals.cals, protein: goals.protein, water: goals.water }),
    [rows, goals.cals, goals.protein, goals.water],
  );
  const bars = useMemo(() => barHeights(rows, (t) => t.cals), [rows]);

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

  return (
    <Card>
      <CardTitle>
        <span>The last seven days</span>
        <span className="tabular text-sm font-bold text-accent-text">
          {week.avg.cals} kcal
        </span>
      </CardTitle>

      {/* Seven bars against the week's own biggest day, not against the goal:
          the question here is consistency, and a row of bars the same height
          answers it at a glance whatever the level was. The target line is
          what says whether the level was right. */}
      <div className="flex h-16 items-end gap-1.5">
        {rows.map((r, i) => {
          const on =
            goals.cals > 0 && Math.abs(r.totals.cals - goals.cals) <= goals.cals * 0.1;
          return (
            <div key={r.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-full w-full items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md transition-[height]",
                    !r.logged ? "bg-surface-3" : on ? "bg-accent" : "bg-info",
                  )}
                  style={{ height: `${Math.max(r.logged ? 8 : 4, bars[i]! * 100)}%` }}
                />
              </div>
              <span className="text-[0.55rem] font-bold uppercase text-faint">
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
          <Count n={week.onTarget} of={week.loggedDays} label="On target" />
          <Count n={week.proteinHit} of={week.loggedDays} label="Protein" />
          <Count n={week.waterHit} of={week.loggedDays} label="Water" />
        </div>
      )}

      {hasFullRoom(size) && (
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-3">
          <Avg n={week.avg.protein} label="Protein" unit="g" />
          <Avg n={week.avg.carbs} label="Carbs" unit="g" />
          <Avg n={week.avg.fat} label="Fat" unit="g" />
          <Avg n={week.avg.fiber} label="Fiber" unit="g" />
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

function Count({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-center">
      <div className="font-display text-base font-extrabold tabular leading-none">
        {n}
        <span className="text-[0.6rem] font-bold text-faint">/{of}</span>
      </div>
      <div className="mt-1 text-[0.52rem] font-bold uppercase tracking-wide text-faint">
        {label}
      </div>
    </div>
  );
}

function Avg({ n, label, unit }: { n: number; label: string; unit: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-sm font-extrabold tabular leading-none">
        {n}
        <span className="text-[0.6rem] font-bold text-faint">{unit}</span>
      </div>
      <div className="mt-0.5 text-[0.52rem] font-bold uppercase tracking-wide text-faint">
        {label}
      </div>
    </div>
  );
}
