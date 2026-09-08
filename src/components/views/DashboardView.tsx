import { useMemo } from "react";
import { ArrowRight, Flame, Moon, Utensils } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { bodyweightOn, buildDayInputs, previousSameSplit } from "@/lib/day-inputs";
import { ratingTone } from "@/lib/stimulus";
import { scoreDay } from "@/lib/day-score";
import { totalWaterMl } from "@/lib/hydration";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TabId } from "@/lib/types";

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
  const habits = useSoma((s) => s.habits);
  const activeDate = useSoma((s) => s.activeDate);
  const setTab = useSoma((s) => s.setTab);
  const live = useSoma((s) => s.live);

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
      }),
    );
  }, [history, nutrition, date]);

  const day = nutrition[date];
  const kcal = Math.round((day?.items ?? []).reduce((a, i) => a + i.cals, 0));
  const protein = Math.round((day?.items ?? []).reduce((a, i) => a + i.p, 0));
  const water = totalWaterMl(day);
  const session = history[date];
  const habitsDone = habits.filter((h) => h.history?.[date] === true).length;

  // What is still open today, in the order it is usually done.
  const open: { label: string; tab: TabId }[] = [];
  if (!session && live.exercises.length === 0) open.push({ label: "No session logged", tab: "workout" });
  if (!day?.items?.length) open.push({ label: "Nothing eaten logged", tab: "nutrition" });
  if (day?.sleep?.hours == null) open.push({ label: "Sleep not logged", tab: "body" });
  if (habits.length && habitsDone < habits.length) {
    open.push({ label: `${habits.length - habitsDone} habits left`, tab: "habits" });
  }

  return (
    <div className="space-y-3 pb-4">
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

      {open.length > 0 && (
        <Card>
          <CardTitle>Still open</CardTitle>
          <div className="space-y-1.5">
            {open.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setTab(o.tab)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
              >
                <span className="text-sm font-bold">{o.label}</span>
                <ArrowRight className="size-4 shrink-0 text-faint" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <p className="px-1 text-center text-[0.7rem] leading-relaxed text-faint">
        Swipe left and right to move between tabs. Money and Mind are being built to the
        left of this one.
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
