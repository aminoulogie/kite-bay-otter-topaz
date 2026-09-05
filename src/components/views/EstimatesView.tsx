import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import {
  bodyweightEstimate, confidenceNote, leanMassNote, measurementEstimates,
  strengthEstimates, type TrendEstimate,
} from "@/lib/estimates";
import { useTrainingLog } from "@/lib/use-training-log";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

export function EstimatesView() {
  const nutrition = useSoma((s) => s.nutrition);
  const customGoals = useSoma((s) => s.settings.customGoals);
  const demo = useSoma((s) => s.settings.demoSeeded);
  const log = useTrainingLog();
  const weight = useMemo(() => bodyweightEstimate(nutrition), [nutrition]);
  const strength = useMemo(() => strengthEstimates(log), [log]);
  const measures = useMemo(() => measurementEstimates(nutrition), [nutrition]);

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
      if (!items.length) continue;
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
      {demo && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[0.7rem] leading-snug text-warn">
          These numbers are from <b>demo data</b>, not your log.
        </div>
      )}
      <Card>
        <CardTitle>Bodyweight</CardTitle>
        <EstimateBlock est={weight} />
        {intake && (
          <div className="mt-3 rounded-xl border border-border bg-surface-2 p-2.5">
            <div className="text-[0.68rem] font-bold">
              {intake.gap < -150
                ? "You are eating under your target"
                : intake.gap > 150
                  ? "You are eating over your target"
                  : "You are eating close to your target"}
            </div>
            <div className="mt-1 flex items-baseline gap-3 text-[0.65rem] text-muted">
              <span>avg <b className="text-fg tabular-nums">{intake.avg}</b> kcal</span>
              <span>target <b className="text-fg tabular-nums">{intake.target}</b></span>
              <span className={cn("ml-auto font-bold tabular-nums", intake.gap < 0 ? "text-orange-400" : "text-emerald-400")}>
                {intake.gap > 0 ? "+" : ""}{intake.gap}/day
              </span>
            </div>
            <p className="mt-1.5 text-[0.6rem] leading-snug text-faint">
              A target is what you intend to eat; the projection follows the scale.
              Roughly {Math.abs(Math.round((intake.gap * 30) / 7700) * 10) / 10}kg a month is explained by this gap
              {intake.loggedDays < 14 ? ` — only ${intake.loggedDays} days logged.` : "."}
            </p>
          </div>
        )}
      </Card>
      <Card>
        <CardTitle>Muscle vs fat</CardTitle>
        <p className="text-xs leading-snug text-muted">{leanMassNote()}</p>
      </Card>
      {measures.length > 0 && (
        <Card>
          <CardTitle>Measurements</CardTitle>
          <div className="space-y-3">{measures.map((m) => <EstimateBlock key={m.label} est={m} compact />)}</div>
        </Card>
      )}
      <Card>
        <CardTitle>Strength</CardTitle>
        {strength.length === 0 ? (
          <p className="text-xs text-muted">Not enough sessions on any single lift yet to project one.</p>
        ) : (
          <div className="space-y-3">{strength.map((e) => <EstimateBlock key={e.label} est={e} compact />)}</div>
        )}
      </Card>
    </div>
  );
}

function EstimateBlock({ est, compact }: { est: TrendEstimate; compact?: boolean }) {
  const up = est.ratePerMonth >= 0;
  if (est.confidence === "none") {
    return (
      <div>
        <div className="text-[0.78rem] font-bold">{est.label}</div>
        <p className="mt-0.5 text-[0.65rem] text-faint">{confidenceNote(est.confidence, est.sampleDays)}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-bold", compact ? "text-[0.78rem]" : "text-sm")}>{est.label}</span>
        <span className="text-[0.7rem] text-muted">now <b className="text-fg tabular-nums">{est.current}</b> {est.unit}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={cn("text-[0.7rem] font-bold tabular-nums", up ? "text-emerald-400" : "text-orange-400")}>
          {up ? "+" : ""}{est.ratePerMonth} {est.unit}/month
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {est.projections.map((p) => (
          <div key={p.horizon} className="rounded-lg bg-surface-2 px-1.5 py-1.5 text-center">
            <div className="text-[0.55rem] font-bold uppercase text-faint">{p.horizon}d</div>
            <div className="font-display text-[0.8rem] font-extrabold tabular-nums">{p.value}</div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[0.58rem] leading-snug text-faint">{confidenceNote(est.confidence, est.sampleDays)}</p>
    </div>
  );
}
