import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  ARC_START, ARC_SWEEP, DEFAULT_BOOKS_PER_YEAR, DEFAULT_GOAL_MIN, arcD, bestStreak, bookGrid,
  clockOf, clockHMS, elapsedMinutes, elapsedSeconds, fractionOf, streak, todayMinutes, todaySeconds,
  weekMet, weekOf,
} from "@/lib/reading-goal";
import { finishedIn, onlyBooks } from "@/lib/shelf";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";

/**
 * The box is cut to the arc rather than left square.
 *
 * A 220-degree sweep reaches only a third of the way below its own centre, so a
 * square viewBox leaves a band of nothing between the dial and the button under
 * it — which reads as a layout that failed rather than as breathing room.
 */
const WIDTH = 240;
const HEIGHT = 168;
const CX = WIDTH / 2;
const CY = 110;
const R = 96;
const BAND = 12;

/** How much a tap adds when you would rather type than run a clock. */
const QUICK = [5, 15, 30];

/**
 * Minutes read today, against a goal, with the run of days underneath.
 *
 * The shelf says what you are reading. This says whether you opened it — which
 * is the thing that actually decides whether a book gets finished, and a run of
 * days you can see is most of what makes you open it tomorrow.
 *
 * A book opened in SOMA fills this in by itself. The timer and the quick taps
 * are for paper, which is most of what anybody reads — and the timer is stored
 * as a START TIME rather than a tally, because reading is the one activity
 * during which you put the phone down, and a counter that only advances while
 * the app is foregrounded would undercount exactly the sessions worth
 * counting.
 */
