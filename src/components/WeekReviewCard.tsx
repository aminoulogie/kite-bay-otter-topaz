import { useMemo } from "react";
import { TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sized } from "@/components/WidgetGrid";
import { bodyweightOn, buildDayInputs, previousSameSplit } from "@/lib/day-inputs";
import { scoreDay } from "@/lib/day-score";
import { isRestSplit } from "@/lib/programs";
import { SomaIntelligenceEngine, getLocalDateKey } from "@/lib/soma";
import { useActiveProgram, useSoma } from "@/lib/store";
import { reviewWeek } from "@/lib/week-review";

const shortDay = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

/**
 * The last seven days, as what cost them most. On Sunday it is "Your week";
 * the rest of the time "The last 7 days", so it is useful mid-week too.
 */
export function WeekReviewCard() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const habits = useSoma((s) => s.habits);
  const hunger = useSoma((s) => s.hunger);
  const restDays = useSoma((s) => s.restDays);
  const settings = useSoma((s) => s.settings);
  const program = useActiveProgram();

  const review = useMemo(() => {
    const firstSession = Object.keys(history).sort()[0] ?? null;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = getLocalDateKey(d);
      const p = SomaIntelligenceEngine.getProgramProjectedDay(new Date(`${date}T12:00:00`), settings.scheduleOverrides, program);
      const trainingDay = !p.isRest && !isRestSplit(p.split);
      const session = history[date] ?? null;
      days.push({
        date,
        score: scoreDay(
          buildDayInputs({
            date,
            session,
            previous: previousSameSplit(history, date),
            nutrition,
            isRestDay: !session && (!!restDays[date] || !trainingDay),
            isTrainingDay: trainingDay,
            firstSession,
            bodyweightKg: bodyweightOn(nutrition, date),
            hunger,
            phase: settings.phase,
            habits,
          }),
        ),
      });
    }
    return reviewWeek(days);
  }, [history, nutrition, habits, hunger, restDays, settings.scheduleOverrides, settings.phase, program]);

  const sunday = new Date().getDay() === 0;
  const title = sunday ? "Your week" : "The last 7 days";

  return (
    <Sized glance={{
      label: title,
      short: "Week",
      icon: TrendingDown,
      color: "#ff9f0a",
      value: review.average != null ? String(review.average) : null,
      sub: review.causes[0]?.text ?? null,
      lines: review.causes.map((c) => ({ text: c.text, value: `−${Math.round(c.lost)}` })),
      empty: "Not enough logged yet",
    }}>
      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-sm font-extrabold">{title}</span>
          {review.average != null && (
            <span className="font-display text-2xl font-extrabold tabular">
              {review.average}
              <span className="ml-1 text-xs font-bold text-faint">avg</span>
            </span>
          )}
        </div>
        {review.causes.length ? (
          <>
            <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted">
              What pulled it down
            </div>
            <ol className="space-y-1.5">
              {review.causes.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="w-4 text-xs font-extrabold text-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1 font-semibold">{c.text}</span>
                  <span className="shrink-0 text-xs font-bold tabular text-warn">−{Math.round(c.lost)} pts</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-xs text-muted">
            {review.scored ? "Nothing cost you much this week — keep it going." : "Log a few days and this fills in."}
          </p>
        )}
        {(review.best || review.blank > 0) && (
          <p className="mt-2 text-[0.7rem] text-faint">
            {review.best && `Best ${shortDay(review.best.date)} ${review.best.score}`}
            {review.worst && ` · lowest ${shortDay(review.worst.date)} ${review.worst.score}`}
            {review.blank > 0 && ` · ${review.blank} ${review.blank === 1 ? "day" : "days"} with nothing logged`}
          </p>
        )}
      </Card>
    </Sized>
  );
}
