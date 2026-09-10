import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { dueNow, mesoReview } from "@/lib/meso-review";
import { SomaIntelligenceEngine, getLocalDateKey } from "@/lib/soma";
import { useActiveProgram, useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The block review, shown at the one moment it changes anything.
 *
 * A mesocycle used to end and nothing happened: the next one started on the
 * same templates with the same set counts, and whatever the last eight weeks
 * proved got proved again. Everything needed to do better was already logged
 * and no screen ever put it in one place.
 *
 * It appears on the deload week and in week one of the next block, and nowhere
 * else — a review of a block with four weeks left to run is a distraction, and
 * one shown every week stops being read by the time it matters.
 */
export function MesoReviewCard() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const settings = useSoma((s) => s.settings);
  const program = useActiveProgram();

  const review = useMemo(() => {
    const proj = SomaIntelligenceEngine.getProgramProjectedDay(
      new Date(),
      settings.scheduleOverrides,
      program,
    );
    const weekNumber = Number(proj.weekNumber) || 1;
    if (!dueNow(weekNumber, !!proj.isDeload)) return null;

    return mesoReview({
      today: getLocalDateKey(new Date()),
      weekNumber,
      isDeload: !!proj.isDeload,
      history,
      nutrition,
      goal: settings.trainingGoal,
      landmarks: SomaIntelligenceEngine.VOLUME_LANDMARKS as never,
      estimate1RM: (w, r) => SomaIntelligenceEngine.calculate1RM(w, r),
    });
  }, [history, nutrition, settings.scheduleOverrides, settings.trainingGoal, program]);

  if (!review) return null;

  return (
    <Card>
      <CardTitle>
        Block {review.block.index} review · weeks {review.block.startWeek}–{review.block.endWeek}
      </CardTitle>
      <p className="-mt-1 mb-3 text-[0.68rem] text-faint">
        {review.from} → {review.to} · {review.sessions} sessions, {review.sessionsPerWeek} a week
      </p>

      <ul className="mb-3 space-y-1.5">
        {review.verdicts.map((v) => (
          <li key={v} className="text-xs leading-snug text-muted">
            {v}
          </li>
        ))}
      </ul>

      {!review.thin && review.lifts.length > 0 && (
        <>
          <div className="mb-1 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Estimated 1RM across the block
          </div>
          <div className="mb-3 space-y-1">
            {review.lifts.slice(0, 6).map((l) => (
              <div key={l.name} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-muted">{l.name}</span>
                <span className="flex shrink-0 items-baseline gap-2 tabular">
                  <span className="text-[0.68rem] text-faint">
                    {l.from} → {l.to}
                  </span>
                  <span
                    className={cn(
                      "font-bold",
                      l.deltaPct > 2 ? "text-accent-text" : l.deltaPct < -2 ? "text-danger" : "text-faint",
                    )}
                  >
                    {l.deltaPct > 0 ? "+" : ""}
                    {l.deltaPct}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!review.thin && review.volume.length > 0 && (
        <>
          <div className="mb-1 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Sets per week, averaged
          </div>
          <div className="space-y-1">
            {review.volume.slice(0, 6).map((v) => (
              <div key={v.label} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-muted">{v.label}</span>
                <span className="shrink-0 tabular">
                  <span className="font-bold">{v.perWeek}</span>
                  <span
                    className={cn(
                      "ml-2 text-[0.65rem] font-bold",
                      v.tier === "over" ? "text-danger" : v.tier === "under" ? "text-warn" : "text-faint",
                    )}
                  >
                    {v.tier === "optimal" ? `${v.mev}–${v.mav}` : v.tier}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
