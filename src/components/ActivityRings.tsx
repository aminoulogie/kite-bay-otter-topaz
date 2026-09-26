import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { rowsFor } from "@/lib/dashboard-layout";
import { Glance, isGlance } from "@/components/Glance";
import { RingSet } from "@/components/RingSet";
import { useWidgetSize } from "@/components/WidgetGrid";
import { RING_DEFS, latestWeight, ringValues, share, type RingId, type RingValue } from "@/lib/rings";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The day, as four rings.
 *
 * Calories, protein, water and calories burnt — the four numbers that decide
 * whether a day went the way it was supposed to, in the shape Apple settled on
 * for exactly this job. A ring reads a part-done day at a glance in a way a
 * percentage does not: half a ring is half a ring, and the gap at the top is
 * the thing still owed.
 *
 * It counts CONFIRMED food only, like every other number in this app that
 * claims to be about what you ate — planned rows are not food yet, and a ring
 * that filled itself from the plan would be a ring that lies.
 *
 * At full width the week sits across the top, a small set of rings per day
 * as the Fitness app shows it; tapping a day opens that day.
 */
export function ActivityRings() {
  const nutrition = useSoma((s) => s.nutrition);
  const history = useSoma((s) => s.history);
  const date = useSoma((s) => s.activeDate);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const customGoals = useSoma((s) => s.settings.customGoals);
  const setTab = useSoma((s) => s.setTab);
  const size = useWidgetSize();

  const weight = useMemo(() => latestWeight(nutrition), [nutrition]);
  const valuesOn = (d: string) => ringValues(nutrition[d], history[d], weight, customGoals ?? {});
  const values = valuesOn(date);
  const specs = (v: Record<RingId, RingValue>) =>
    RING_DEFS.map((r) => ({ f: share(v[r.id]), from: r.from, to: r.to }));

  const today = getLocalDateKey(new Date());
  // Monday to Sunday of the week the day being viewed falls in.
  const week = useMemo(() => {
    const d = parseLocalDateKey(date);
    const monday = addDays(d, -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => getLocalDateKey(addDays(monday, i)));
  }, [date]);

  const aria =
    RING_DEFS.map((r) => `${r.label} ${Math.round(values[r.id].value)} of ${Math.round(values[r.id].goal)}`).join(", ") +
    ". Opens Fuel.";

  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Today",
          visual: (px: number) => <RingSet rings={specs(values)} px={px} />,
          stats: RING_DEFS.map((r) => ({
            label: r.label,
            color: r.from,
            value: String(Math.round(values[r.id].value)),
            of: `/${Math.round(values[r.id].goal)}`,
          })),
          onOpen: () => setTab("nutrition"),
          aria,
        }}
      />
    );
  }

  const big = rowsFor(size) >= 3;
  return (
    <div className="glass-card flex h-full w-full flex-col rounded-2xl border border-border bg-surface p-4">
      {/* The week, a small set of rings a day. Not inside the button below:
          tapping a day moves the whole app to it, which is a different act
          from opening Fuel. */}
      <div className="mb-3 grid grid-cols-7 gap-1" role="group" aria-label="This week">
        {week.map((d, i) => {
          const on = d === date;
          const future = d > today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setActiveDate(d)}
              className="flex flex-col items-center gap-1"
              aria-label={`${parseLocalDateKey(d).toLocaleDateString(undefined, { weekday: "long" })}${on ? ", showing" : ""}`}
              aria-pressed={on}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[0.58rem] font-bold",
                  on ? "bg-[#ff2d7a] text-white" : d === today ? "text-fg" : "text-faint",
                )}
              >
                {parseLocalDateKey(d).toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
              <span className={cn(future && "opacity-35")}>
                <RingSet rings={specs(valuesOn(d))} px={36} animate delay={i * 40} />
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setTab("nutrition")}
        className="flex flex-1 flex-col text-left"
        aria-label={aria}
      >
        <div className="mb-2 flex items-center gap-1 font-display text-base font-bold tracking-tight">
          {date === today ? "Today" : parseLocalDateKey(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
          <ChevronRight className="size-3.5 text-faint" aria-hidden />
        </div>
        <div className={cn("flex items-center", big ? "gap-8 pr-2" : "gap-6")}>
          <RingSet key={date} rings={specs(values)} px={big ? 176 : 140} delay={120} />
          <div className={cn("min-w-0 flex-1 space-y-2", big && "pl-3")}>
            {RING_DEFS.map((ring) => {
              const { value, goal } = values[ring.id];
              return (
                <div key={ring.id} className="min-w-0">
                  <div className="truncate text-[0.62rem] font-bold uppercase tracking-wide text-faint">{ring.label}</div>
                  <div className="font-extrabold leading-tight tabular" style={{ color: ring.from }}>
                    <span className="text-[1.05rem]">{Math.round(value)}</span>
                    <span className="text-[0.75rem] text-faint">/{Math.round(goal)}</span>
                    <span className="ml-0.5 text-[0.55rem] font-bold">{ring.unit}</span>
                  </div>
                  {big && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full" style={{ background: `${ring.from}33` }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${goal > 0 ? Math.min(100, (value / goal) * 100) : 0}%`, background: ring.from }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </button>
    </div>
  );
}
