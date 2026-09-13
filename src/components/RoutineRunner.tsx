import { useEffect, useMemo, useState } from "react";
import { Check, Pause, Play, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { tapLight, tapSuccess } from "@/lib/haptics";
import {
  clock, completeStep, driftSeconds, duration, isFinished, paceOf, pauseRun, resumeRun,
  skipStep, spans, stepLeftSeconds, stepsOf, windowLeftSeconds, type Routine, type RunState,
} from "@/lib/routine";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * A routine, running.
 *
 * Full screen and one step at a time, because the whole value is knowing what
 * to do NOW and whether you have time for it. A list of five steps with five
 * countdowns is the checklist this replaces.
 *
 * The screen is built around one number — ahead or behind — and everything
 * else is there to make that number readable at arm's length while you are
 * doing something else. The ring is the current step; the bar underneath is
 * the whole window; the colour is the drift. Nothing animates for decoration:
 * the ring moves because time is passing, and it turns amber and then red
 * because you are running out of it.
 */
export function RoutineRunner({
  routine, onClose,
}: {
  routine: Routine;
  onClose: () => void;
}) {
  const run = useSoma((s) => s.dayRoutineRun);
  const setRun = useSoma((s) => s.setDayRoutineRun);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const toggleTodo = useSoma((s) => s.toggleTodo);
  const habits = useSoma((s) => s.habits);
  const todos = useSoma((s) => s.todos);
  const activeDate = useSoma((s) => s.activeDate);

  // Ticks every 200ms rather than every second: a countdown that jumps a whole
  // second at a time reads as a stutter next to a ring that moves smoothly.
  const [, force] = useState(0);
  useEffect(() => {
    if (!run || run.pausedAt) return;
    const id = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [run, run?.pausedAt]);

  const list = useMemo(() => spans(routine), [routine]);
  const steps = stepsOf(routine);

  if (!run) return null;

  const done = isFinished(routine, run);
  const cur = list[run.index];
  const stepLeft = stepLeftSeconds(routine, run, Date.now());
  const winLeft = windowLeftSeconds(routine, run, Date.now());
  const drift = driftSeconds(routine, run, Date.now());
  const total = Number(routine.windowSeconds) || 1;
  const winProgress = Math.max(0, Math.min(1, 1 - winLeft / total));
  const stepTotal = cur ? cur.endSeconds - cur.startSeconds : 1;
  const stepProgress = Math.max(0, Math.min(1, 1 - stepLeft / stepTotal));

  /** Red when the step has overrun, amber in its last fifth, else the colour. */
  const tone = stepLeft < 0 ? "var(--color-danger)" : stepLeft <= stepTotal * 0.2 ? "var(--color-warn)" : routine.color;

  const finishStep = () => {
    if (!cur) return;
    tapSuccess();
    // The real thing is ticked here rather than at the end, so a routine
    // abandoned halfway still leaves an honest record of what was done.
    if (cur.step.source === "habit" && cur.step.refId) {
      const h = habits.find((x) => x.id === cur.step.refId);
      if (h && !h.history[activeDate]) toggleHabit(h.id);
    }
    if (cur.step.source === "todo" && cur.step.refId) {
      const t = todos.find((x) => x.id === cur.step.refId);
      if (t && !t.done) toggleTodo(t.id);
    }
    const next = completeStep(routine, run, Date.now());
    setRun(next);
    if (isFinished(routine, next)) {
      toast.success(`${routine.name} done in ${duration((Date.now() - run.startedAt) / 1000)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-2 px-4 pb-2">
        <div className="min-w-0">
          <div className="truncate font-display text-base font-extrabold">{routine.name}</div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-faint">
            {done ? "finished" : `step ${run.index + 1} of ${steps.length}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setRun(null);
            onClose();
          }}
          aria-label="Stop the routine"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface-2"
        >
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-5">
        {done ? (
          <Finished routine={routine} run={run} />
        ) : (
          <>
            <StepRing
              label={cur?.step.label ?? ""}
              left={stepLeft}
              progress={stepProgress}
              tone={tone}
              paused={!!run.pausedAt}
            />

            {/* One number, large enough to read from across the room while
                brushing your teeth. This is what the whole screen is for. */}
            <Pace drift={drift} />

            <Upcoming list={list} index={run.index} />
          </>
        )}
      </div>

      <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        {/* The window. A thin bar rather than a second ring: two rings compete
            and you have to work out which is which, and there is no working
            anything out while a timer is running. */}
        <div className="mb-1 flex items-baseline justify-between text-[0.65rem] font-bold uppercase tracking-wider text-faint">
          <span>{done ? "took" : "window"}</span>
          <span className={cn("tabular", winLeft < 0 && "text-danger")}>
            {winLeft < 0 ? `${clock(-winLeft)} over` : `${clock(winLeft)} left`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{
              width: `${winProgress * 100}%`,
              background: winLeft < 0 ? "var(--color-danger)" : routine.color,
            }}
          />
        </div>

        {!done && (
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                tapLight();
                setRun(run.pausedAt ? resumeRun(run) : pauseRun(run));
              }}
            >
              {run.pausedAt ? <Play className="size-4" /> : <Pause className="size-4" />}
              {run.pausedAt ? "Resume" : "Pause"}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                tapLight();
                setRun(skipStep(routine, run, Date.now()));
              }}
            >
              <SkipForward className="size-4" /> Skip
            </Button>
            <Button variant="primary" className="flex-[1.4]" onClick={finishStep}>
              <Check className="size-4" /> Done
            </Button>
          </div>
        )}

        {done && (
          <Button
            variant="primary"
            className="mt-3 w-full"
            onClick={() => {
              setRun(null);
              onClose();
            }}
          >
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Ahead, behind, or near enough.
 *
 * The middle case is the important one. A second either way is arithmetic
 * rather than information, and a badge that goes red immediately is a badge
 * nobody reads by the third morning.
 */
function Pace({ drift }: { drift: number }) {
  const pace = paceOf(drift);
  return (
    <div
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-extrabold tabular transition-colors",
        pace === "ahead" && "bg-accent/15 text-accent-text",
        pace === "behind" && "bg-danger/15 text-danger",
        pace === "on-time" && "bg-surface-2 text-muted",
      )}
    >
      {pace === "on-time"
        ? "on time"
        : pace === "ahead"
          ? `${clock(drift)} ahead`
          : `${clock(-drift)} behind`}
    </div>
  );
}

