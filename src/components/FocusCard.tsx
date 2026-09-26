import { useMemo, useState } from "react";
import { Check, Coffee, GripVertical, LayoutList, Play, Plus, Target, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { tapLight, tapMedium } from "@/lib/haptics";
import {
  FOCUS_MINUTES, blockRef, focusIdFor, nowInPlan, suggestSeconds,
} from "@/lib/focus";
import { MAX_STEP_SECONDS, duration, type RoutineStep, type StepSource } from "@/lib/routine";
import { hourOfDay, type TimeBlock } from "@/lib/day-plan";
import { getLocalDateKey } from "@/lib/soma";
import { activeOf } from "@/lib/todos";
import { useLongPressDrag } from "@/lib/use-long-press-drag";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Focus: run my list.
 *
 * Routines are for the things you do the same way every morning. This is
 * for today — the report, the stretch, the inbox — pulled straight off the
 * lists they already live on, given a length each, and run back to back.
 * Finishing a step ticks the to-do or the habit it came from, exactly as a
 * routine step does, because it IS a routine step (lib/focus.ts).
 *
 * The card is the setup; the runner, the lock screen and the pill are
 * SessionHost's. Rows long-press to reorder, and the minutes on each row are
 * the whole of editing one.
 */
export function FocusCard({ blocks }: { blocks: TimeBlock[] }) {
  const activeDate = useSoma((s) => s.activeDate);
  const queue = useSoma((s) => s.focusQueues[s.activeDate]) ?? EMPTY;
  const run = useSoma((s) => s.dayRoutineRun);
  const prefs = useSoma((s) => s.focusPrefs);
  const habits = useSoma((s) => s.habits);
  const todos = useSoma((s) => s.todos);
  const add = useSoma((s) => s.addFocusItem);
  const remove = useSoma((s) => s.removeFocusItem);
  const patchSeconds = useSoma((s) => s.patchFocusSeconds);
  const move = useSoma((s) => s.moveFocusItem);
  const clear = useSoma((s) => s.clearFocusQueue);
  const pull = useSoma((s) => s.pullFocusFromPlan);
  const begin = useSoma((s) => s.beginFocus);
  const runNow = useSoma((s) => s.runFocusItemNow);
  const setPrefs = useSoma((s) => s.setFocusPrefs);

  const [free, setFree] = useState("");
  const [freeMin, setFreeMin] = useState(25);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const runningHere = run?.routineId === focusIdFor(activeDate);
  const floor = runningHere && run ? run.index + 1 : 0;
  const today = getLocalDateKey(new Date());

  const drag = useLongPressDrag(
    queue.length,
    (from, to) => {
      const item = queue[from];
      if (item) move(item.id, to);
    },
    tapMedium,
    "focus-index",
  );

  const used = new Set(queue.map((s) => s.refId).filter(Boolean));
  const openTodos = [...activeOf(todos, "day", today), ...activeOf(todos, "week", today)].filter(
    (t) => !t.done && !used.has(t.id),
  );
  const openHabits = habits.filter((h) => !h.history[activeDate] && !used.has(h.id));

  const isDone = (s: RoutineStep): boolean => {
    if (s.source === "habit") return !!habits.find((h) => h.id === s.refId)?.history[activeDate];
    if (s.source === "todo") return !!todos.find((t) => t.id === s.refId)?.done;
    return false;
  };

  const total = queue.filter((s) => !s.isBreak).reduce((a, s) => a + s.seconds, 0);
  const now = useMemo(() => nowInPlan(blocks, hourOfDay()), [blocks]);

  const addFrom = (source: StepSource, label: string, refId?: string, habitSeconds?: number) => {
    tapLight();
    add({ label, source, refId, seconds: suggestSeconds(source, refId, prefs, habitSeconds) });
  };

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-1.5">
          <Zap className="size-4 text-accent" />
          Focus
        </span>
        {queue.length > 0 && (
          <span className="text-[0.65rem] font-bold uppercase tracking-wider tabular text-faint">
            {queue.filter((s) => !s.isBreak).length} · {duration(total)}
          </span>
        )}
      </CardTitle>

      {/* Now: the block the clock is in, and a way to spend it. Flexible
          blocks only — a fixed one is already spoken for. */}
      {now && activeDate === today && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <span
            aria-hidden
            className="h-8 w-1.5 shrink-0 rounded-full"
            style={{ background: now.arc.block.color }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              Now
            </span>
            <span className="block truncate text-sm font-bold">
              {now.arc.block.label}
              <span className="ml-1.5 text-[0.7rem] font-semibold tabular text-faint">
                {duration(now.leftHours * 3600)} left
              </span>
            </span>
          </span>
          {!now.arc.block.fixed && now.leftHours * 3600 >= 60 && (
            <button
              type="button"
              onClick={() =>
                runNow({
                  label: now.arc.block.label,
                  source: "free",
                  refId: blockRef(now.arc.block.id),
                  seconds: Math.min(MAX_STEP_SECONDS, Math.round(now.leftHours * 3600)),
                })
              }
              className="flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-[0.7rem] font-bold text-accent-ink"
            >
              <Play className="size-3.5" fill="currentColor" /> Focus
            </button>
          )}
        </div>
      )}

      {queue.length === 0 ? (
        <p className="mb-3 text-[0.7rem] leading-snug text-faint">
          Pick what today is for — to-dos, habits, a block of deep work — give each a
          length, and run them one after another. The countdown follows you onto the
          lock screen, and finishing a step ticks the real to-do or habit.
        </p>
      ) : (
        <div className="mb-2 space-y-1.5">
          {queue.map((s, i) => {
            const locked = i < floor;
            const current = runningHere && run?.index === i;
            const finished = isDone(s) || (runningHere && run?.done.includes(s.id));
            return (
              <SwipeRow
                key={s.id}
                id={s.id}
                openId={swiped}
                setOpenId={setSwiped}
                disabled={drag.dragging !== null || locked}
                onDelete={() => remove(s.id)}
              >
                <div
                  data-focus-index={i}
                  {...(locked ? {} : drag.handlers(i))}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border bg-surface-2 px-2.5 py-2 transition-all",
                    current ? "border-accent" : "border-border",
                    drag.dragging === i && "scale-[0.98] opacity-60",
                    drag.over === i && drag.dragging !== null && drag.dragging !== i && "ring-2 ring-accent",
                  )}
                >
                  <GripVertical
                    className={cn("size-4 shrink-0", locked ? "text-transparent" : "text-faint")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 truncate text-sm font-semibold",
                        finished && "text-faint line-through",
                      )}
                    >
                      {s.isBreak && <Coffee className="size-3.5 shrink-0 text-faint" />}
                      <span className="truncate">{s.label}</span>
                      {finished && <Check className="size-3.5 shrink-0 text-accent" />}
                    </span>
                    <span className="block text-[0.62rem] uppercase tracking-wide text-faint">
                      {current ? "on the clock" : s.isBreak ? "break" : s.source}
                    </span>
                  </span>
                  <select
                    value={Math.round(s.seconds / 60) || 1}
                    disabled={locked && !current}
                    onChange={(e) => patchSeconds(s.id, Number(e.target.value) * 60)}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`Minutes for ${s.label}`}
                    className="h-10 shrink-0 rounded-lg border border-border bg-surface px-2 text-xs font-bold tabular text-fg disabled:opacity-40"
                  >
                    {minuteOptions(s.seconds).map((m) => (
                      <option key={m} value={m}>
                        {m}m
                      </option>
                    ))}
                  </select>
                </div>
              </SwipeRow>
            );
          })}
          <p className="px-1 text-[0.62rem] text-faint">
            Hold a row to move it. Swipe left to take it off.
          </p>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        <Button
          size="lg"
          variant="primary"
          className="flex-1"
          disabled={!queue.length}
          onClick={() => {
            tapMedium();
            begin();
          }}
        >
          <Play className="size-4" fill="currentColor" />
          {runningHere ? "Open the run" : "Run my list"}
        </Button>
        <Button
          size="lg"
          onClick={() => {
            const n = pull(blocks);
            toast(n ? `${n} flexible ${n === 1 ? "block" : "blocks"} added` : "No flexible blocks left to add");
          }}
          aria-label="Pull flexible blocks from the day plan"
        >
          <LayoutList className="size-4" /> Plan
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        className="mb-2 flex min-h-10 w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 text-xs font-bold text-muted"
        aria-expanded={picking}
      >
        <span className="flex items-center gap-1.5">
          <Plus className="size-4" /> Add from today
        </span>
        <span className="tabular text-faint">
          {openTodos.length + openHabits.length} open
        </span>
      </button>

      {picking && (
        <div className="mb-3 space-y-3">
          <Chips
            title="To-dos"
            items={openTodos.map((t) => ({ id: t.id, label: t.text }))}
            onPick={(it) => addFrom("todo", it.label, it.id)}
          />
          <Chips
            title="Habits not done today"
            items={openHabits.map((h) => ({ id: h.id, label: h.name, seconds: h.seconds }))}
            onPick={(it) => addFrom("habit", it.label, it.id, it.seconds)}
          />
          <div>
            <div className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              A free block
            </div>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!free.trim()) return;
                add({ label: free.trim(), seconds: freeMin * 60, source: "free" });
                setFree("");
              }}
            >
              <Input
                value={free}
                onChange={(e) => setFree(e.target.value)}
                placeholder="Deep work, inbox, call mum…"
                className="h-11 flex-1"
              />
              <select
                value={freeMin}
                onChange={(e) => setFreeMin(Number(e.target.value))}
                aria-label="Minutes"
                className="h-11 shrink-0 rounded-xl border border-border bg-surface-2 px-2 text-xs font-bold tabular"
              >
                {FOCUS_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m}m
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!free.trim()}
                aria-label="Add a free block"
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pomodoro: after each work step, a short break is put in front of the
          next one. The work length is also the default for new to-dos. */}
      <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setPrefs({ pomodoro: !prefs.pomodoro })}
          className="flex min-h-10 w-full items-center justify-between gap-2 text-left"
          aria-pressed={prefs.pomodoro}
        >
          <span className="flex items-center gap-2">
            <Target className="size-4 text-faint" />
            <span>
              <span className="block text-sm font-bold">Pomodoro breaks</span>
              <span className="block text-[0.62rem] text-faint">
                {prefs.pomodoro
                  ? `${duration(prefs.workSeconds)} work, then ${duration(prefs.breakSeconds)} off`
                  : "Off — steps run straight into each other"}
              </span>
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "relative h-6 w-10 shrink-0 rounded-full transition-colors",
              prefs.pomodoro ? "bg-accent" : "bg-surface-3",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
                prefs.pomodoro ? "translate-x-[1.125rem]" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
        {prefs.pomodoro && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              Work
              <select
                value={Math.round(prefs.workSeconds / 60)}
                onChange={(e) => setPrefs({ workSeconds: Number(e.target.value) * 60 })}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-xs font-bold tabular text-fg"
              >
                {[15, 20, 25, 30, 45, 50, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              Break
              <select
                value={Math.round(prefs.breakSeconds / 60)}
                onChange={(e) => setPrefs({ breakSeconds: Number(e.target.value) * 60 })}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-xs font-bold tabular text-fg"
              >
                {[3, 5, 10, 15, 20].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {queue.length > 0 && !runningHere && (
        <button
          type="button"
          onClick={() => {
            const before = queue;
            clear();
            toast.success("Focus list cleared", {
              action: {
                label: "Undo",
                onClick: () => useSoma.setState((s) => ({
                  focusQueues: { ...s.focusQueues, [activeDate]: before },
                })),
              },
            });
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[0.7rem] font-bold text-faint"
        >
          <Trash2 className="size-3.5" /> Clear the list
        </button>
      )}
    </Card>
  );
}

const EMPTY: RoutineStep[] = [];

/** The presets, plus whatever odd value this row already has. */
function minuteOptions(seconds: number): number[] {
  const cur = Math.max(1, Math.round(seconds / 60));
  const base = [...FOCUS_MINUTES, 120, 180, 240];
  return base.includes(cur) ? base : [...base, cur].sort((a, b) => a - b);
}

function Chips({
  title, items, onPick,
}: {
  title: string;
  items: { id: string; label: string; seconds?: number }[];
  onPick: (item: { id: string; label: string; seconds?: number }) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it)}
            className="flex min-h-10 items-center gap-1 rounded-full border border-border bg-surface-2 px-3 text-[0.72rem] font-bold text-muted"
          >
            <Plus className="size-3" />
            <span className="max-w-[12rem] truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
