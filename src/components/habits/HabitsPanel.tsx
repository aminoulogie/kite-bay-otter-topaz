import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { MoneySheet } from "@/components/money/money-ui";
import { AutoSuggest, NewHabitBody, needFor } from "@/components/views/HabitsView";
import { DotGrid, HabitCheck, HabitIcon, HabitWork } from "@/components/habits/HabitBits";
import { HabitDetail } from "@/components/habits/HabitDetail";
import { KEEP_AT, habitConsistency, habitDayScore, habitStreak } from "@/lib/habit-score";
import { habitCategory, type HabitCategory } from "@/lib/habit-colors";
import { currentStreak, recentWeeks } from "@/lib/habit-stats";
import { tapLight } from "@/lib/haptics";
import { getLocalDateKey } from "@/lib/soma";
import { useDragPanel } from "@/lib/use-drag-panel";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Habit } from "@/lib/types";

/**
 * Habits, as a panel swiped in from the left edge rather than a tab at the
 * far end of the dock: the thing ticked most often is one thumb-swipe away
 * from every screen.
 */
export function HabitsPanel() {
  const open = useSoma((s) => s.habitsOpen);
  const setOpen = useSoma((s) => s.setHabitsOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  // Follows the finger both ways: in from the left edge, back out by dragging.
  const { panelRef, backdropRef } = useDragPanel({ side: "left", open, setOpen });
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
        ref={backdropRef}
        className={cn(
          "fixed inset-0 z-[52] bg-black/60 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={close}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className={cn(
          "fixed inset-y-0 left-0 z-[53] flex w-[94%] max-w-md flex-col overflow-hidden border-r border-border-strong bg-bg shadow-[24px_0_60px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
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
  const activeDate = useSoma((s) => s.activeDate);
  const today = getLocalDateKey(new Date());
  const [filter, setFilter] = useState<HabitCategory | "All">("All");
  const [adding, setAdding] = useState(false);

  const day = useMemo(() => habitDayScore(habits, activeDate), [habits, activeDate]);
  const streak = useMemo(() => habitStreak(habits, today), [habits, today]);
  const consistency = useMemo(() => habitConsistency(habits, today), [habits, today]);
  const kept = day.score != null && day.score >= KEEP_AT;
  const cols = useMemo(() => recentWeeks(today, 26), [today]);

  // Only the categories you actually have, so the row never offers an empty one.
  const cats = useMemo(() => {
    const present = new Set(habits.map((h) => habitCategory(h.name)));
    return (["Health", "Mind", "Productivity", "Other"] as HabitCategory[]).filter((c) => present.has(c));
  }, [habits]);
  const shown = filter === "All" ? habits : habits.filter((h) => habitCategory(h.name) === filter);

  return (
    <>
      <div className="px-5 pb-3 pt-[max(18px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate font-display text-[2rem] font-extrabold leading-tight tracking-tight">
            My Habits
          </h2>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="New habit"
            className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_6px_20px_color-mix(in_srgb,var(--color-accent)_40%,transparent)] active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.6} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close habits"
            className="grid size-9 place-items-center rounded-full text-muted active:bg-surface-2"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* The score, the streak and the month in one quiet line. */}
        <p className="mt-1 text-xs font-semibold text-muted">
          <span className={cn(day.score != null && (kept ? "text-accent-text" : "text-warn"))}>
            {activeDate === today ? "Today" : activeDate} {day.score != null ? `${day.score}%` : "–"}
          </span>
          {" · "}
          {streak}d streak · 30d {consistency != null ? `${consistency}%` : "–"}
        </p>
        {day.score != null && !kept && activeDate === today && (
          <p className="mt-0.5 text-[0.7rem] text-faint">To keep the streak: {needFor(day)}</p>
        )}

        {cats.length > 1 && (
          <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-no-swipe-close>
            {(["All", ...cats] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setFilter(c);
                  tapLight();
                }}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  filter === c ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="soma-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {filter === "All" && <AutoSuggest />}
        {shown.map((h) => (
          <HabitCard key={h.id} habit={h} cols={cols} today={today} onOpen={() => onOpen(h.id)} />
        ))}

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
    <div
      className="rounded-[1.6rem] border border-white/[0.06] p-4"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${h.color} 7%, var(--color-surface)), var(--color-surface))`,
      }}
    >
      <div className="flex items-center gap-3.5">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
          <HabitIcon habit={h} />
          <span className="min-w-0">
            <span className="block truncate font-display text-[1.05rem] font-bold">{h.name}</span>
            <span className="block truncate text-[0.82rem] text-muted">
              {streak} day streak{h.auto ? " · ⚡ auto" : ""}
            </span>
          </span>
        </button>
        <HabitCheck habit={h} />
      </div>
      <HabitWork habit={h} />
      <button type="button" onClick={onOpen} className="mt-3.5 block w-full" aria-label={`Open ${h.name}`}>
        <DotGrid habit={h} cols={cols} today={today} />
      </button>
    </div>
  );
}
