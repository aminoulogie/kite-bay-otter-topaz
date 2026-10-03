import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarCheck, CalendarDays, Camera, ChevronLeft, ChevronRight, Flame, Percent, Plus, SlidersHorizontal,
  Trash2, Trophy, X,
} from "lucide-react";
import { toast } from "sonner";
import { MonthStrip } from "@/components/HabitHeatmap";
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

const ROW_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
const CELL = 11;

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
      <div className="flex items-center gap-1 px-2 pb-1 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} className="flex items-center gap-0.5 rounded-full px-2 py-2 text-sm font-bold text-accent-text">
          <ChevronLeft className="size-5" /> Habits
        </button>
        <div className="flex-1" />
        <IconBtn label="Take a photo" onClick={() => void captureNow()} disabled={busy}>
          <Camera className="size-4" />
        </IconBtn>
        <IconBtn label="Photo calendar" onClick={() => setPhotos(true)}>
          <CalendarDays className="size-4" />
        </IconBtn>
        <IconBtn label="Set up" onClick={() => setSetup(true)}>
          <SlidersHorizontal className="size-4" />
        </IconBtn>
        <IconBtn label={`Delete ${h.name}`} onClick={remove}>
          <Trash2 className="size-4 text-danger" />
        </IconBtn>
      </div>

      <div className="soma-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        <div className="flex items-center gap-4 pt-1">
          <HabitIcon habit={h} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight">{h.name}</h2>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{sub}</p>
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

        <div className="grid grid-cols-2 gap-2">
          <StatTile icon={Flame} color="#ff9f0a" value={currentStreak(h, today)} label="Day streak" />
          <StatTile icon={Trophy} color="#ffd60a" value={longestStreak(h)} label="Longest" />
          <StatTile icon={Percent} color="#30d158" value={rate == null ? "–" : `${rate}%`} label="Completion" />
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

function IconBtn({
  label, onClick, disabled, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full border border-border bg-surface-2 text-muted active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
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
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
      >
        <Icon className="size-[1.1rem]" strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-xl font-extrabold leading-tight tabular">{value}</span>
        <span className="block text-[0.68rem] font-semibold text-muted">{label}</span>
      </span>
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
  const scroller = useRef<HTMLDivElement>(null);
  const doneInYear = Object.keys(habit.history).filter((d) => habit.history[d] && d.startsWith(`${year}-`)).length;

  // This year opens on the current weeks, at the right-hand end.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (year !== thisYear) {
      el.scrollLeft = 0;
      return;
    }
    // Today a little in from the right edge, with the weeks before it in view.
    const col = cols.findIndex((c) => c.includes(today));
    el.scrollLeft = Math.max(0, (col + 3) * (CELL + 3) - el.clientWidth);
  }, [year, thisYear, cols, today]);

  return (
    <Section
      title="Heatmap"
      hint={`${doneInYear} days`}
      right={
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={year <= firstYear}
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
            className="grid size-7 place-items-center rounded-full bg-surface-2 text-muted disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="w-10 text-center text-xs font-extrabold tabular">{year}</span>
          <button
            type="button"
            disabled={year >= thisYear}
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
            className="grid size-7 place-items-center rounded-full bg-surface-2 text-muted disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      }
    >
      <div className="flex gap-1.5">
        <div className="grid shrink-0 gap-[3px] pt-[18px]" style={{ gridTemplateRows: `repeat(7, ${CELL}px)` }}>
          {ROW_LABELS.map((l, i) => (
            <span key={i} className="text-[0.55rem] font-semibold leading-[11px] text-faint">
              {l}
            </span>
          ))}
        </div>
        <div ref={scroller} data-no-swipe-close className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative h-[15px]" style={{ width: cols.length * (CELL + 3) }}>
            {months.map((m) => (
              <span
                key={m.label}
                className="absolute top-0 text-[0.58rem] font-semibold text-faint"
                style={{ left: m.col * (CELL + 3) }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="mt-[3px]">
            <DotGrid habit={habit} cols={cols} today={today} cell={CELL} />
          </div>
        </div>
      </div>
    </Section>
  );
}

const MODES: { id: FrequencyMode; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function Frequency({ habit, today }: { habit: Habit; today: string }) {
  const [mode, setMode] = useState<FrequencyMode>("monthly");
  const year = Number(today.slice(0, 4));
  const bars = useMemo(() => frequency(habit, mode, year, today), [habit, mode, year, today]);
  const current = mode === "monthly" ? Number(today.slice(5, 7)) - 1 : bars.length - 1;
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked != null && picked < bars.length ? picked : current;
  const bar = bars[sel];

  return (
    <Section title="Frequency">
      <div className="mb-3 grid grid-cols-3 rounded-full bg-surface-2 p-0.5">
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
              "rounded-full py-1.5 text-xs font-bold transition-colors",
              mode === m.id ? "bg-surface-3 text-fg shadow-sm" : "text-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {bar && (
        <div className="mb-2 flex items-baseline gap-1.5">
          <span className="font-display text-2xl font-extrabold tabular">{bar.value}</span>
          <span className="text-xs text-muted">
            of {bar.max} days · {mode === "weekly" ? `week of ${bar.label}` : mode === "monthly" ? monthName(sel, year) : bar.label}
          </span>
        </div>
      )}
      <div className="flex h-28 items-end gap-[3px] border-b border-border" data-no-swipe-close>
        {bars.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setPicked(i);
              tapLight();
            }}
            className="flex h-full min-w-0 flex-1 items-end"
            aria-label={`${b.label}: ${b.value} of ${b.max}`}
          >
            <span
              className="block w-full rounded-t-[4px] transition-opacity"
              style={{
                height: `${Math.max(b.value ? 4 : 2, (b.value / b.max) * 100)}%`,
                background: b.value ? habit.color : "var(--color-border)",
                opacity: i === sel ? 1 : 0.55,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {bars.map((b, i) => (
          <span
            key={i}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-[0.55rem] font-semibold",
              i === sel ? "text-fg" : "text-faint",
            )}
          >
            {mode === "weekly" && i % 3 !== 2 ? "" : b.label}
          </span>
        ))}
      </div>
    </Section>
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
