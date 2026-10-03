import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3, CalendarCheck, CalendarDays, Camera, ChevronLeft, ChevronRight, Flame, MoreHorizontal, Palette, Plus, SlidersHorizontal,
  Trash2, Trophy, X,
} from "lucide-react";
import { toast } from "sonner";
import { MonthStrip } from "@/components/HabitHeatmap";
import { ColorPalette } from "@/components/ColorPalette";
import { MoneySheet } from "@/components/money/money-ui";
import { HABIT_COLORS } from "@/lib/habit-colors";
import { HabitPhotoCalendar } from "@/components/HabitPhotoCalendar";
import { HabitSetupSheet } from "@/components/HabitSetupSheet";
import { DotGrid, HabitCheck, HabitIcon, HabitWork } from "@/components/habits/HabitBits";
import { describeAuto } from "@/lib/habit-auto";
import { captureImage, getPhoto, savePhoto } from "@/lib/habit-photos";
import { COEF_LABELS, coefOf, habitStart } from "@/lib/habit-score";
import {
  completionRate, currentStreak, frequency, longestStreak, totalDays, yearWeeks, type FrequencyMode,
} from "@/lib/habit-stats";
import { hasSteps } from "@/lib/habit-steps";
import { tapLight } from "@/lib/haptics";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Habit, HabitRamp, HabitStep } from "@/lib/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One habit's own page: streaks, the year, how often, and notes. */
export function HabitDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const habit = useSoma((s) => s.habits.find((h) => h.id === id));
  const habits = useSoma((s) => s.habits);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const removeHabit = useSoma((s) => s.removeHabit);
  const restoreHabit = useSoma((s) => s.restoreHabit);
  const setHabitSteps = useSoma((s) => s.setHabitSteps);
  const setHabitRamp = useSoma((s) => s.setHabitRamp);
  const setHabitSeconds = useSoma((s) => s.setHabitSeconds);
  const setHabitCoef = useSoma((s) => s.setHabitCoef);
  const setHabitAuto = useSoma((s) => s.setHabitAuto);
  const activeDate = useSoma((s) => s.activeDate);
  const today = getLocalDateKey(new Date());

  const [setup, setSetup] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [coloring, setColoring] = useState(false);
  const setHabitColor = useSoma((s) => s.setHabitColor);

  // The day's photo, shown on the page rather than only in the calendar.
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    void getPhoto(id, activeDate).then((p) => {
      if (!alive || !p) return;
      url = URL.createObjectURL(p.thumb);
      setShot(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setShot(null);
    };
  }, [id, activeDate, reload]);

  if (!habit) return null;
  const h = habit;

  const captureNow = async () => {
    const file = await captureImage();
    if (!file) return;
    setBusy(true);
    try {
      await savePhoto(h.id, activeDate, file);
      // Photographing the moment ticks it — except a checklist, where one
      // photo is not proof of every step.
      if (!hasSteps(h) && !h.history[activeDate]) toggleHabit(h.id, activeDate);
      setReload((k) => k + 1);
      toast.success("Captured " + h.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that photo.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    const idx = habits.findIndex((x) => x.id === h.id);
    onBack();
    removeHabit(h.id);
    toast.success(`${h.name} removed`, { action: { label: "Undo", onClick: () => restoreHabit(idx, h) } });
  };

  const sub = h.desc || (h.auto ? `⚡ Ticks itself when ${describeAuto(h.auto).toLowerCase()}` : COEF_LABELS[coefOf(h)]);
  const rate = completionRate(h, today);

  return (
    <>
      <div className="flex items-center gap-1 px-2 pb-1 pt-[max(12px,var(--safe-top,env(safe-area-inset-top)))]">
        <button type="button" onClick={onBack} className="flex items-center gap-0.5 rounded-full px-2 py-2 text-sm font-bold text-accent-text">
          <ChevronLeft className="size-5" /> Habits
        </button>
        <div className="flex-1" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-label="More"
            aria-expanded={menu}
            className="grid size-10 place-items-center rounded-full text-fg active:bg-surface-2"
          >
            <MoreHorizontal className="size-6" />
          </button>
          {menu && (
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-1 top-11 z-20 w-52 overflow-hidden rounded-2xl border border-border-strong bg-surface-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
                {[
                  { icon: Camera, label: "Take a photo", run: () => void captureNow(), off: busy },
                  { icon: CalendarDays, label: "Photo calendar", run: () => setPhotos(true) },
                  { icon: SlidersHorizontal, label: "Set up", run: () => setSetup(true) },
                  { icon: Palette, label: "Colour", run: () => setColoring(true) },
                  { icon: Trash2, label: "Delete habit", run: remove, danger: true },
                ].map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    disabled={it.off}
                    onClick={() => {
                      setMenu(false);
                      it.run();
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm font-semibold last:border-0 active:bg-surface-3 disabled:opacity-40",
                      it.danger && "text-danger",
                    )}
                  >
                    <it.icon className="size-4" />
                    {it.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="soma-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[calc(var(--safe-bottom,env(safe-area-inset-bottom))+28px)]">
        <div className="flex items-center gap-4 pt-1">
          <HabitIcon habit={h} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[1.7rem] font-extrabold leading-tight tracking-tight">{h.name}</h2>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">{sub}</p>
            <p className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-faint">
              ×{coefOf(h)} importance · {h.goalDaysPerWeek}/week goal
            </p>
          </div>
          <HabitCheck habit={h} size="lg" />
        </div>

        {shot && (
          <button
            type="button"
            onClick={() => setPhotos(true)}
            className="block h-40 w-full overflow-hidden rounded-3xl border border-border"
            aria-label={`${activeDate} photo`}
          >
            <img src={shot} alt="" className="size-full object-cover" />
          </button>
        )}

        <HabitWork habit={h} />

        <div className="grid grid-cols-4 gap-2">
          <StatTile icon={Flame} color="#ff9f0a" value={currentStreak(h, today)} label="Day streak" />
          <StatTile icon={Trophy} color="#ffd60a" value={longestStreak(h)} label="Longest" />
          <StatTile icon={BarChart3} color="#30d158" value={rate == null ? "–" : `${rate}%`} label="Completion" />
          <StatTile icon={CalendarCheck} color="#64d2ff" value={totalDays(h)} label="Total days" />
        </div>

        <Section title="Last 4 weeks" hint="Tap today to tick">
          <MonthStrip habit={h} onToggle={(d) => toggleHabit(h.id, d)} />
        </Section>

        <YearHeatmap habit={h} today={today} />
        <Frequency habit={h} today={today} />
        <Notes habit={h} />
      </div>

      {setup &&
        createPortal(
          <HabitSetupSheet
            habit={h}
            onClose={() => setSetup(false)}
            onSaveSteps={(next: HabitStep[]) => setHabitSteps(h.id, next)}
            onSaveRamp={(next: HabitRamp | null) => setHabitRamp(h.id, next)}
            onSaveSeconds={(next) => setHabitSeconds(h.id, next)}
            onSaveCoef={(next) => setHabitCoef(h.id, next)}
            onSaveAuto={(next) => setHabitAuto(h.id, next)}
          />,
          document.body,
        )}
      {coloring &&
        createPortal(
          <MoneySheet title={`${h.name} colour`} onClose={() => setColoring(false)}>
            <ColorPalette
              value={h.color}
              onChange={(c) => setHabitColor(h.id, c)}
              presets={HABIT_COLORS.map((c) => ({ label: c, color: c }))}
            />
          </MoneySheet>,
          document.body,
        )}
      {photos &&
        createPortal(
          <HabitPhotoCalendar
            habit={h}
            onClose={() => {
              setPhotos(false);
              setReload((k) => k + 1);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function StatTile({
  icon: Icon, color, value, label,
}: {
  icon: typeof Flame;
  color: string;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/[0.06] bg-surface px-1 py-3 text-center">
      <Icon className="size-5" style={{ color }} strokeWidth={2.4} fill={`color-mix(in srgb, ${color} 30%, transparent)`} />
      <span className="mt-1.5 font-display text-xl font-extrabold leading-tight tabular">{value}</span>
      <span className="mt-0.5 text-[0.66rem] font-medium text-muted">{label}</span>
    </div>
  );
}

function Section({
  title, hint, right, children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-display text-sm font-extrabold">{title}</h3>
        {hint && <span className="text-[0.65rem] text-faint">{hint}</span>}
        <div className="flex-1" />
        {right}
      </div>
      {children}
    </section>
  );
}

function YearHeatmap({ habit, today }: { habit: Habit; today: string }) {
  const thisYear = Number(today.slice(0, 4));
  const start = habitStart(habit);
  const firstYear = Math.min(thisYear, start ? Number(start.slice(0, 4)) : thisYear);
  const [year, setYear] = useState(thisYear);
  const { cols, months } = useMemo(() => yearWeeks(year), [year]);
  const doneInYear = Object.keys(habit.history).filter((d) => habit.history[d] && d.startsWith(`${year}-`)).length;

  return (
    <section className="rounded-3xl border border-white/[0.06] bg-surface px-3 pb-4 pt-3">
      <div className="mb-2 flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={year <= firstYear}
          onClick={() => setYear((y) => y - 1)}
          aria-label="Previous year"
          className="grid size-8 place-items-center rounded-full text-fg disabled:opacity-25"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="w-14 text-center text-base font-bold tabular">{year}</span>
        <button
          type="button"
          disabled={year >= thisYear}
          onClick={() => setYear((y) => y + 1)}
          aria-label="Next year"
          className="grid size-8 place-items-center rounded-full text-fg disabled:opacity-25"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="relative mb-1.5 ml-[calc(1.6rem+1.5px)] h-[10px]">
        {months.map((m) => (
          <span
            key={m.label}
            className="absolute top-0 text-[0.5rem] font-medium leading-none text-muted"
            style={{ left: `${(m.col / cols.length) * 100}%` }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <DotGrid habit={habit} cols={cols} today={today} rowLabels={DAY_LABELS} gap={1.5} showFuture />
      <p className="mt-2 text-center text-[0.68rem] text-faint">{doneInYear} days in {year}</p>
    </section>
  );
}

const MODES: { id: FrequencyMode; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function Frequency({ habit, today }: { habit: Habit; today: string }) {
  const [mode, setMode] = useState<FrequencyMode>("weekly");
  const year = Number(today.slice(0, 4));
  const bars = useMemo(() => frequency(habit, mode, year, today), [habit, mode, year, today]);
  const ceiling = Math.max(1, ...bars.map((b) => b.max));
  const ticks = [ceiling, Math.round((ceiling * 2) / 3), Math.round(ceiling / 3), 0];
  const [picked, setPicked] = useState<number | null>(null);
  const bar = picked != null ? bars[picked] : undefined;

  return (
    <section className="rounded-3xl border border-white/[0.06] bg-surface p-4">
      <h3 className="mb-3 font-display text-base font-bold">Frequency</h3>
      <div className="mb-4">
        <div className="grid grid-cols-3 rounded-full bg-surface-2 p-0.5" data-no-swipe-close>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id);
                setPicked(null);
                tapLight();
              }}
              className={cn(
                "rounded-full py-1.5 text-xs font-semibold transition-colors",
                mode === m.id ? "bg-accent text-accent-ink" : "text-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex h-32 shrink-0 flex-col justify-between text-right text-[0.6rem] tabular text-faint">
          {ticks.map((t, i) => (
            <span key={i} className="leading-none">
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-32 min-w-0 flex-1" data-no-swipe-close>
          {ticks.map((_, i) => (
            <div
              key={i}
              className="absolute inset-x-0 border-t border-white/[0.06]"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[6%] px-[2%]">
            {bars.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setPicked(i === picked ? null : i);
                  tapLight();
                }}
                className="relative flex h-full min-w-0 flex-1 items-end"
                aria-label={`${b.label}: ${b.value} of ${b.max}`}
              >
                {picked === i && (
                  <span className="absolute inset-x-0 -top-1 text-center text-[0.62rem] font-bold tabular">{b.value}</span>
                )}
                <span
                  className="block w-full rounded-t-[5px] rounded-b-[2px] transition-[height] duration-300"
                  style={{
                    height: `${Math.max(b.value ? 3 : 1.5, (b.value / ceiling) * 100)}%`,
                    background: b.value
                      ? `linear-gradient(180deg, color-mix(in srgb, ${habit.color} 85%, white), ${habit.color})`
                      : "var(--color-border)",
                    opacity: picked == null || picked === i ? 1 : 0.45,
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-[6%] pl-7 pr-[2%]">
        {bars.map((b, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center text-[0.62rem] font-medium text-muted">
            {b.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-[0.68rem] text-faint">
        {bar
          ? `${bar.value} of ${bar.max} ${mode === "weekly" ? `${bar.label}s in 12 weeks` : mode === "monthly" ? `days in ${monthName(picked!, year)}` : `days in ${bar.label}`}`
          : mode === "weekly"
            ? "Days done per weekday, last 12 weeks"
            : mode === "monthly"
              ? `Days done per month, ${year}`
              : "Days done per year"}
      </p>
    </section>
  );
}

function monthName(m: number, year: number): string {
  return new Date(year, m, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
}

function Notes({ habit }: { habit: Habit }) {
  const addHabitNote = useSoma((s) => s.addHabitNote);
  const removeHabitNote = useSoma((s) => s.removeHabitNote);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [all, setAll] = useState(false);
  const notes = habit.notes ?? [];
  const shown = all ? notes : notes.slice(0, 3);

  const save = () => {
    if (!draft.trim()) return;
    addHabitNote(habit.id, draft);
    setDraft("");
    setWriting(false);
    tapLight();
  };

  return (
    <Section
      title="Notes"
      right={
        <div className="flex items-center gap-2">
          {notes.length > 3 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-bold text-accent-text">
              {all ? "Less" : "See all"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setWriting((v) => !v)}
            aria-label="Add a note"
            className="grid size-7 place-items-center rounded-full bg-surface-2 text-muted"
          >
            <Plus className="size-4" />
          </button>
        </div>
      }
    >
      {writing && (
        <div className="mb-3 space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="How did it go?"
            className="w-full resize-none rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWriting(false)} className="rounded-full px-3 py-1.5 text-xs font-bold text-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!draft.trim()}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold text-accent-ink disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}
      {notes.length === 0 && !writing && <p className="text-xs text-faint">No notes yet. Tap + to write one.</p>}
      <ul className="space-y-2">
        {shown.map((n) => (
          <li key={n.id} className="flex items-start gap-2 rounded-2xl bg-surface-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[0.62rem] font-bold uppercase tracking-wider text-faint">
                {new Date(n.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{n.text}</p>
            </div>
            <button
              type="button"
              onClick={() => removeHabitNote(habit.id, n.id)}
              aria-label="Delete note"
              className="mt-0.5 text-faint"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
