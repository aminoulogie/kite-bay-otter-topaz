import { useEffect, useState } from "react";
import { CalendarDays, Camera, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HabitPhotoCalendar } from "@/components/HabitPhotoCalendar";
import { MonthMatrix, YearlyOverview } from "@/components/HabitHeatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { captureImage, getPhoto, savePhoto } from "@/lib/habit-photos";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Habit } from "@/lib/types";

type HabitTab = "today" | "month" | "year";

const TABS: { id: HabitTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "month", label: "Matrix" },
  { id: "year", label: "Year" },
];

export function HabitsView() {
  const habits = useSoma((s) => s.habits);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const addHabit = useSoma((s) => s.addHabit);
  const removeHabit = useSoma((s) => s.removeHabit);
  const activeDate = useSoma((s) => s.activeDate);

  const [tab, setTab] = useState<HabitTab>("today");
  const [name, setName] = useState("");

  return (
    <div className="space-y-3 pb-4">
      <Card className="overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_55%),var(--color-surface)]">
        <Badge tone="accent">Habits · {activeDate}</Badge>
        <h1 className="mt-2 font-display text-xl font-extrabold tracking-tight">Consistency</h1>
        <p className="mt-1 text-xs text-muted">
          {habits.length} tracked · {habits.filter((h) => h.history[activeDate]).length} done today
        </p>
      </Card>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-xs font-bold transition-colors",
              tab === t.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "today" && <TodayPanel />}

      {tab === "month" && (
        <>
          <h2 className="px-1 font-display text-sm font-extrabold">30-Day Activity Matrix</h2>
          {habits.map((h) => (
            <Card key={h.id} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex size-9 items-center justify-center rounded-xl text-sm font-extrabold"
                  style={{ background: `${h.color}22`, color: h.color }}
                >
                  {h.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-sm font-bold">{h.name}</h3>
                  <p className="text-[0.7rem] text-faint">Tap a pixel to toggle</p>
                </div>
              </div>
              <MonthMatrix habit={h} onToggle={(d) => toggleHabit(h.id, d)} />
            </Card>
          ))}
          {habits.length === 0 && (
            <Card className="py-8 text-center text-sm text-faint">No habits yet.</Card>
          )}
        </>
      )}

      {tab === "year" && (
        <>
          <h2 className="px-1 font-display text-sm font-extrabold">Yearly Overview</h2>
          <YearlyOverview habits={habits} />
        </>
      )}

      <Card>
        <CardTitle>New habit</CardTitle>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Walk 8k steps"
          />
          <Button
            variant="primary"
            onClick={() => {
              if (!name.trim()) return;
              addHabit({ name: name.trim(), desc: "", color: "#d3fd50", goalDaysPerWeek: 7 });
              setName("");
            }}
          >
            Add
          </Button>
        </div>
        {habits.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {habits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => removeHabit(h.id)}
                className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.7rem] font-semibold text-muted"
              >
                <Trash2 className="size-3 text-danger" />
                <span className="max-w-28 truncate">{h.name}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TodayPanel() {
  const habits = useSoma((s) => s.habits);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const activeDate = useSoma((s) => s.activeDate);
  const today = parseLocalDateKey(activeDate);

  // Which habit's photo calendar is open, and today's thumbnails.
  const [calendarFor, setCalendarFor] = useState<Habit | null>(null);
  const [shots, setShots] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Today's photo per habit, so a captured moment shows on the card itself
  // rather than only inside the calendar. URLs are revoked in the cleanup,
  // never mid-render: revoking a URL the browser is still fetching leaves a
  // blank tile.
  useEffect(() => {
    let alive = true;
    const created: string[] = [];

    void (async () => {
      const next = new Map<string, string>();
      for (const h of habits) {
        const p = await getPhoto(h.id, activeDate);
        if (!p) continue;
        const u = URL.createObjectURL(p.thumb);
        created.push(u);
        next.set(h.id, u);
      }
      if (alive) setShots(next);
      else for (const u of created) URL.revokeObjectURL(u);
    })();

    return () => {
      alive = false;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [habits, activeDate, reload]);

  /**
   * Capture now. Ticking the habit as well is the point: you photograph the
   * moment because it happened, so making that a second tap would be busywork.
   */
  const captureNow = async (h: Habit) => {
    const file = await captureImage();
    if (!file) return;
    setBusy(h.id);
    try {
      await savePhoto(h.id, activeDate, file);
      if (!h.history[activeDate]) toggleHabit(h.id, activeDate);
      setReload((k) => k + 1);
      toast.success("Captured " + h.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that photo.");
    } finally {
      setBusy(null);
    }
  };

  if (!habits.length) {
    return <Card className="py-8 text-center text-sm text-faint">No habits yet.</Card>;
  }

  return (
    <>
      {habits.map((h) => {
        // Streak of consecutive completed days ending today, or yesterday if
        // today is not ticked yet — an untouched today should not read as a
        // broken streak before the day is over.
        let streak = 0;
        let cursor = h.history[activeDate] ? today : addDays(today, -1);
        while (h.history[getLocalDateKey(cursor)] === true) {
          streak++;
          cursor = addDays(cursor, -1);
        }

        const week = Array.from({ length: 7 }, (_, i) => {
          const key = getLocalDateKey(addDays(today, -(6 - i)));
          return { key, done: !!h.history[key] };
        });
        const weekDone = week.filter((d) => d.done).length;
        const done = !!h.history[activeDate];

        return (
          <Card key={h.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              {shots.get(h.id) && (
                <button
                  type="button"
                  onClick={() => setCalendarFor(h)}
                  className="size-11 shrink-0 overflow-hidden rounded-xl border border-accent"
                  aria-label={"Today's photo for " + h.name}
                >
                  <img src={shots.get(h.id)} alt="" className="size-full object-cover" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-bold">{h.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {streak > 0 && <Badge tone="accent">{streak} day streak</Badge>}
                  <span className="text-[0.7rem] text-faint">
                    {weekDone}/{h.goalDaysPerWeek} this week
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCalendarFor(h)}
                  className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-muted transition-transform active:scale-90"
                  aria-label={"Photo calendar for " + h.name}
                >
                  <CalendarDays className="size-5" />
                </button>
                <button
                  type="button"
                  disabled={busy === h.id}
                  onClick={() => void captureNow(h)}
                  className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-muted transition-transform active:scale-90 disabled:opacity-40"
                  aria-label={"Capture photo for " + h.name}
                >
                  <Camera className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleHabit(h.id)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full border transition-transform active:scale-90",
                    done
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-border bg-surface-2 text-faint",
                  )}
                  aria-label={done ? "Uncheck habit" : "Complete habit"}
                >
                  <Check className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex gap-1.5">
              {week.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleHabit(h.id, d.key)}
                  className="h-6 flex-1 rounded-md"
                  style={{ background: d.done ? h.color : "var(--color-surface-3)" }}
                  aria-label={d.key}
                />
              ))}
            </div>
          </Card>
        );
      })}

      {calendarFor && (
        <HabitPhotoCalendar
          habit={habits.find((h) => h.id === calendarFor.id) ?? calendarFor}
          onClose={() => {
            setCalendarFor(null);
            setReload((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

/**
 * Month calendar for one habit, with each day's photo as its cell background.
 * Tapping a day opens a sheet where it can be ticked or photographed — the
 * "capture the moment" half of the plugin's habit tracker.
 */
