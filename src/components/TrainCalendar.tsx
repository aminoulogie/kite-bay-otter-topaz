import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { getPhoto } from "@/lib/habit-photos";
import { scoreDay, type DayScore } from "@/lib/day-score";
import {
  addDays, isCovered, isoDate, loadPeriods, membershipStatus, periodFromDuration,
  periodFromEnd, savePeriods, type MembershipPeriod,
} from "@/lib/membership";
import { SomaIntelligenceEngine } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { HistorySession, NutritionDay } from "@/lib/types";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

/** The habit progress photos are filed under — the same one Habits → Train uses. */
const TRAIN_HABIT_ID = "gym-movement";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * "Legs B (Posterior Chain & Glute Bias)" will not fit in a calendar cell, so
 * it is reduced to the word that identifies the day.
 */
function shortSplit(split: string): string {
  const s = split.toLowerCase();
  if (s.includes("rest")) return "REST";
  if (s.includes("push")) return "PUSH";
  if (s.includes("pull")) return "PULL";
  if (s.includes("leg")) return "LEGS";
  if (s.includes("upper")) return "UPPER";
  if (s.includes("lower")) return "LOWER";
  if (s.includes("full")) return "FULL";
  return split.split(/[\s(]/)[0]!.slice(0, 5).toUpperCase();
}

function monthMatrix(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  // Monday-first, matching the rest of the app.
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(isoDate(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function TrainCalendar({ onClose }: { onClose: () => void }) {
  const sheetRef = useSheet(onClose);
  const history = useSoma((s) => s.history);
  const habits = useSoma((s) => s.habits);
  const nutrition = useSoma((s) => s.nutrition);
  const settings = useSoma((s) => s.settings);

  const today = isoDate(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [periods, setPeriods] = useState<MembershipPeriod[]>(() => loadPeriods());
  const [renewing, setRenewing] = useState(false);

  const status = useMemo(() => membershipStatus(periods, today), [periods, today]);

  const sessionsByDate = useMemo(() => {
    const m = new Map<string, HistorySession>();
    for (const s of Object.values(history || {})) {
      if (!s?.timestamp) continue;
      m.set(isoDate(new Date(s.timestamp)), s);
    }
    return m;
  }, [history]);

  const trainHabit = habits.find((h) => h.id === TRAIN_HABIT_ID);
  const cells = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor]);

  /**
   * Each day's completion score, for the number shown in its square.
   *
   * Computed for the whole month at once and memoised: scoring inside the cell
   * render would rebuild every day's score on every re-render of the grid,
   * including the ones a month navigation is about to discard.
   *
   * Future days are skipped — a day that has not happened cannot be scored,
   * and showing 0 for tomorrow would read as a failure rather than as nothing.
   */
  const scores = useMemo(() => {
    const out = new Map<string, number>();
    for (const date of cells) {
      if (!date || date > today) continue;
      const session = sessionsByDate.get(date) ?? null;
      const day = nutrition[date];
      const logged = (day?.items?.length ?? 0) > 0;
      const totals = (day?.items ?? []).reduce(
        (t, i) => ({ cals: t.cals + (i.cals || 0), p: t.p + (i.p || 0) }),
        { cals: 0, p: 0 },
      );
      const s = scoreDay({
        session,
        previous: findPrevious(sessionsByDate, date),
        protein: logged && day?.goals?.protein ? { grams: totals.p, target: day.goals.protein } : null,
        calories: logged && day?.goals?.cals ? { kcal: totals.cals, target: day.goals.cals } : null,
        sleepHours: day?.sleep?.hours ?? null,
        creatineG: day?.creatine ?? null,
      });
      // Nothing tracked at all is not a zero-scoring day, it is an unscored one.
      if (s.tracked > 0) out.set(date, s.score);
    }
    return out;
  }, [cells, sessionsByDate, nutrition, today]);

  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // Horizontal swipe changes month. Only acted on when the gesture is clearly
  // horizontal and clearly a swipe, so a vertical scroll of the page never
  // flips the month by accident.
  const touch = useRef<{ x: number; y: number } | null>(null);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    // soma-view animates it in; the calendar appeared instantly before while
    // every other overlay slid, which read as a different, older screen.
    <div className="soma-view fixed inset-0 z-[57] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between border-b border-border px-4 pb-3">
        <div>
          <div className="font-display text-base font-extrabold">{monthLabel}</div>
          <div className="text-[0.7rem] text-muted">
            {status.period
              ? status.expired
                ? `Membership expired ${Math.abs(status.daysLeft!)} days ago`
                : `${status.daysLeft} days of membership left`
              : "No membership logged"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="p-2 text-muted">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="p-2 text-muted">
            <ChevronRight className="size-5" />
          </button>
          <button type="button" aria-label="Close calendar" onClick={onClose} className="p-2 text-muted">
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* justify-center: the month sits in the middle of the screen rather than
          pinned under the header with dead space below it. */}
      <div
        className="flex flex-1 flex-col justify-center overflow-y-auto px-3 pb-6 pt-3"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          const t = e.changedTouches[0];
          touch.current = null;
          if (!start || !t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          // Must be a decisive horizontal move, and more horizontal than
          // vertical, or scrolling the month would change it.
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          shift(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1 text-center text-[0.6rem] font-bold uppercase text-faint">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const session = sessionsByDate.get(date);
            const trained = !!session || !!trainHabit?.history?.[date];
            const future = date > today;
            const covered = isCovered(periods, date);
            const isEnd = status.period?.end === date;
            const score = scores.get(date);
            // What was trained, or what is scheduled for a day still to come —
            // a grid of bare numbers says nothing about the week ahead.
            // Every day is labelled, not only trained and future ones: a past
            // day with no session still had a split scheduled, and leaving it
            // blank hides whether it was a rest day or a missed one.
            const label = session
              ? shortSplit(session.split)
              : shortSplit(
                  SomaIntelligenceEngine.getProgramProjectedDay(
                    new Date(date + "T12:00:00"),
                    settings.scheduleOverrides,
                  ).split,
                );

            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-[0.75rem] font-bold transition-colors",
                  date === today ? "border-accent" : "border-transparent",
                  covered ? "bg-surface-2" : "bg-surface",
                  future ? "text-faint" : "text-fg",
                )}
              >
                <span className="leading-none">{Number(date.slice(8, 10))}</span>
                {/* Trained, missed, and still to come are three different
                    states; the label carries the split, the dot carries which
                    of the three this is. */}
                <span
                  className={cn(
                    "mt-0.5 size-1 rounded-full",
                    trained
                      ? "bg-emerald-500"
                      : future
                        ? "bg-transparent"
                        : "border border-dashed border-faint/50 bg-transparent",
                  )}
                />
                {score != null && (
                  <span
                    className={cn(
                      "absolute right-1 top-1 text-[0.5rem] font-extrabold tabular-nums",
                      score >= 80
                        ? "text-emerald-400"
                        : score >= 55
                          ? "text-warn"
                          : "text-orange-400/80",
                    )}
                  >
                    {score}
                  </span>
                )}
                {label && !isEnd && (
                  <span
                    className={cn(
                      "mt-0.5 max-w-full truncate rounded px-1 text-[0.45rem] font-extrabold uppercase tracking-wide",
                      trained
                        ? "bg-emerald-500/20 text-emerald-300"
                        : label === "REST"
                          ? "bg-surface-3 text-faint"
                          : "bg-surface-3 text-muted",
                    )}
                  >
                    {label}
                  </span>
                )}
                {isEnd && (
                  <span className="mt-0.5 rounded bg-amber-500/20 px-1 text-[0.45rem] font-extrabold text-amber-400">
                    EXPIRY
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[0.65rem] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" /> trained
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full border border-dashed border-faint/50" /> not trained
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded bg-surface-2" /> membership active
          </span>
        </div>

        <button
          type="button"
          onClick={() => setRenewing(true)}
          className="mt-4 w-full rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-accent-text"
        >
          Log a renewal
        </button>
      </div>

      {renewing && (
        <RenewalSheet
          today={today}
          onClose={() => setRenewing(false)}
          onSave={(p) => {
            const next = [...periods, p];
            setPeriods(next);
            savePeriods(next);
            setRenewing(false);
          }}
        />
      )}

      {selected && (
        <DayCard
          date={selected}
          session={sessionsByDate.get(selected) ?? null}
          previous={findPrevious(sessionsByDate, selected)}
          nutrition={nutrition}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function findPrevious(map: Map<string, HistorySession>, date: string): HistorySession | null {
  const cur = map.get(date);
  if (!cur) return null;
  const earlier = [...map.entries()]
    .filter(([d, s]) => d < date && s.split === cur.split)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return earlier[0]?.[1] ?? null;
}

// ------------------------------------------------------------------- day card

function DayCard({
  date, session, previous, nutrition, onClose,
}: {
  date: string;
  session: HistorySession | null;
  previous: HistorySession | null;
  nutrition: Record<string, NutritionDay>;
  onClose: () => void;
}) {
  const sheetRef = useSheet(onClose);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    // Minted in the effect and revoked in its cleanup. Revoking during render
    // tears down a URL the browser has not finished fetching and the image
    // silently renders blank.
    void getPhoto(TRAIN_HABIT_ID, date).then((row) => {
      if (cancelled || !row?.display) return;
      url = URL.createObjectURL(row.display);
      setPhoto(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [date]);

  const day = nutrition[date];
  const score: DayScore = useMemo(() => {
    // Food only counts as logged if something was actually eaten that day; an
    // empty day is "not logged", not zero calories.
    const logged = (day?.items?.length ?? 0) > 0;
    const totals = (day?.items ?? []).reduce(
      (t, i) => ({ cals: t.cals + (i.cals || 0), p: t.p + (i.p || 0) }),
      { cals: 0, p: 0 },
    );
    return scoreDay({
      session,
      previous,
      protein: logged && day?.goals?.protein ? { grams: totals.p, target: day.goals.protein } : null,
      calories: logged && day?.goals?.cals ? { kcal: totals.cals, target: day.goals.cals } : null,
      // Sleep is not tracked anywhere in the app yet, so it stays unassessed
      // rather than being invented as a zero.
      sleepHours: null,
      creatineG: day?.creatine ?? null,
    });
  }, [session, previous, day]);

  return (
    <div className="fixed inset-0 z-[59] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="soma-sheet max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />

        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-display text-sm font-extrabold">
            {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long", day: "numeric", month: "long",
            })}
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-extrabold tabular-nums">{score.score}</div>
            {/* "89 of 85" reads as over 100%. The 89 is a percentage of what
                was tracked, so say what the denominator actually means. */}
            <div className="text-[0.6rem] text-faint">
              {score.tracked === 100 ? "everything tracked" : `${score.tracked} of 100 pts tracked`}
            </div>
          </div>
        </div>

        {photo && (
          <img
            src={photo}
            alt={`Progress photo from ${date}`}
            className="mb-3 max-h-56 w-full rounded-2xl object-cover"
          />
        )}

        {session ? (
          <div className="mb-3 rounded-2xl border border-border bg-surface-2 p-3">
            <div className="text-[0.7rem] font-bold uppercase tracking-wide text-accent-text">
              {session.split}
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {session.exercises.map((e) => {
                const done = (e.sets ?? []).filter((s) => s.done).length;
                return (
                  <li key={e.name} className="flex justify-between gap-2 text-[0.72rem]">
                    <span className="min-w-0 truncate">{e.name}</span>
                    <span className="shrink-0 tabular-nums text-faint">{done} sets</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="mb-3 rounded-2xl border border-border bg-surface-2 p-3 text-[0.72rem] text-muted">
            No workout logged.
          </p>
        )}

        <div className="space-y-1">
          {score.lines.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="text-[0.72rem] font-bold">{l.label}</div>
                <div className="text-[0.62rem] text-faint">{l.detail}</div>
              </div>
              <div
                className={cn(
                  "shrink-0 text-[0.72rem] font-extrabold tabular-nums",
                  l.earned === null ? "text-faint" : l.earned >= l.possible * 0.8 ? "text-emerald-400" : "text-muted",
                )}
              >
                {l.earned === null ? "—" : `${l.earned}/${l.possible}`}
              </div>
            </div>
          ))}
        </div>

        {score.untracked.length > 0 && (
          <p className="mt-2 text-[0.65rem] leading-snug text-faint">
            Not logged: {score.untracked.join(", ")}. These are left out of the score rather
            than counted as zero.
          </p>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- renewal sheet

function RenewalSheet({
  today, onClose, onSave,
}: {
  today: string;
  onClose: () => void;
  onSave: (p: MembershipPeriod) => void;
}) {
  const sheetRef = useSheet(onClose);
  const [mode, setMode] = useState<"duration" | "end">("duration");
  const [start, setStart] = useState(today);
  const [days, setDays] = useState(30);
  const [end, setEnd] = useState(addDays(today, 29));

  return (
    <div className="fixed inset-0 z-[59] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />
        <div className="mb-3 font-display text-sm font-extrabold">Log a renewal</div>

        <div className="mb-3 flex gap-1">
          {(["duration", "end"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "h-9 flex-1 rounded-lg text-[0.72rem] font-bold transition-colors",
                mode === m ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
              )}
            >
              {m === "duration" ? "N days from…" : "Ends on…"}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-[0.65rem] font-bold uppercase tracking-wide text-faint">
          Starts
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 font-semibold text-fg"
          />
        </label>

        {mode === "duration" ? (
          <label className="mb-3 block text-[0.65rem] font-bold uppercase tracking-wide text-faint">
            Days
            <input
              type="number"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 font-semibold text-fg"
            />
            <span className="mt-1 block normal-case tracking-normal text-faint">
              Ends {periodFromDuration(start, days).end}
            </span>
          </label>
        ) : (
          <label className="mb-3 block text-[0.65rem] font-bold uppercase tracking-wide text-faint">
            Ends
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 font-semibold text-fg"
            />
          </label>
        )}

        <button
          type="button"
          onClick={() =>
            onSave(mode === "duration" ? periodFromDuration(start, days) : periodFromEnd(start, end))
          }
          className="mb-2 w-full rounded-xl bg-accent py-3 text-sm font-extrabold text-accent-ink"
        >
          Save renewal
        </button>
      </div>
    </div>
  );
}
