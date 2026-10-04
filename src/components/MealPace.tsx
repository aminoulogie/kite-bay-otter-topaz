import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Clock, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";
import { DEFAULT_MEAL_TIMES, cleanTimes, pace, type MealTime } from "@/lib/meal-pace";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * The day's food on a timeline: what each meal should be, how far behind you
 * are, and how big the next one has to be so the evening does not end up
 * holding the whole day.
 */
export function MealPace({
  eaten, goal, isToday,
}: {
  eaten: { cals: number; protein: number };
  goal: { cals: number; protein: number };
  isToday: boolean;
}) {
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const [editing, setEditing] = useState(false);
  const now = useMinuteNow();
  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : -1;
  const p = pace(settings.mealTimes, nowMin, goal, eaten);
  const reminders = settings.mealReminders !== false;

  const status =
    p.left <= 0
      ? { text: "Goal reached for today", tone: "good" as const }
      : p.behind > 150
        ? { text: `${fmt(p.behind)} kcal behind — spread over the meals left`, tone: "warn" as const }
        : p.behind < -150
          ? { text: `${fmt(-p.behind)} kcal ahead — later meals get lighter`, tone: "good" as const }
          : { text: "On pace", tone: "good" as const };

  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: p.next ? `Next: ${p.next.label} ${p.next.time}` : "Meal timeline",
          short: "Next meal",
          icon: Clock,
          color: "#fa114f",
          value: p.next ? fmt(p.next.target) : fmt(p.left),
          unit: "kcal",
          sub: status.text,
          progress: goal.cals > 0 ? Math.min(1, eaten.cals / Math.max(1, p.due || goal.cals)) : null,
        }}
      />
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wider text-muted">
          <Clock className="size-3.5" />
          Meal timeline
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => patchSettings({ mealReminders: !reminders })}
            aria-label={reminders ? "Turn meal reminders off" : "Turn meal reminders on"}
            className={cn(
              "grid size-8 place-items-center rounded-full border border-border",
              reminders ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
            )}
          >
            {reminders ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="rounded-full border border-border bg-surface-2 px-3 text-xs font-bold"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {editing ? (
        <TimesEditor />
      ) : (
        <>
          {isToday && p.next && p.left > 0 && (
            <div className="mt-3 rounded-2xl border border-accent-line bg-accent-soft px-3.5 py-3">
              <p className="text-[0.7rem] font-bold text-muted">
                Next · {p.next.label} at {p.next.time}
              </p>
              <p className="mt-0.5 font-display text-xl font-extrabold tabular">
                {fmt(p.next.target)} <span className="text-sm text-muted">kcal</span>
                <span className="ml-2 text-base">{p.next.protein}</span>
                <span className="text-sm text-muted"> g protein</span>
              </p>
            </div>
          )}

          {isToday && (
            <p className={cn("mt-2 text-xs font-bold", status.tone === "warn" ? "text-warn" : "text-muted")}>
              {status.text} · {fmt(eaten.cals)} eaten, {fmt(p.due)} due by now
            </p>
          )}

          <ol className="mt-3 space-y-1">
            {p.slots.map((s) => {
              const isNext = isToday && p.next?.time === s.time;
              return (
                <li
                  key={s.time + s.label}
                  className={cn("flex items-center gap-3 rounded-xl px-2.5 py-1.5", isNext && "bg-surface-2")}
                >
                  <span className="w-11 shrink-0 text-xs tabular text-faint">{s.time}</span>
                  <span className={cn("flex-1 text-sm", s.past && isToday && "text-muted")}>{s.label}</span>
                  {s.past && isToday ? (
                    <Check className="size-3.5 text-faint" />
                  ) : null}
                  <span className={cn("w-24 text-right text-sm tabular", isNext ? "font-bold" : "text-muted")}>
                    {fmt(s.target)} kcal
                  </span>
                </li>
              );
            })}
          </ol>
          {reminders && (
            <p className="mt-2 text-[0.65rem] leading-snug text-faint">
              You get a notification at each time with how much to eat, updated as you log.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function TimesEditor() {
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const times = cleanTimes(settings.mealTimes);
  const total = times.reduce((a, t) => a + t.share, 0) || 1;
  const save = (next: MealTime[]) => patchSettings({ mealTimes: next });
  const update = (i: number, patch: Partial<MealTime>) =>
    save(times.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className="mt-3 space-y-2">
      {times.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="time"
            value={t.time.padStart(5, "0")}
            onChange={(e) => e.target.value && update(i, { time: e.target.value })}
            className="w-[6.5rem] shrink-0 rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-sm tabular"
          />
          <input
            value={t.label}
            onChange={(e) => update(i, { label: e.target.value })}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            inputMode="numeric"
            value={t.share}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n > 0) update(i, { share: Math.min(100, n) });
            }}
            aria-label={`${t.label} share`}
            className="w-12 shrink-0 rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-right text-sm tabular"
          />
          <span className="w-9 text-[0.65rem] tabular text-faint">{Math.round((t.share / total) * 100)}%</span>
          <button
            type="button"
            onClick={() => times.length > 1 && save(times.filter((_, j) => j !== i))}
            aria-label={`Remove ${t.label}`}
            className="grid size-7 place-items-center rounded-full text-muted"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => save([...times, { label: "Snack", time: "17:00", share: 10 }])}
          className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold"
        >
          <Plus className="size-3" /> Add a time
        </button>
        <button
          type="button"
          onClick={() => save(DEFAULT_MEAL_TIMES)}
          className="rounded-full px-3 py-1.5 text-xs text-muted underline decoration-dotted underline-offset-2"
        >
          Reset
        </button>
      </div>
      <p className="text-[0.65rem] leading-snug text-faint">
        The number is each meal's weight; the percent is its share of the day.
      </p>
    </div>
  );
}
