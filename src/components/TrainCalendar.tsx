import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { getPhoto } from "@/lib/habit-photos";
import { scoreDay, type DayScore } from "@/lib/day-score";
import { bodyweightOn, buildDayInputs, previousSameSplit } from "@/lib/day-inputs";
import { isRestSplit } from "@/lib/programs";
import {
  addDays, isCovered, isoDate, loadPeriods, membershipStatus, periodFromDuration,
  periodFromEnd, savePeriods, type MembershipPeriod,
} from "@/lib/membership";
import { SomaIntelligenceEngine } from "@/lib/soma";
import { useSideStoreRevision } from "@/lib/use-side-stores";
import {
  DOMAIN_DOT, DOMAIN_LABEL, buildDayMarks, domainsOn, summariseDay,
  type DayMarksInput,
} from "@/lib/day-marks";
import { useSwipeToClose } from "@/lib/use-edge-swipe";
import { useActiveProgram, useSoma } from "@/lib/store";
import type { HistorySession, NutritionDay } from "@/lib/types";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { RingSet } from "@/components/RingSet";
import { RING_DEFS, latestWeight, ringValues, share } from "@/lib/rings";

/** The habit progress photos are filed under — the same one Habits → Train uses. */
const TRAIN_HABIT_ID = "gym-movement";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

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

