import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { hasDetailRoom } from "@/lib/dashboard-layout";
import { useWidgetSize } from "@/components/WidgetGrid";
import { sessionBurn } from "@/lib/training-burn";
import { totalWaterMl } from "@/lib/hydration";
import { useSoma } from "@/lib/store";

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
 * Burnt is the session's gross figure: what the workout cost, not what it cost
 * above sitting still. It is the number people mean when they say they burnt
 * 400 calories, and the net figure is already spoken for by the calorie target.
 */

/** Ring order is outer to inner, as on the home screen: the day's headline first. */
const RINGS = [
  { id: "cals", label: "Calories", unit: "CAL", colour: "#ff2d7a" },
  { id: "protein", label: "Protein", unit: "G", colour: "#c8ff2e" },
  { id: "water", label: "Water", unit: "ML", colour: "#19e3e3" },
  { id: "burnt", label: "Burned", unit: "CAL", colour: "#ff9f0a" },
] as const;

/** What a day of training is meant to cost, when nothing else says. */
const BURN_TARGET = 500;
const FALLBACK_WATER = 3500;

const BOX = 168;
const CENTRE = BOX / 2;
/** Outer to inner, with a gap between strokes wide enough to read as four. */
const GEOMETRY = [
  { r: 64, w: 15 },
  { r: 46, w: 15 },
  { r: 28, w: 15 },
  { r: 10, w: 15 },
];

export function ActivityRings() {
  const nutrition = useSoma((s) => s.nutrition);
  const history = useSoma((s) => s.history);
  const date = useSoma((s) => s.activeDate);
  const setTab = useSoma((s) => s.setTab);
  const size = useWidgetSize();

  // The burn model needs a bodyweight, and the app only knows the ones that
  // were weighed — the most recent of those, or its own assumed default.
  const weight = useMemo(() => {
    const dated = Object.keys(nutrition).filter((k) => nutrition[k]?.bodyWeight).sort();
    return dated.length ? nutrition[dated[dated.length - 1]!]!.bodyWeight ?? 0 : 0;
  }, [nutrition]);

  const day = nutrition[date];
  const eaten = day?.items ?? [];
  const goals = day?.goals;

  const values: Record<(typeof RINGS)[number]["id"], { value: number; goal: number }> = {
    cals: { value: eaten.reduce((a, i) => a + (i.cals || 0), 0), goal: goals?.cals || 2400 },
    protein: { value: eaten.reduce((a, i) => a + (i.p || 0), 0), goal: goals?.protein || 160 },
    water: { value: totalWaterMl(day), goal: goals?.water || FALLBACK_WATER },
    burnt: { value: sessionBurn(history[date], weight || undefined).gross, goal: BURN_TARGET },
  };

  return (
    <button
      type="button"
      onClick={() => setTab("nutrition")}
      className="block h-full w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-card active:bg-surface-2"
      aria-label={RINGS.map((r) => `${r.label} ${Math.round(values[r.id].value)} of ${Math.round(values[r.id].goal)}`).join(", ") + ". Opens Fuel."}
    >
      <CardTitle>
        <span className="flex items-center gap-1">
          Today
          <ChevronRight className="size-3.5 text-faint" aria-hidden />
        </span>
      </CardTitle>

      <div className="flex items-center gap-4">
        <svg
          viewBox={`0 0 ${BOX} ${BOX}`}
          className="size-[132px] shrink-0 -rotate-90"
          aria-hidden
        >
          {RINGS.map((ring, i) => {
            const g = GEOMETRY[i]!;
            const { value, goal } = values[ring.id];
            const filled = goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0;
            const circumference = 2 * Math.PI * g.r;
            return (
              <g key={ring.id}>
                {/* The track, so an empty ring is still an empty ring rather
                    than nothing at all. */}
                <circle
                  cx={CENTRE}
                  cy={CENTRE}
                  r={g.r}
                  fill="none"
                  stroke="var(--color-surface-3)"
                  strokeWidth={g.w}
                />
                {filled > 0 && (
                  <circle
                    cx={CENTRE}
                    cy={CENTRE}
                    r={g.r}
                    fill="none"
                    stroke={ring.colour}
                    strokeWidth={g.w}
                    strokeLinecap="round"
                    strokeDasharray={`${circumference * filled} ${circumference * 1.6}`}
                    style={{ transition: "stroke-dasharray 320ms cubic-bezier(.2,.8,.2,1)" }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {hasDetailRoom(size) && (
          <div className="min-w-0 flex-1 space-y-1">
            {RINGS.map((ring) => {
              const { value, goal } = values[ring.id];
              return (
                <div key={ring.id} className="min-w-0">
                  <div className="truncate text-[0.62rem] font-bold uppercase tracking-wide text-faint">
                    {ring.label}
                  </div>
                  <div className="truncate text-[0.8rem] font-extrabold tabular" style={{ color: ring.colour }}>
                    {Math.round(value)}
                    <span className="text-faint">/{Math.round(goal)}</span>{" "}
                    <span className="text-[0.6rem] font-bold">{ring.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </button>
  );
}
