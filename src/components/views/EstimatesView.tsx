import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import {
  bodyweightEstimate, confidenceNote, leanMassNote, measurementEstimates,
  strengthEstimates, type TrendEstimate,
} from "@/lib/estimates";
import { buildTrainingLog } from "@/lib/training-log";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Where the next few months go, if nothing changes.
 *
 * Everything is projected from the user's own trend, never a textbook rate.
 * Every card states how many days are behind it, because a projection without
 * its sample size is just a confident-looking guess.
 */
export function EstimatesView() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const customGoals = useSoma((s) => s.settings.customGoals);

  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);

  const log = useMemo(() => buildTrainingLog(history, bodyweights), [history, bodyweights]);
  const weight = useMemo(() => bodyweightEstimate(nutrition), [nutrition]);
  const strength = useMemo(() => strengthEstimates(log), [log]);
  const measures = useMemo(() => measurementEstimates(nutrition), [nutrition]);

  /**
   * Average intake against the calorie target, over the last month.
   *
   * ~7700 kcal is the commonly used figure for a kilogram of bodyweight. It is
   * an approximation and treated as one — the sentence says "roughly".
   */
  const intake = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    let sum = 0;
    let logged = 0;
    let target = 0;
    for (const [date, d] of Object.entries(nutrition || {})) {
      if (new Date(date) < cutoff) continue;
      if (d?.goals?.cals) target = d.goals.cals;
      const items = d?.items ?? [];
      if (!items.length) continue; // unlogged is unknown, not a fast
      sum += items.reduce((t, i) => t + (i.cals || 0), 0);
      logged += 1;
    }
    const explicit = customGoals?.cals;
    if (typeof explicit === "number" && explicit > 0) target = explicit;
    if (!logged || !target) return null;
    const avg = Math.round(sum / logged);
    return { avg, target: Math.round(target), gap: avg - Math.round(target), loggedDays: logged };
  }, [nutrition, customGoals]);

  return (
    <div className="space-y-3">
      <Card>
        <CardTitle>Bodyweight</CardTitle>
        <EstimateBlock est={weight} />
        {intake && (
          // The question this card kept prompting: "why am I losing weight if
          // my target is 3600?" Because the target is not what you ate. The
          // projection follows the scale, and the scale follows intake, so the
          // gap between the two is the whole explanation.
          <div className="mt-3 rounded-xl border border-border bg-surface-2 p-2.5">
            <div className="text-[0.68rem] font-bold">
              {intake.gap < -150
                ? "You are eating under your target"
                : intake.gap > 150
                  ? "You are eating over your target"
                  : "You are eating close to your target"}
            </div>
            <div className="mt-1 flex items-baseline gap-3 text-[0.65rem] text-muted">
              <span>
                avg <b className="text-fg tabular-nums">{intake.avg}</b> kcal
              </span>
              <span>
                target <b className="text-fg tabular-nums">{intake.target}</b>
              </span>
              <span
                className={cn(
                  "ml-auto font-bold tabular-nums",
                  intake.gap < 0 ? "text-orange-400" : "text-emerald-400",
                )}
              >
                {intake.gap > 0 ? "+" : ""}
                {intake.gap}/day
              </span>
            </div>
            <p className="mt-1.5 text-[0.6rem] leading-snug text-faint">
              A target is what you intend to eat; the projection follows what the scale
              actually did. Roughly {Math.abs(Math.round((intake.gap * 30) / 7700) * 10) / 10}kg
              a month is explained by this gap alone
              {intake.loggedDays < 14
                ? ` — though only ${intake.loggedDays} days are logged, so treat it loosely.`
                : "."}
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Muscle vs fat</CardTitle>
        {/* Stated rather than estimated. Splitting a weight change needs body
            composition, which nothing here measures — a number would be a guess
            dressed as a measurement. */}
        <p className="text-xs leading-snug text-muted">{leanMassNote()}</p>
      </Card>

      {measures.length > 0 && (
        <Card>
          <CardTitle>Measurements</CardTitle>
          <div className="space-y-3">
            {measures.map((m) => (
              <EstimateBlock key={m.label} est={m} compact />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Strength</CardTitle>
        {strength.length === 0 ? (
          <p className="text-xs text-muted">
            Not enough sessions on any single lift yet to project one.
          </p>
        ) : (
          <div className="space-y-3">
            {strength.map((e) => (
              <EstimateBlock key={e.label} est={e} compact />
            ))}
          </div>
        )}
      </Card>

      <p className="px-1 text-[0.6rem] leading-snug text-faint">
        Projections slow down the further out they go, because gains do. A straight line
        from a good month would have you benching numbers nobody reaches — these are what
        your own trend supports, not what it would extrapolate to.
      </p>
    </div>
  );
}

function EstimateBlock({ est, compact }: { est: TrendEstimate; compact?: boolean }) {
  const up = est.ratePerMonth >= 0;

  if (est.confidence === "none") {
    return (
      <div>
        <div className="text-[0.78rem] font-bold">{est.label}</div>
        <p className="mt-0.5 text-[0.65rem] text-faint">
          {confidenceNote(est.confidence, est.sampleDays)}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-bold", compact ? "text-[0.78rem]" : "text-sm")}>
          {est.label}
        </span>
        <span className="text-[0.7rem] text-muted">
          now <b className="text-fg tabular-nums">{est.current}</b> {est.unit}
        </span>
      </div>

      <div className="mt-0.5 flex items-baseline gap-2">
        <span
          className={cn(
            "text-[0.7rem] font-bold tabular-nums",
            up ? "text-emerald-400" : "text-orange-400",
          )}
        >
          {up ? "+" : ""}
          {est.ratePerMonth} {est.unit}/month
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[0.55rem] font-bold uppercase",
            est.confidence === "high"
              ? "bg-emerald-500/15 text-emerald-400"
              : est.confidence === "medium"
                ? "bg-surface-3 text-muted"
                : "bg-warn/15 text-warn",
          )}
        >
          {est.confidence}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {est.projections.map((p) => (
          <div key={p.horizon} className="rounded-lg bg-surface-2 px-1.5 py-1.5 text-center">
            <div className="text-[0.55rem] font-bold uppercase text-faint">{p.horizon}d</div>
            <div className="font-display text-[0.8rem] font-extrabold tabular-nums">{p.value}</div>
            <div
              className={cn(
                "text-[0.52rem] font-bold tabular-nums",
                p.delta >= 0 ? "text-emerald-400/80" : "text-orange-400/80",
              )}
            >
              {p.delta >= 0 ? "+" : ""}
              {p.delta}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-1 text-[0.58rem] leading-snug text-faint">
        {confidenceNote(est.confidence, est.sampleDays)}
        {est.note ? ` ${est.note}` : ""}
      </p>
    </div>
  );
}