export function TrainCalendar({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Passing `open`: this sheet stays mounted so it can slide both ways, so it
  // must only hold the scroll lock while it is actually showing.
  const sheetRef = useSheet(onClose, open);
  // Swiping right sends it back off the right edge it came in from. The month
  // grid opts out below, because a horizontal swipe there already means
  // "previous / next month".
  const swipeRef = useSwipeToClose(onClose, "right", open);
  const history = useSoma((s) => s.history);
  const habits = useSoma((s) => s.habits);
  const nutrition = useSoma((s) => s.nutrition);
  const ledger = useSoma((s) => s.ledger);
  const mind = useSoma((s) => s.mind);
  const hunger = useSoma((s) => s.hunger);
  const settings = useSoma((s) => s.settings);
  const program = useActiveProgram();
  const weight = useMemo(() => latestWeight(nutrition), [nutrition]);
  const ringsOn = (d: string) => ringValues(nutrition[d], history[d], weight, settings.customGoals ?? {});

  const today = isoDate(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  /**
   * The day shown in the panel below the month. Always set, starting on today:
   * the card is docked open rather than being a popup you have to summon, so
   * opening the calendar already answers "how did today go".
   */
  const [selected, setSelected] = useState<string>(today);
  const [periods, setPeriods] = useState<MembershipPeriod[]>(() => loadPeriods());
  const [renewing, setRenewing] = useState(false);

  // Membership lives in its own localStorage key, so a restore rewrites it
  // from underneath this state. Re-read rather than showing the old bands.
  const sideRev = useSideStoreRevision();
  useEffect(() => {
    if (sideRev) setPeriods(loadPeriods());
  }, [sideRev]);

  const status = useMemo(() => membershipStatus(periods, today), [periods, today]);

  /**
   * Sessions by the date they are FILED under, not by their timestamp.
   *
   * History is already keyed by day. Re-deriving the key from `timestamp`
   * moved every backfilled session to the day it was typed in rather than the
   * day it was trained, so filling in a missed Tuesday made it appear on the
   * Saturday you filled it in — and a session moved to another date snapped
   * straight back.
   */
  const sessionsByDate = useMemo(() => {
    const m = new Map<string, HistorySession>();
    for (const [date, s] of Object.entries(history || {})) {
      if (!s) continue;
      m.set(date, s);
    }
    return m;
  }, [history]);

  const cells = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor]);

  /** Everything the day card under the grid reads for the picked day. */
  const marksInput = { history, nutrition, ledger, mind, habits };

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
      const projected = SomaIntelligenceEngine.getProgramProjectedDay(
        new Date(date + "T12:00:00"),
        settings.scheduleOverrides,
        program,
      );
      const s = scoreDay(
        buildDayInputs({
          date,
          session,
          previous: previousSameSplit(history, date),
          nutrition,
          // A rest day with no session is not a missed workout. Without this
          // every programmed rest day scored as a failure to train.
          isRestDay: !session && (projected.isRest || isRestSplit(projected.split)),
          bodyweightKg: bodyweightOn(nutrition, date),
        hunger,
        phase: settings.phase,
        }),
      );
      // Nothing tracked at all is not a zero-scoring day, it is an unscored one.
      if (s.tracked > 0) out.set(date, s.score);
    }
    return out;
  }, [cells, sessionsByDate, nutrition, today, history, settings.scheduleOverrides, program]);

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
    <>
      {/* Mounted always and translated, rather than conditionally rendered.
          A conditional mount can only animate IN — it vanishes on close — and
          the history drawer already slides both ways, so the two gestures felt
          like different apps. */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[56] bg-black/60 transition-opacity duration-150",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Training calendar"
        tabIndex={-1}
        // Hidden from assistive tech while parked off-screen: a translated
        // panel is still in the accessibility tree, so without this the whole
        // calendar was readable by VoiceOver while the user was on Train.
        aria-hidden={!open}
        className={cn(
          "glass-panel fixed inset-y-0 right-0 z-[57] flex w-full flex-col border-l border-border-strong pt-[max(12px,env(safe-area-inset-top))]",
          "transition-transform duration-150 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
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

      {/* One scrolling column: month first, then the day widget under it.
          min-h-0 is what lets this shrink inside the flex column — without it a
          flex child refuses to go below its content height and the column
          overflows the screen instead of scrolling inside it. */}
      <div
        ref={swipeRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
      >
        {/* The month-changing swipe lives on the grid alone, and the grid opts
            out of swipe-to-close. Both gestures are horizontal, so sharing an
            area meant one of them had to lose; scoping each to where it makes
            sense lets both work. */}
        <div
          data-no-swipe-close
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

        {/* Keyed on opening and on the month, so the rings fill every time
            the calendar is opened or turned, not once at app start while it
            waits off-screen. */}
        <div key={`${open}-${JSON.stringify(cursor)}`} className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const future = date > today;
            const covered = isCovered(periods, date);
            const isEnd = status.period?.end === date;
            const score = scores.get(date);
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                aria-pressed={date === selected}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-xl border py-1.5 text-[0.7rem] font-bold transition-colors",
                  // Selection and "today" are different things and need to stay
                  // distinguishable: today keeps its outline, the day you are
                  // reading is filled. Without the fill, tapping around the
                  // month changed the widget below with nothing on the grid to
                  // say which day you had landed on.
                  date === selected
                    ? "border-accent bg-accent/20 text-fg"
                    : covered
                      ? "border-transparent bg-surface-2"
                      : "border-transparent bg-surface",
                  date === today && date !== selected && "border-accent",
                  future && date !== selected ? "text-faint" : "text-fg",
                )}
              >
                {/* The day as its rings, as the Fitness app's month does. What was
                    trained, the score and the rest are on the card under the
                    grid for whichever day is picked. */}
                <span className={cn("leading-none", date === today && "text-[#ff2d7a]")}>
                  {Number(date.slice(8, 10))}
                </span>
                <span className={cn("mt-1", future && "opacity-30")}>
                  <RingSet
                    rings={RING_DEFS.map((r) => ({ f: share(ringsOn(date)[r.id]), from: r.from, to: r.to }))}
                    px={38}
                    shadow={false}
                    delay={i * 12}
                  />
                </span>
                {isEnd && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-400" aria-label="Membership ends" />}
                {score != null && !isEnd && (
                  <span className="sr-only">score {score}</span>
                )}
              </button>
            );
          })}
        </div>

        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[0.65rem] text-muted">
          {RING_DEFS.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: r.from }} />
              {r.label.toLowerCase()}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-400" /> membership ends
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

        {/* In the same scrolling column as the month, not a second pane. Two
            panes each with their own scrollbar split a phone screen in half and
            leave both halves cramped; one column just continues downward. */}
        <DayCard
          date={selected}
          isToday={selected === today}
          session={sessionsByDate.get(selected) ?? null}
          previous={previousSameSplit(history, selected)}
          isRestDay={
            !sessionsByDate.get(selected) &&
            isRestSplit(
              SomaIntelligenceEngine.getProgramProjectedDay(
                new Date(selected + "T12:00:00"),
                settings.scheduleOverrides,
                program,
              ).split,
            )
          }
          nutrition={nutrition}
          onBackToToday={() => setSelected(today)}
          onMoved={(to) => setSelected(to)}
          onClosePanel={onClose}
        />

        {/* Below the training card rather than inside it: this is the rest of
            the day, and the training card is about training. */}
        <DayEverything date={selected} input={marksInput} />
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

      </div>
    </>
  );
}