const R = 92;
const STROKE = 14;
const BOX = (R + STROKE) * 2;

function StepRing({
  label, left, progress, tone, paused,
}: {
  label: string;
  left: number;
  progress: number;
  tone: string;
  paused: boolean;
}) {
  const c = 2 * Math.PI * R;
  return (
    <div className="relative" style={{ width: Math.min(BOX, 260), height: Math.min(BOX, 260) }}>
      <svg viewBox={`0 0 ${BOX} ${BOX}`} className="block size-full -rotate-90">
        <circle cx={BOX / 2} cy={BOX / 2} r={R} fill="none" stroke="var(--color-surface-3)" strokeWidth={STROKE} />
        {/* Not drawn at zero: a round cap on a zero-length dash still paints a
            dot, which reads as "a little done" on a step nobody has started. */}
        {progress > 0.004 && (
          <circle
            cx={BOX / 2}
            cy={BOX / 2}
            r={R}
            fill="none"
            stroke={tone}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
            style={{ transition: "stroke-dashoffset 200ms linear, stroke 300ms" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div
          className={cn("font-display text-4xl font-extrabold tabular leading-none", paused && "opacity-40")}
          style={{ color: tone }}
        >
          {clock(left)}
        </div>
        <div className="mt-2 line-clamp-2 text-sm font-bold leading-tight">{label}</div>
        {paused && (
          <div className="mt-1 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            paused
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What is coming, and nothing about how long ago the last one was.
 *
 * Two steps rather than all of them: the next one is what lets you decide
 * whether to cut this one short, and the eight after it are noise you would
 * have to read past to find it.
 */
function Upcoming({ list, index }: { list: ReturnType<typeof spans>; index: number }) {
  const next = list.slice(index + 1, index + 3);
  if (!next.length) {
    return <div className="text-[0.7rem] font-bold uppercase tracking-wider text-faint">last one</div>;
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">next</div>
      {next.map((s, i) => (
        <div
          key={s.step.id}
          className={cn(
            "flex items-center gap-2 text-sm font-semibold",
            i === 0 ? "text-fg" : "text-faint",
          )}
        >
          <span className="truncate">{s.step.label}</span>
          <span className="tabular text-[0.7rem] text-faint">
            {clock(s.endSeconds - s.startSeconds)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Finished({ routine, run }: { routine: Routine; run: RunState }) {
  const took = Math.round((Date.now() - run.startedAt - (run.pausedMs || 0)) / 1000);
  const over = took - (Number(routine.windowSeconds) || 0);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className="grid size-24 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${routine.color} 22%, transparent)` }}
      >
        <Check className="size-12" style={{ color: routine.color }} strokeWidth={2.6} />
      </div>
      <div className="font-display text-2xl font-extrabold">{duration(took)}</div>
      <div className={cn("text-sm font-bold", over <= 0 ? "text-accent-text" : "text-warn")}>
        {over <= 0 ? `${clock(-over)} inside the window` : `${clock(over)} over`}
      </div>
      <div className="text-[0.7rem] leading-snug text-faint">
        {run.done.length} of {stepsOf(routine).length} finished. Anything skipped was left
        untouched — the habits it stands for are only ticked by finishing the step.
      </div>
    </div>
  );
}
