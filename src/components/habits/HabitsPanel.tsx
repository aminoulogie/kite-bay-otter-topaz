import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { MonthMatrix, YearlyOverview } from "@/components/HabitHeatmap";
import { MoneySheet } from "@/components/money/money-ui";
import { AutoSuggest, NewHabitBody, needFor } from "@/components/views/HabitsView";
import { DotGrid, HabitCheck, HabitIcon, HabitWork } from "@/components/habits/HabitBits";
import { HabitDetail } from "@/components/habits/HabitDetail";
import { describeAuto } from "@/lib/habit-auto";
import { KEEP_AT, coefOf, habitConsistency, habitDayScore, habitStreak } from "@/lib/habit-score";
import { currentStreak, recentWeeks } from "@/lib/habit-stats";
import { tapLight } from "@/lib/haptics";
import { getLocalDateKey } from "@/lib/soma";
import { useSwipeToClose } from "@/lib/use-edge-swipe";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Habit } from "@/lib/types";

type View = "list" | "matrix" | "year";
const VIEWS: { id: View; label: string }[] = [
  { id: "list", label: "Habits" },
  { id: "matrix", label: "Month" },
  { id: "year", label: "Year" },
];

/**
 * Habits, as a panel swiped in from the left edge rather than a tab at the
 * far end of the dock: the thing ticked most often is one thumb-swipe away
 * from every screen.
 */
export function HabitsPanel() {
  const open = useSoma((s) => s.habitsOpen);
  const setOpen = useSoma((s) => s.setHabitsOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const panelRef = useSwipeToClose(close, "left", open);
  // Built on first open, then kept: reopening should be instant and land
  // where you left it.
  const [mounted, setMounted] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // A sheet open on top takes its own Escape.
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return createPortal(
    <>
      <div
        className={cn(
          "fixed inset-0 z-[52] bg-black/60 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={close}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className={cn(
          "fixed inset-y-0 left-0 z-[53] flex w-[94%] max-w-md flex-col overflow-hidden border-r border-border-strong bg-bg shadow-[24px_0_60px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Habits"
        aria-hidden={!open}
        inert={!open}
      >
        {mounted && <PanelBody onClose={close} onOpen={setDetailId} />}
        <div
          className={cn(
            "absolute inset-0 flex flex-col bg-bg transition-transform duration-200 ease-out",
            detailId ? "translate-x-0" : "pointer-events-none translate-x-full",
          )}
          inert={!detailId}
        >
          {detailId && <HabitDetail id={detailId} onBack={() => setDetailId(null)} />}
        </div>
      </aside>
    </>,
    document.body,
  );
}

function PanelBody({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const habits = useSoma((s) => s.habits);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const activeDate = useSoma((s) => s.activeDate);
  const today = getLocalDateKey(new Date());
  const [view, setView] = useState<View>("list");
  const [adding, setAdding] = useState(false);

  const day = useMemo(() => habitDayScore(habits, activeDate), [habits, activeDate]);
  const streak = useMemo(() => habitStreak(habits, today), [habits, today]);
  const consistency = useMemo(() => habitConsistency(habits, today), [habits, today]);
  const kept = day.score != null && day.score >= KEEP_AT;
  const doneCount = habits.filter((h) => h.history[activeDate]).length;
  const cols = useMemo(() => recentWeeks(today, 18), [today]);

  return (
    <>
      <div className="px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[1.7rem] font-extrabold leading-tight tracking-tight">Habits</h2>
            <p className="text-xs font-semibold text-muted">
              {activeDate === today ? "Today" : activeDate} · {doneCount}/{habits.length} done
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="New habit"
            className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink active:scale-95"
          >
            <Plus className="size-5" strokeWidth={2.6} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close habits"
            className="grid size-10 place-items-center rounded-full border border-border bg-surface-2 text-muted active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Tile
            label={activeDate === today ? "Today" : "That day"}
            value={day.score != null ? `${day.score}%` : "–"}
            tone={day.score == null ? undefined : kept ? "good" : "warn"}
          />
          <Tile label="Streak" value={`${streak}d`} sub={`days ≥ ${KEEP_AT}%`} />
          <Tile label="30 days" value={consistency != null ? `${consistency}%` : "–"} sub="average" />
        </div>
        {day.score != null && !kept && activeDate === today && (
          <p className="mt-2 text-[0.7rem] text-muted">To keep the streak: {needFor(day)}</p>
        )}

        <div className="mt-3 flex gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setView(v.id);
                tapLight();
              }}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
                view === v.id ? "bg-fg text-bg" : "bg-surface-2 text-muted",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="soma-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {view === "list" && (
          <>
            <AutoSuggest />
            {habits.map((h) => (
              <HabitCard key={h.id} habit={h} cols={cols} today={today} onOpen={() => onOpen(h.id)} />
            ))}
          </>
        )}

        {view === "matrix" &&
          habits.map((h) => (
            <div key={h.id} className="rounded-3xl border border-border bg-surface p-4">
              <button type="button" onClick={() => onOpen(h.id)} className="mb-3 flex items-center gap-2.5 text-left">
                <HabitIcon habit={h} />
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-extrabold">{h.name}</span>
                  <span className="block text-[0.7rem] text-faint">Last 4 weeks · only today can change</span>
                </span>
              </button>
              <MonthMatrix habit={h} onToggle={(d) => toggleHabit(h.id, d)} />
            </div>
          ))}

        {view === "year" && <YearlyOverview habits={habits} />}

        {habits.length === 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full rounded-3xl border border-dashed border-border-strong py-10 text-center text-sm font-bold text-muted"
          >
            No habits yet — add your first
          </button>
        )}
      </div>

      {adding &&
        createPortal(
          <MoneySheet title="New habit" onClose={() => setAdding(false)}>
            <NewHabitBody onAdded={() => setAdding(false)} />
          </MoneySheet>,
          document.body,
        )}
    </>
  );
}

function HabitCard({
  habit: h, cols, today, onOpen,
}: {
  habit: Habit;
  cols: (string | null)[][];
  today: string;
  onOpen: () => void;
}) {
  const streak = currentStreak(h, today);
  return (
    <div className="rounded-3xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <HabitIcon habit={h} />
          <span className="min-w-0">
            <span className="block truncate font-display text-[0.95rem] font-extrabold">{h.name}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <span>
                {streak} day streak
              </span>
              <span className="text-faint">·</span>
              <span className="tabular text-faint">×{coefOf(h)}</span>
              {h.auto && <span className="truncate text-accent-text">⚡ {describeAuto(h.auto)}</span>}
            </span>
          </span>
        </button>
        <HabitCheck habit={h} />
      </div>
      <HabitWork habit={h} />
      <button type="button" onClick={onOpen} className="mt-3 block w-full" aria-label={`Open ${h.name}`}>
        <DotGrid habit={h} cols={cols} today={today} />
      </button>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-2">
      <div className="text-[0.58rem] font-bold uppercase tracking-wider text-faint">{label}</div>
      <div
        className={cn(
          "font-display text-lg font-extrabold tabular",
          tone === "good" && "text-accent-text",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[0.6rem] text-faint">{sub}</div>}
    </div>
  );
}
