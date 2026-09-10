import { useMemo } from "react";
import { ArrowRight, Flame, Moon, Utensils } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { CoachBrief } from "@/components/CoachBrief";
import { LogTheGap } from "@/components/LogTheGap";
import { bodyweightOn, buildDayInputs, previousSameSplit } from "@/lib/day-inputs";
import { ratingTone } from "@/lib/stimulus";
import { scoreDay } from "@/lib/day-score";
import { MIN_PAIRS, shortfall, strongestFinding, type Series } from "@/lib/correlate";
import { totalWaterMl } from "@/lib/hydration";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The middle tab, and where the app opens.
 *
 * Deliberately reads rather than writes. Every number here already exists on
 * another tab; the point of gathering them is that no single tab answers "how
 * is today going" — you had to visit four to find out, which meant nobody did.
 *
 * It is also the screen the other domains will hang off as they arrive, so it
 * shows what is TRACKED rather than what is good: a blank protein figure means
 * nothing was logged, and saying so is more useful than a zero that reads like
 * a failure.
 */
export function DashboardView() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const activeDate = useSoma((s) => s.activeDate);
  const setTab = useSoma((s) => s.setTab);
  const live = useSoma((s) => s.live);
  const ledger = useSoma((s) => s.ledger);
  const mind = useSoma((s) => s.mind);
  const hunger = useSoma((s) => s.hunger);
  const settings = useSoma((s) => s.settings);

  const today = getLocalDateKey(new Date());
  const date = activeDate || today;

  const { score, lines } = useMemo(() => {
    return scoreDay(
      buildDayInputs({
        date,
        session: history[date] ?? null,
        previous: previousSameSplit(history, date),
        nutrition,
        bodyweightKg: bodyweightOn(nutrition, date),
        hunger,
        phase: settings.phase,
      }),
    );
  }, [history, nutrition, date, hunger, settings.phase]);

  /**
   * The five things worth comparing, each as a date-keyed series.
   *
   * A date absent means not logged, never zero — see lib/correlate.ts, where
   * pairing against a missing figure is the specific mistake being avoided.
   */
  const finding = useMemo(() => {
    const sessionScore = new Map<string, number>();
    for (const [d, sess] of Object.entries(history)) {
      const totals = sess?.totalVol;
      if (typeof totals === "number" && totals > 0) sessionScore.set(d, totals);
    }

    const sleep = new Map<string, number>();
    const calories = new Map<string, number>();
    for (const [d, nd] of Object.entries(nutrition)) {
      if (nd?.sleep?.hours != null) sleep.set(d, nd.sleep.hours);
      const kcal = (nd?.items ?? []).reduce((a, i) => a + i.cals, 0);
      if (kcal > 0) calories.set(d, kcal);
    }

    const spend = new Map<string, number>();
    for (const e of ledger) {
      if (e.kind === "income") continue;
      spend.set(e.date, (spend.get(e.date) ?? 0) + Math.abs(Number(e.amount) || 0));
    }

    const reading = new Map<string, number>();
    for (const m of mind) reading.set(m.date, (reading.get(m.date) ?? 0) + 1);

    const series: Series[] = [
      { label: "Training volume", values: sessionScore },
      { label: "Sleep", values: sleep },
      { label: "Calories", values: calories },
      { label: "Spending", values: spend },
      { label: "Reading", values: reading },
    ];
    return { found: strongestFinding(series), short: shortfall(series) };
  }, [history, nutrition, ledger, mind]);

  const day = nutrition[date];
  const kcal = Math.round((day?.items ?? []).reduce((a, i) => a + i.cals, 0));
  const protein = Math.round((day?.items ?? []).reduce((a, i) => a + i.p, 0));
  const water = totalWaterMl(day);
  const session = history[date];

  return (
    <div className="space-y-3 pb-4">
      <CoachBrief horizon="today" />

      <Card>
        <CardTitle>Today</CardTitle>
        <div className="flex items-end gap-3">
          <div className={cn("font-display text-5xl font-extrabold tabular", ratingTone(score))}>
            {Math.round(score)}
          </div>
          <div className="pb-1.5 text-xs text-muted">
            out of 100
            <div className="text-[0.65rem] text-faint">of what you tracked</div>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          {lines
            .filter((l) => l.earned != null)
            .slice(0, 5)
            .map((l) => (
              <div key={l.id} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-muted">{l.label}</span>
                <span className="shrink-0 tabular font-bold">
                  {Math.round(l.earned ?? 0)}
                  <span className="text-faint">/{l.possible}</span>
                </span>
              </div>
            ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Tile icon={Flame} label="Calories" value={kcal ? String(kcal) : "—"} unit="kcal"
              onClick={() => setTab("nutrition")} />
        <Tile icon={Utensils} label="Protein" value={protein ? String(protein) : "—"} unit="g"
              onClick={() => setTab("nutrition")} />
        <Tile icon={Moon} label="Water" value={water ? (water / 1000).toFixed(1) : "—"} unit="L"
              onClick={() => setTab("nutrition")} />
        <Tile icon={ArrowRight} label="Session"
              value={session ? String(session.exercises?.length ?? 0) : live.exercises.length ? String(live.exercises.length) : "—"}
              unit="lifts" onClick={() => setTab("workout")} />
      </div>

      <LogTheGap />

      <Card>
        <CardTitle>Across everything</CardTitle>
        {finding.found ? (
          <>
            <p className="text-sm font-bold leading-snug">{finding.found.text}</p>
            <p className="mt-1 text-[0.68rem] leading-snug text-faint">
              Correlation {finding.found.r.toFixed(2)} over {finding.found.n} days where both
              were logged. Things moving together is not one causing the other — a bad week
              usually moves several of these at once.
            </p>
          </>
        ) : (
          <p className="text-xs leading-snug text-faint">
            {finding.short > 0
              ? `Nothing to say yet. This needs ${MIN_PAIRS} days with two of these logged together — about ${finding.short} more.`
              : "Nothing has moved together strongly enough to be worth a sentence."}
          </p>
        )}
      </Card>

      <p className="px-1 text-center text-[0.7rem] leading-relaxed text-faint">
        Swipe left and right to move between tabs.
      </p>
    </div>
  );
}

function Tile({
  icon: Icon, label, value, unit, onClick,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  unit: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-surface p-3 text-left"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="font-display text-2xl font-extrabold tabular">
        {value}
        <span className="ml-1 text-xs font-bold text-faint">{unit}</span>
      </div>
    </button>
  );
}
