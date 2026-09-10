import { useMemo } from "react";
import { ArrowRight, Target } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { applyGoal } from "@/lib/goal-mode";
import { coachBrief, type BriefHorizon } from "@/lib/coach-brief";
import { currentDebt } from "@/lib/sleep-debt";
import { SomaIntelligenceEngine, getLocalDateKey } from "@/lib/soma";
import { useActiveProgram, useSoma } from "@/lib/store";

/**
 * The three things worth doing, and nothing else.
 *
 * Every figure behind this card already existed on some other tab. What did
 * not exist was an answer to "so what should I do": the app reported, and left
 * the ranking to a user who by definition has less context than it does.
 *
 * The ranking itself lives in lib/coach-brief.ts, where it is deterministic
 * and tested. This assembles the inputs and draws the result — including the
 * case where the honest result is nothing, which is shown as a sentence rather
 * than hidden, so an empty card reads as "you are fine" instead of "broken".
 */
export function CoachBrief({ horizon }: { horizon: BriefHorizon }) {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const habits = useSoma((s) => s.habits);
  const hunger = useSoma((s) => s.hunger);
  const settings = useSoma((s) => s.settings);
  const setTab = useSoma((s) => s.setTab);
  const program = useActiveProgram();

  const brief = useMemo(() => {
    const today = getLocalDateKey(new Date());
    const now = Date.now();

    const volume = applyGoal(
      SomaIntelligenceEngine.volumeReport(history, 7, now) as never,
      settings.trainingGoal,
    );

    const nights = Object.entries(nutrition)
      .filter(([, n]) => n?.sleep?.hours != null)
      .map(([date, n]) => ({ date, hours: n!.sleep!.hours!, quality: n!.sleep!.quality }));

    // Only the lifts actually trained recently are worth checking for a stall;
    // trawling the whole database would report a stall on everything untouched.
    const recent = new Set<string>();
    const cutoff = now - 28 * 86400000;
    for (const session of Object.values(history)) {
      if ((session?.timestamp ?? 0) < cutoff) continue;
      for (const ex of session?.exercises ?? []) if (ex?.name) recent.add(ex.name);
    }
    const stalled: { name: string; sessions: number }[] = [];
    for (const name of recent) {
      const trend = SomaIntelligenceEngine.computeVolumeTrend(history, name);
      if (trend?.stalled) stalled.push({ name, sessions: trend.points.length });
    }

    const proj = SomaIntelligenceEngine.getProgramProjectedDay(
      new Date(),
      settings.scheduleOverrides,
      program,
    );

    return coachBrief({
      today,
      horizon,
      history,
      nutrition,
      habits,
      hunger,
      phase: settings.phase ?? "maintain",
      volume: volume as never,
      sleepDebt: currentDebt(nights),
      stalled,
      isDeload: !!proj.isDeload,
    });
  }, [history, nutrition, habits, hunger, settings, program, horizon]);

  return (
    <Card>
      <CardTitle>
        <span className="inline-flex items-center gap-1.5">
          <Target className="size-3.5" />
          {horizon === "week" ? "This week, in order" : "Do these three"}
        </span>
      </CardTitle>

      {brief.actions.length === 0 ? (
        <p className="text-xs leading-snug text-faint">{brief.withheld}</p>
      ) : (
        <ol className="space-y-1.5">
          {brief.actions.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setTab(a.tab)}
                className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 font-display text-[0.65rem] font-extrabold tabular">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-snug">{a.text}</span>
                  {/* The figure it fired on. An instruction with no number
                      behind it is an opinion, and this card does not have
                      opinions. */}
                  <span className="mt-0.5 block text-[0.68rem] leading-snug text-faint">{a.why}</span>
                </span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-faint" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