// ------------------------------------------------------------------- day card

/**
 * The day panel docked under the month.
 *
 * It was a modal over the calendar, which meant the calendar was only ever
 * visible with no day open, and reading a day meant dismissing it to look at
 * another. Docked, both are on screen at once and tapping around the month
 * just changes what this shows.
 */
/**
 * Everything else that happened on the selected day.
 *
 * The calendar answered "did I train" and nothing else, so a day where you ate
 * well, stayed under budget and read for an hour but did not lift looked
 * identical to a day where nothing happened. The dots on the grid say which
 * domains have something; this says what.
 *
 * Zero and "not logged" are kept apart throughout. A day with no money entries
 * is not a day you spent nothing, and reporting it as 0 would be a claim the
 * app cannot make.
 */
function DayEverything({ date, input }: { date: string; input: DayMarksInput }) {
  const dayNotes = useSoma((s) => s.dayNotes);
  const setDayNote = useSoma((s) => s.setDayNote);
  const settings = useSoma((s) => s.settings);
  const [draft, setDraft] = useState<string | null>(null);

  const marks = useMemo(() => buildDayMarks(input), [input]);
  const present = domainsOn(marks, date);
  const summary = summariseDay(input, date);
  const currency = settings.currency || "DZD";
  const note = dayNotes[date] ?? "";

  const lines: string[] = [];
  if (summary.spend != null) lines.push(`Spent ${summary.spend.toLocaleString()} ${currency}`);
  if (summary.income != null) lines.push(`In ${summary.income.toLocaleString()} ${currency}`);
  if (summary.mindEntries) {
    lines.push(`${summary.mindEntries} mind entr${summary.mindEntries === 1 ? "y" : "ies"}`);
  }
  if (summary.habitsTotal) lines.push(`${summary.habitsDone}/${summary.habitsTotal} habits`);

  return (
    <Card className="mt-2">
      <CardTitle>The rest of the day</CardTitle>

      {present.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {present.map((d) => (
            <span
              key={d}
              className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[0.65rem] font-bold text-muted"
            >
              <span className={cn("size-1.5 rounded-full", DOMAIN_DOT[d])} />
              {DOMAIN_LABEL[d]}
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-xs text-faint">Nothing logged on this day.</p>
      )}

      {lines.length > 0 && (
        <div className="mb-2 space-y-0.5 text-[0.72rem] text-muted">
          {lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}

      <label className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
        Note
      </label>
      <input
        value={draft ?? note}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft != null) setDayNote(date, draft);
          setDraft(null);
        }}
        placeholder="Appointment, plan, or why the day went the way it did"
        className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none placeholder:text-faint focus:border-accent"
      />
    </Card>
  );
}

function DayCard({
  date, isToday, session, previous, isRestDay, nutrition, onBackToToday, onMoved, onClosePanel,
}: {
  date: string;
  isToday: boolean;
  session: HistorySession | null;
  previous: HistorySession | null;
  isRestDay: boolean;
  nutrition: Record<string, NutritionDay>;
  onBackToToday: () => void;
  onMoved: (to: string) => void;
  onClosePanel: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const renameSession = useSoma((s) => s.renameSession);
  // Read here as well as in the grid above. Both feed the SAME buildDayInputs,
  // which is the point: the card and the square disagreeing about one day is
  // the bug that file was written to end.
  const hunger = useSoma((s) => s.hunger);
  const settings = useSoma((s) => s.settings);
  const [renaming, setRenaming] = useState(false);
  const [splitDraft, setSplitDraft] = useState("");

  const commitRename = () => {
    const name = splitDraft.trim();
    setRenaming(false);
    if (!name || name === session?.split) return;
    renameSession(date, name);
    toast.success(`Renamed to ${name}`);
  };

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

  // The same inputs the square above is scored from — see lib/day-inputs.ts.
  // This used to build its own and pass sleepHours: null, so the card and the
  // square disagreed about the same day.
  const score: DayScore = useMemo(
    () =>
      scoreDay(
        buildDayInputs({
          date,
          session,
          previous,
          nutrition,
          isRestDay,
          bodyweightKg: bodyweightOn(nutrition, date),
          hunger,
          phase: settings.phase,
        }),
      ),
    [date, session, previous, nutrition, isRestDay, hunger, settings.phase],
  );

  return (
    // Docked, not fixed: it is part of the calendar column and takes at most
    // half the height, so the month above it always stays visible.
    <div
      className="mt-4 rounded-2xl border border-border bg-surface-2 p-3"
      aria-live="polite"
    >
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            {/* Short weekday and month: "Saturday, September 5" truncated to
                "Saturday, Septembe…" next to the score, losing the day number,
                which is the part that identifies which day this is. */}
            <div className="truncate font-display text-sm font-extrabold">
              {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "short", day: "numeric", month: "short",
              })}
            </div>
            {!isToday && (
              <button
                type="button"
                onClick={onBackToToday}
                className="text-[0.6rem] font-bold text-accent-text"
              >
                Back to today
              </button>
            )}
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
            {/* Tap to rename. The split is stamped from whatever was scheduled
                that day, which is wrong every time you train something else —
                and it was the one field with no way to correct it. */}
            {renaming ? (
              <div className="mb-1.5 flex gap-1.5">
                <input
                  autoFocus
                  value={splitDraft}
                  onChange={(e) => setSplitDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  aria-label="Session name"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-accent bg-surface px-2 text-[0.75rem] font-bold text-fg"
                />
                <button
                  type="button"
                  onClick={commitRename}
                  className="h-9 shrink-0 rounded-lg bg-accent px-3 text-[0.7rem] font-extrabold text-accent-ink"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSplitDraft(session.split);
                  setRenaming(true);
                }}
                className="mb-0.5 flex w-full items-center gap-1.5 text-left"
              >
                <span className="min-w-0 truncate text-[0.7rem] font-bold uppercase tracking-wide text-accent-text">
                  {session.split}
                </span>
                <Pencil className="size-3 shrink-0 text-faint" />
              </button>
            )}
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

        {session && (
          <DayActions date={date} session={session} onMoved={onMoved} onClosePanel={onClosePanel} />
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
  );
}

// -------------------------------------------------------------- day actions

/**
 * What you can do with a day that was actually trained.
 *
 * The calendar could only ever be read. A session filed on the wrong date had
 * to be re-entered set by set, a day worth repeating had to be rebuilt by hand,
 * and the exact list of exercises you had just done could not become a routine
 * even though the app was already holding it.
 *
 * Deliberately four small buttons under the session rather than a menu: these
 * are the things you reach for while looking at a day, and a menu would hide
 * all of them behind a tap that says nothing about what is inside.
 */
function DayActions({
  date, session, onMoved, onClosePanel,
}: {
  date: string;
  session: HistorySession;
  onMoved: (to: string) => void;
  onClosePanel: () => void;
}) {
  const moveSession = useSoma((s) => s.moveSession);
  const deleteSession = useSoma((s) => s.deleteSession);
  const routineFromSession = useSoma((s) => s.routineFromSession);
  const repeatSession = useSoma((s) => s.repeatSession);
  const setTab = useSoma((s) => s.setTab);

  const [naming, setNaming] = useState(false);
  const [routineName, setRoutineName] = useState(() => session.split);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState(date);

  return (
    <div className="mb-3 rounded-2xl border border-border bg-surface-2 p-2.5">
      <div className="mb-2 text-[0.6rem] font-bold uppercase tracking-wide text-faint">
        This session
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ActionButton
          label="Save as routine"
          hint="reuse these exercises"
          onClick={() => {
            setRoutineName(session.split);
            setNaming(true);
            setMoving(false);
          }}
        />
        <ActionButton
          label="Repeat today"
          hint="load it into Train"
          onClick={() => {
            if (!repeatSession(date)) {
              toast.error("Finish or clear the session in progress first.");
              return;
            }
            setTab("workout");
            onClosePanel();
            toast.success(`Loaded ${session.split} into today`);
          }}
        />
        <ActionButton
          label="Move to another day"
          hint="logged on the wrong date"
          onClick={() => {
            setTarget(date);
            setMoving(true);
            setNaming(false);
          }}
        />
        <ActionButton
          label="Delete session"
          danger
          hint="undo is offered for a few seconds"
          onClick={() => {
            if (!confirm(`Delete the ${session.split} session logged on ${date}?`)) return;
            // Captured before the delete, so undo restores the session itself
            // rather than whatever the store happens to hold afterwards.
            const removed = session;
            deleteSession(date);
            toast.success(`Deleted the session on ${date}`, {
              action: {
                label: "Undo",
                onClick: () => {
                  const ok = useSoma.getState().restoreSession(date, removed);
                  toast[ok ? "success" : "error"](
                    ok ? "Session restored" : "Something else has been logged on that day",
                  );
                },
              },
            });
          }}
        />
      </div>

      {naming && (
        <div className="mt-2 space-y-1.5">
          <input
            autoFocus
            value={routineName}
            onChange={(e) => setRoutineName(e.target.value)}
            placeholder="Name this routine"
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-[0.75rem] font-semibold text-fg"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setNaming(false)}
              className="h-9 flex-1 rounded-xl border border-border bg-surface text-[0.7rem] font-bold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const err = routineFromSession(date, routineName.trim());
                if (err) {
                  toast.error(err);
                  return;
                }
                setNaming(false);
                toast.success(`Saved "${routineName.trim()}" — it is now a routine you can load or schedule`);
              }}
              className="h-9 flex-[1.4] rounded-xl bg-accent text-[0.7rem] font-extrabold text-accent-ink"
            >
              Save routine
            </button>
          </div>
          <p className="text-[0.58rem] leading-snug text-faint">
            Saved routines appear under Load split on Train, and can be assigned to a
            weekday in Setup → Training programme.
          </p>
        </div>
      )}

      {moving && (
        <div className="mt-2 space-y-1.5">
          <input
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-[0.75rem] font-semibold text-fg"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMoving(false)}
              className="h-9 flex-1 rounded-xl border border-border bg-surface text-[0.7rem] font-bold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const err = moveSession(date, target);
                if (err) {
                  toast.error(err);
                  return;
                }
                setMoving(false);
                onMoved(target);
                toast.success(`Moved to ${target}`);
              }}
              className="h-9 flex-[1.4] rounded-xl bg-accent text-[0.7rem] font-extrabold text-accent-ink"
            >
              Move session
            </button>
          </div>
          <p className="text-[0.58rem] leading-snug text-faint">
            Every statistic follows the session to its new date. A day that already has a
            session logged is refused rather than overwritten.
          </p>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label, hint, onClick, danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-2.5 py-2 text-left active:bg-surface-3",
        danger ? "border-danger/40 bg-surface" : "border-border bg-surface",
      )}
    >
      <div className={cn("text-[0.68rem] font-bold", danger ? "text-danger" : "text-fg")}>
        {label}
      </div>
      <div className="mt-0.5 text-[0.55rem] leading-tight text-faint">{hint}</div>
    </button>
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
        className="glass-panel rounded-t-3xl border-t border-border px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2"
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
