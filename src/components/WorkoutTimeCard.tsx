import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { sessionOn, usePlannedSession } from "@/lib/use-workout-slot";
import { DEFAULT_WORKOUT_TIME, PRE_BEFORE_MIN, hhmmOf, type WorkoutTimeSettings } from "@/lib/workout-time";
import { cn } from "@/lib/utils";

const DAYS: { n: number; label: string }[] = [
  { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" },
  { n: 5, label: "Fri" }, { n: 6, label: "Sat" }, { n: 0, label: "Sun" },
];

const field = "rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-sm tabular";

/**
 * When you train. Set here once; the Time tab puts it on the day and Fuel
 * plans the pre- and post-workout meals and their reminders around it.
 */
export function WorkoutTimeCard() {
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const today = getLocalDateKey();
  const { slot, split } = usePlannedSession(today);
  const [editing, setEditing] = useState(false);
  const cfg: WorkoutTimeSettings = settings.workoutTime ?? DEFAULT_WORKOUT_TIME;
  const save = (patch: Partial<WorkoutTimeSettings>) => patchSettings({ workoutTime: { ...cfg, ...patch } });
  const todayOnly = cfg.dates?.[today];
  const setToday = (v: string | undefined) => {
    const dates = { ...(cfg.dates ?? {}) };
    if (v === undefined) delete dates[today];
    else dates[today] = v;
    // Old one-offs are dropped as they go by.
    for (const k of Object.keys(dates)) if (k < today) delete dates[k];
    save({ dates });
  };

  // This week, Monday first, as every tab will see it.
  const t0 = parseLocalDateKey(today);
  const monday = addDays(t0, -((t0.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = getLocalDateKey(addDays(monday, i));
    return { key, label: DAYS[i]!.label.slice(0, 2), time: sessionOn(key).slot?.time ?? null };
  });
  const line = slot ? `${slot.time}–${hhmmOf(slot.end)} · ${split}` : "Rest day";
  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Workout time",
          short: "Train at",
          icon: CalendarClock,
          color: "#ff9f0a",
          value: slot ? slot.time : "Rest",
          sub: slot ? `${split} · pre-workout ${hhmmOf(slot.start - PRE_BEFORE_MIN)}` : "No session today",
        }}
      />
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wider text-muted">
            <CalendarClock className="size-3.5" /> Workout time
          </div>
          <p className="mt-1 truncate font-display text-base font-extrabold">Today · {line}</p>
          {slot && (
            <p className="text-xs text-muted">
              Pre-workout meal {hhmmOf(slot.start - PRE_BEFORE_MIN)} · post-workout {hhmmOf(slot.end + 30)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {!editing && (
        <div className="mt-3 grid grid-cols-7 gap-1">
          {week.map((d) => (
            <div
              key={d.key}
              className={cn(
                "rounded-xl px-0.5 py-1.5 text-center",
                d.key === today ? "bg-accent-soft ring-1 ring-accent-line" : "bg-surface-2",
              )}
            >
              <p className="text-[0.6rem] font-bold uppercase text-muted">{d.label}</p>
              <p className={cn("text-[0.7rem] font-bold tabular", !d.time && "text-faint")}>{d.time ?? "Rest"}</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Usually at</span>
            <input type="time" value={cfg.time.padStart(5, "0")} onChange={(e) => e.target.value && save({ time: e.target.value })} className={cn(field, "w-[6.5rem]")} />
            <span className="text-muted">for</span>
            <input
              type="number"
              inputMode="numeric"
              value={cfg.mins}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n) && n > 0) save({ mins: Math.min(300, n) });
              }}
              className={cn(field, "w-16 text-right")}
            />
            <span className="text-muted">min</span>
          </div>

          <div>
            <p className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted">Different on some days</p>
            <div className="space-y-1.5">
              {DAYS.map((d) => {
                const t = cfg.days?.[d.n];
                return (
                  <div key={d.n} className="flex items-center gap-2">
                    <span className="w-10 text-sm">{d.label}</span>
                    <input
                      type="time"
                      value={t ? t.padStart(5, "0") : ""}
                      placeholder={cfg.time}
                      onChange={(e) => save({ days: { ...(cfg.days ?? {}), [d.n]: e.target.value || undefined } })}
                      className={cn(field, "w-[6.5rem]", !t && "text-faint")}
                    />
                    {t ? (
                      <button
                        type="button"
                        aria-label={`Use the usual time on ${d.label}`}
                        onClick={() => {
                          const days = { ...(cfg.days ?? {}) };
                          delete days[d.n];
                          save({ days });
                        }}
                        className="grid size-7 place-items-center rounded-full text-muted"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : (
                      <span className="text-[0.65rem] text-faint">usual</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[0.65rem] text-faint">Rest days from your programme never get a session.</p>
          </div>

          <div>
            <p className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-muted">Just today</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={todayOnly ? todayOnly.padStart(5, "0") : ""}
                onChange={(e) => setToday(e.target.value || undefined)}
                className={cn(field, "w-[6.5rem]")}
              />
              <button
                type="button"
                onClick={() => setToday(todayOnly === "" ? undefined : "")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-bold",
                  todayOnly === "" ? "border-warn bg-warn/15 text-warn" : "border-border bg-surface-2",
                )}
              >
                {todayOnly === "" ? "Skipping today · undo" : "Not training today"}
              </button>
              {todayOnly && (
                <button type="button" onClick={() => setToday(undefined)} className="text-xs text-muted underline decoration-dotted underline-offset-2">
                  Back to usual
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
