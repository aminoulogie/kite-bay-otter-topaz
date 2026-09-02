import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { MonthMatrix, YearlyOverview } from "@/components/HabitHeatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ObjectUrlPool,
  captureImage,
  deletePhoto,
  getPhoto,
  savePhoto,
  thumbsFor,
} from "@/lib/habit-photos";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

type HabitTab = "today" | "calendar" | "month" | "year";

const TABS: { id: HabitTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "calendar", label: "Calendar" },
  { id: "month", label: "Matrix" },
  { id: "year", label: "Year" },
];

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

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
      {tab === "calendar" && <CalendarPanel />}

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
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-bold">{h.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {streak > 0 && <Badge tone="accent">{streak} day streak</Badge>}
                  <span className="text-[0.7rem] text-faint">
                    {weekDone}/{h.goalDaysPerWeek} this week
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleHabit(h.id)}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full border transition-transform active:scale-90",
                  done
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border bg-surface-2 text-faint",
                )}
                aria-label={done ? "Uncheck habit" : "Complete habit"}
              >
                <Check className="size-5" />
              </button>
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
    </>
  );
}

/**
 * Month calendar for one habit, with each day's photo as its cell background.
 * Tapping a day opens a sheet where it can be ticked or photographed — the
 * "capture the moment" half of the plugin's habit tracker.
 */
function CalendarPanel() {
  const habits = useSoma((s) => s.habits);
  const toggleHabit = useSoma((s) => s.toggleHabit);

  const [habitId, setHabitId] = useState<string>("");
  const [cursor, setCursor] = useState(() => new Date());
  const [thumbs, setThumbs] = useState<Map<string, Blob>>(new Map());
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const pool = useRef(new ObjectUrlPool());

  const habit = habits.find((h) => h.id === habitId) ?? habits[0];

  useEffect(() => {
    if (!habit) return;
    let alive = true;
    void thumbsFor(habit.id).then((m) => {
      if (alive) setThumbs(m);
    });
    return () => {
      alive = false;
    };
  }, [habit, reloadKey]);

  // Every repaint invalidates the previous month's object URLs.
  pool.current.releaseAll();

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = getLocalDateKey(new Date());

  const cells = useMemo(() => {
    const total = new Date(year, month + 1, 0).getDate();
    const blanks = (new Date(year, month, 1).getDay() + 6) % 7;
    return { total, blanks };
  }, [year, month]);

  const shift = useCallback((delta: number) => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }, []);

  if (!habit) {
    return <Card className="py-8 text-center text-sm text-faint">No habits yet.</Card>;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <Card className="space-y-3">
        <select
          className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-bold"
          value={habit.id}
          onChange={(e) => setHabitId(e.target.value)}
        >
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>

        <div className="flex items-center justify-between">
          <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <div className="text-center">
            <div className="font-display text-sm font-extrabold">{monthName}</div>
            <div className="text-[0.65rem] text-faint">Tap a day to tick it or add a photo</div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[0.6rem] font-bold uppercase text-faint">
          {DOW.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: cells.blanks }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {Array.from({ length: cells.total }, (_, i) => {
            const d = i + 1;
            const date = `${year}-${pad(month + 1)}-${pad(d)}`;
            const done = habit.history[date] === true;
            const thumb = thumbs.get(date);
            const future = date > today;

            return (
              <button
                key={date}
                type="button"
                disabled={future}
                onClick={() => setOpenDate(date)}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg border text-[0.62rem] font-bold",
                  done ? "border-accent" : "border-border",
                  future && "opacity-30",
                  date === today && !done && "border-accent-line",
                )}
                style={{ background: done && !thumb ? habit.color : "var(--color-surface-2)" }}
              >
                {thumb && (
                  <img
                    src={pool.current.create(thumb)}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                <span
                  className={cn(
                    "absolute bottom-0.5 right-1",
                    thumb ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]" : done ? "text-[#0b0c10]" : "text-faint",
                  )}
                >
                  {d}
                </span>
                {thumb && (
                  <Camera className="absolute left-1 top-1 size-2.5 text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.9))]" />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {openDate && (
        <DaySheet
          habitId={habit.id}
          habitName={habit.name}
          date={openDate}
          done={habit.history[openDate] === true}
          onToggle={() => toggleHabit(habit.id, openDate)}
          onChanged={() => setReloadKey((k) => k + 1)}
          onClose={() => setOpenDate(null)}
        />
      )}
    </>
  );
}

function DaySheet({
  habitId,
  habitName,
  date,
  done,
  onToggle,
  onChanged,
  onClose,
}: {
  habitId: string;
  habitName: string;
  date: string;
  done: boolean;
  onToggle: () => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    void getPhoto(habitId, date).then((p) => {
      if (!alive) return;
      setHasPhoto(!!p);
      if (p) {
        created = URL.createObjectURL(p.display);
        setUrl(created);
      }
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [habitId, date]);

  const capture = async () => {
    const file = await captureImage();
    if (!file) return;
    setBusy(true);
    try {
      await savePhoto(habitId, date, file);
      toast.success("Photo saved");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/85 p-4 sm:items-center">
      <Card className="w-full max-w-md space-y-3">
        <CardTitle>
          <span className="min-w-0 truncate">
            {habitName} · {date}
          </span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-muted" />
          </button>
        </CardTitle>

        {url ? (
          <img src={url} alt={`Habit photo from ${date}`} className="w-full rounded-xl" />
        ) : (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-xs text-faint">
            No photo for this day
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1"
            variant={done ? "primary" : undefined}
            onClick={() => {
              onToggle();
              onClose();
            }}
          >
            <Check className="size-4" /> {done ? "Done" : "Mark done"}
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => void capture()}>
            <Camera className="size-4" /> {hasPhoto ? "Replace" : "Capture"}
          </Button>
          {hasPhoto && (
            <Button
              variant="danger"
              onClick={() => {
                void deletePhoto(habitId, date).then(() => {
                  toast.success("Photo deleted");
                  onChanged();
                  onClose();
                });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