export function ReadingGoal() {
  const reading = useSoma((s) => s.reading);
  const readingSince = useSoma((s) => s.readingSince);
  const startReading = useSoma((s) => s.startReading);
  const stopReading = useSoma((s) => s.stopReading);
  const addReading = useSoma((s) => s.addReading);
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const mind = useSoma((s) => s.mind);

  const goal = Math.max(1, settings.readingGoalMin ?? DEFAULT_GOAL_MIN);
  const booksGoal = Math.max(1, settings.booksPerYear ?? DEFAULT_BOOKS_PER_YEAR);
  const today = getLocalDateKey(new Date());

  // A ticking clock needs a heartbeat; once a second only while it runs.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!readingSince) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [readingSince]);

  const minutes = todayMinutes(reading, today, readingSince);
  const secondsToday = todaySeconds(reading, today, readingSince);
  // The arc is drawn from SECONDS against the goal in minutes, so it creeps
  // forward every second instead of stepping a whole minute at a time — which
  // is what makes "30 minutes and the ring is full" visibly true while you
  // watch it.
  const frac = fractionOf(secondsToday / 60, goal);
  const run = streak(reading, goal, today);
  const best = bestStreak(reading, goal);
  const week = useMemo(() => weekOf(reading, goal, today), [reading, goal, today]);
  const metThisWeek = weekMet(week);

  const finished = useMemo(
    () => finishedIn(onlyBooks(mind), new Date().getFullYear()),
    [mind],
  );
  const grid = bookGrid(finished, booksGoal);

  const running = readingSince !== null;
  const held = elapsedMinutes(readingSince);

  /**
   * A timer that only runs while you are looking at it.
   *
   * Press play, put the phone in a pocket, and the old timer kept counting
   * until you came back — hours of "reading" nobody did. Backgrounding now
   * banks the session, which is the same rule the reader itself follows: time
   * counts while the book is open and the app is in front of you, and not
   * otherwise.
   */
  useEffect(() => {
    if (!readingSince) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") stopReading();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [readingSince, stopReading]);

  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: running ? "Reading now" : "Reading today",
          short: "Reading",
          icon: running ? Pause : Play,
          value: clockOf(minutes),
          unit: `/ ${goal}m`,
          progress: frac,
          done: frac >= 1,
          sub: `${run}-day streak · ${finished}/${booksGoal} books this year`,
        }}
      />
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="relative mx-auto w-full max-w-[280px]">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img"
             aria-label={`${clockOf(minutes)} of a ${goal} minute goal today.`}>
          <path
            d={arcD(CX, CY, R, ARC_START, ARC_START + ARC_SWEEP)}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={BAND}
            strokeLinecap="round"
          />
          <path
            d={arcD(CX, CY, R, ARC_START, ARC_START + ARC_SWEEP * frac)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={BAND}
            strokeLinecap="round"
            style={{ transition: "d 400ms ease" }}
          />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-4">
          <div className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-faint">
            Today&apos;s reading
          </div>
          {/* Hours, minutes, seconds — the second hand is what says the timer
              is alive. Eight characters is wider than five, so the type is a
              step down and tracked in: at the old size the digits ran into the
              band on both sides. */}
          <div className="mt-0.5 font-display text-[2.1rem] font-extrabold tabular leading-none tracking-tight">
            {clockHMS(secondsToday)}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = window.prompt("Minutes a day", String(goal));
              const n = Math.round(Number(next));
              if (Number.isFinite(n) && n > 0) patchSettings({ readingGoalMin: Math.min(600, n) });
            }}
            className="pointer-events-auto mt-1 text-xs text-muted underline decoration-dotted underline-offset-2"
          >
            of your {goal}-minute goal
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (running) {
            const kept = stopReading();
            toast.success(kept > 0 ? `${kept} min read` : "Nothing to add");
          } else {
            startReading();
          }
        }}
        className={cn(
          "mt-3 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 font-display text-sm font-extrabold",
          running ? "bg-accent text-accent-ink" : "border border-border bg-surface-2 text-fg",
        )}
      >
        {running ? <Pause className="size-4" /> : <Play className="size-4" />}
        {running ? `Reading — ${clockHMS(secondsToday)}` : "Start reading"}
      </button>

      <div className="mt-2 flex justify-center gap-1.5">
        {QUICK.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              addReading(n);
              toast.success(`+${n} min`);
            }}
            aria-label={`Add ${n} minutes`}
            className="flex items-center gap-0.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold tabular text-muted"
          >
            <Plus className="size-3" />
            {n}
          </button>
        ))}
      </div>

      {/* Said once, here, because a number that fills itself in without
          explanation reads as a bug — and somebody who does not know it is
          running will start the timer as well and count the evening twice. */}
      <p className="mt-1.5 text-center text-[0.65rem] leading-snug text-faint">
        Books opened in SOMA count themselves. The timer is for paper.
      </p>

      {/* The week, Monday first. A strip that slides every midnight cannot show
          "this week", and this week is what a weekly run is measured against. */}
      <div className="mt-4 flex justify-between gap-1">
        {week.map((d) => (
          <div
            key={d.date}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold",
              d.met
                ? "bg-accent text-accent-ink"
                : d.isFuture
                  ? "border border-dashed border-border text-faint"
                  : "bg-surface-2 text-muted",
              d.isToday && !d.met && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
            )}
            title={`${d.date}: ${d.minutes} min`}
          >
            {d.letter}
          </div>
        ))}
      </div>

      <p className="mt-2 text-center text-xs leading-snug">
        {run > 0 ? (
          <>
            <span className="font-bold">
              {run} day{run === 1 ? "" : "s"} in a row
            </span>
            <span className="text-faint">
              {best > run ? ` · best is ${best}` : run > 1 && run === best ? " · a new record" : ""}
            </span>
          </>
        ) : (
          <span className="text-faint">
            {metThisWeek > 0
              ? `${metThisWeek} of 7 this week. Start a new run.`
              : "Start a new streak. Read daily and set new records."}
          </span>
        )}
      </p>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-sm font-extrabold">Books read this year</h3>
          <button
            type="button"
            onClick={() => {
              const next = window.prompt("Books a year", String(booksGoal));
              const n = Math.round(Number(next));
              if (Number.isFinite(n) && n > 0) patchSettings({ booksPerYear: Math.min(200, n) });
            }}
            className="shrink-0 text-[0.7rem] font-bold tabular text-muted underline decoration-dotted underline-offset-2"
          >
            {grid.finished} of {grid.goal}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1.5">
          {grid.cells.map((c) => (
            <div
              key={c.n}
              className={cn(
                "grid aspect-square place-items-center rounded-lg text-[0.7rem] font-extrabold tabular",
                c.done ? "bg-accent text-accent-ink" : "bg-surface-2 text-faint",
              )}
            >
              {c.n}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[0.65rem] leading-snug text-faint">
          A book counts here the day you mark it finished on the shelf.
        </p>
      </div>
    </Card>
  );
}
