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

  return (
    <div className="space-y-3">
      <Card>
        <CardTitle>Bodyweight</CardTitle>
        <EstimateBlock est={weight} />
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
