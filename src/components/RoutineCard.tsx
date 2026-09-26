import { useMemo, useState } from "react";
import { GripVertical, Play, Plus, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { RoutineRunner } from "@/components/RoutineRunner";
import {
  MIN_STEP_SECONDS, ROUTINE_COLORS, clock, duration, isOverCommitted, plannedSeconds,
  slackSeconds, spans, stepsOf, type Routine, type StepSource,
} from "@/lib/routine";
import { getLocalDateKey } from "@/lib/soma";
import { activeOf } from "@/lib/todos";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";

/**
 * Routines: several things done back to back, against one clock.
 *
 * This is the setup half; RoutineRunner is the half that matters. The reason
 * it lives on Time rather than on Habits is that the question it answers is a
 * question about time — do five things fit in twenty minutes — and Habits
 * answers a question about consistency.
 *
 * Steps are built FROM habits and to-dos rather than typed again. A morning
 * routine whose steps are copies of your habits would tick nothing when you
 * ran it, and you would end up keeping the same list in two places and
 * believing whichever one you looked at last.
 */
export function RoutineCard() {
  const routines = useSoma((s) => s.dayRoutines);
  const run = useSoma((s) => s.dayRoutineRun);
  const addRoutine = useSoma((s) => s.addDayRoutine);
  const removeRoutine = useSoma((s) => s.removeDayRoutine);
  const restoreRoutine = useSoma((s) => s.restoreDayRoutine);
  const begin = useSoma((s) => s.beginDayRoutine);

  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);

  const running = routines.find((r) => r.id === run?.routineId);

  const nextColor = () =>
    ROUTINE_COLORS.find((c) => !routines.some((r) => r.color === c)) ??
    ROUTINE_COLORS[routines.length % ROUTINE_COLORS.length]!;

  const create = () => {
    const text = name.trim();
    if (!text) return;
    const id = addRoutine(text, 20 * 60, nextColor());
    setName("");
    setOpen(id);
  };

  const size = useWidgetSize();
  // A running routine draws its runner from inside this card, so it stays whole.
  if (isGlance(size) && !running) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Routines",
          icon: Timer,
          value: routines.length ? String(routines.length) : null,
          lines: routines.map((r) => ({
            text: r.name,
            color: r.color,
            value: `${Math.round(r.windowSeconds / 60)}m · ${r.steps.length} steps`,
          })),
          empty: "No routines yet",
          emptyShort: "None",
        }}
      />
    );
  }
  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-1.5">
          <Timer className="size-4 text-accent" />
          Routines
        </span>
        {routines.length > 0 && (
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-faint">
            {routines.length}
          </span>
        )}
      </CardTitle>

      {routines.length === 0 ? (
        <p className="mb-3 text-[0.7rem] leading-snug text-faint">
          A run of things done back to back against one clock — five things in a twenty
          minute morning. Build it from your habits, and finishing a step ticks the habit
          it stands for.
        </p>
      ) : (
        <div className="mb-2 space-y-1.5">
          {routines.map((r) => (
            <SwipeRow
              key={r.id}
              id={r.id}
              openId={swiped}
              setOpenId={setSwiped}
              editLabel="Edit"
              onEdit={() => setOpen(r.id)}
              onDelete={() => {
                const idx = routines.findIndex((x) => x.id === r.id);
                removeRoutine(r.id);
                toast.success(`${r.name} removed`, {
                  action: { label: "Undo", onClick: () => restoreRoutine(idx, r) },
                });
              }}
            >
              <RoutineRow routine={r} onOpen={() => setOpen(r.id)} onStart={() => begin(r.id)} />
            </SwipeRow>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Morning, wind-down, gym prep…"
          className="h-10 flex-1"
        />
        <button
          type="button"
          onClick={create}
          disabled={!name.trim()}
          aria-label="Add a routine"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {open && <RoutineSheet id={open} onClose={() => setOpen(null)} />}
      {running && run && <RoutineRunner routine={running} onClose={() => undefined} />}
    </Card>
  );
}

function RoutineRow({
  routine, onOpen, onStart,
}: {
  routine: Routine;
  onOpen: () => void;
  onStart: () => void;
}) {
  const steps = stepsOf(routine);
  const slack = slackSeconds(routine);
  const over = isOverCommitted(routine);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
      <span
        aria-hidden
        className="h-9 w-1.5 shrink-0 rounded-full"
        style={{ background: routine.color }}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold">{routine.name}</span>
        <span className="block text-[0.66rem] tabular text-faint">
          {steps.length} {steps.length === 1 ? "step" : "steps"} ·{" "}
          {duration(plannedSeconds(routine))} of {duration(routine.windowSeconds)}
          {over ? (
            <span className="ml-1 font-bold text-danger">{clock(-slack)} over</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={onStart}
        disabled={!steps.length}
        aria-label={`Start ${routine.name}`}
        className="grid size-10 shrink-0 place-items-center rounded-full text-accent-ink disabled:opacity-30"
        style={{ background: steps.length ? routine.color : "var(--color-surface-3)" }}
      >
        <Play className="size-4" fill="currentColor" />
      </button>
    </div>
  );
}

const PRESET_MINUTES = [1, 2, 5, 10, 15, 20, 30, 45, 60];

function RoutineSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const routine = useSoma((s) => s.dayRoutines.find((r) => r.id === id));
  const patch = useSoma((s) => s.patchDayRoutine);
  const addStep = useSoma((s) => s.addDayRoutineStep);
  const patchStep = useSoma((s) => s.patchDayRoutineStep);
  const removeStep = useSoma((s) => s.removeDayRoutineStep);
  const moveStep = useSoma((s) => s.moveDayRoutineStep);
  const remove = useSoma((s) => s.removeDayRoutine);
  const habits = useSoma((s) => s.habits);
  const todos = useSoma((s) => s.todos);

  const [free, setFree] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);

  const list = useMemo(() => (routine ? spans(routine) : []), [routine]);
  if (!routine) return null;

  const slack = slackSeconds(routine);
  const over = isOverCommitted(routine);
  const used = new Set(stepsOf(routine).map((s) => s.refId).filter(Boolean));
  /**
   * Only what is actually on a live list.
   *
   * Every to-do ever ticked off `!t.done` used to qualify, which is fine for
   * a week and a mess after a year — reaching for "walk the dog" and finding
   * it buried under four hundred finished errands from last spring. A step
   * can only ever point at something on today's or this week's list now.
   */
  const today = getLocalDateKey(new Date());
  const openTodos = [...activeOf(todos, "day", today), ...activeOf(todos, "week", today)].filter(
    (t) => !t.done,
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={routine.name}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="truncate font-display text-base font-extrabold">{routine.name}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Name
          </span>
          <Input
            value={routine.name}
            onChange={(e) => patch(routine.id, { name: e.target.value })}
            className="h-11"
          />
        </label>

        {/* The window first, because it is the constraint everything else is
            fitted into — and because choosing it after the steps invites you
            to pick whatever number they already add up to. */}
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            The whole window
          </span>
          <span className="text-sm font-bold tabular">{duration(routine.windowSeconds)}</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[5, 10, 15, 20, 30, 45, 60, 90].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => patch(routine.id, { windowSeconds: m * 60 })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[0.7rem] font-bold",
                routine.windowSeconds === m * 60
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface-2 text-muted",
              )}
            >
              {m}m
            </button>
          ))}
        </div>

        <div
          className={cn(
            "mb-3 rounded-xl px-3 py-2 text-[0.68rem] font-bold leading-snug",
            over ? "border border-danger/50 bg-danger/10 text-danger" : "bg-surface-2 text-muted",
          )}
        >
          {over
            ? `The steps come to ${duration(plannedSeconds(routine))} — ${clock(-slack)} more than the window. Shorten one, or give yourself longer.`
            : `${duration(plannedSeconds(routine))} of steps, ${duration(slack)} spare.`}
        </div>

        <div className="mb-2 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
          The steps, in order
        </div>
        <div className="mb-3 space-y-1.5">
          {list.map((s, i) => (
            <SwipeRow
              key={s.step.id}
              id={s.step.id}
              openId={swiped}
              setOpenId={setSwiped}
              onDelete={() => removeStep(routine.id, s.step.id)}
            >
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2.5 py-2">
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => moveStep(routine.id, s.step.id, i - 1)}
                    aria-label={`Move ${s.step.label} up`}
                    className="text-faint disabled:opacity-25"
                  >
                    <GripVertical className="size-4 rotate-90" />
                  </button>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.step.label}</span>
                  <span className="block text-[0.62rem] tabular text-faint">
                    {clock(s.startSeconds)} → {clock(s.endSeconds)}
                    {s.step.source !== "free" && (
                      <span className="ml-1 uppercase">· {s.step.source}</span>
                    )}
                  </span>
                </span>
                <select
                  value={Math.round(s.step.seconds / 60) || 1}
                  onChange={(e) => patchStep(routine.id, s.step.id, { seconds: Number(e.target.value) * 60 })}
                  aria-label={`Minutes for ${s.step.label}`}
                  className="h-9 shrink-0 rounded-lg border border-border bg-surface px-2 text-xs font-bold tabular text-fg"
                >
                  {PRESET_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}m
                    </option>
                  ))}
                </select>
              </div>
            </SwipeRow>
          ))}
          {!list.length && (
            <p className="text-[0.68rem] text-faint">
              Nothing yet. Add habits below — finishing a step ticks the habit it stands for,
              which is the whole reason to build it from them rather than retyping them.
            </p>
          )}
        </div>

        <Picker
          title="From habits"
          items={habits
            .filter((h) => !used.has(h.id))
            .map((h) => ({ id: h.id, label: h.name, seconds: h.seconds }))}
          onPick={(item) =>
            addStep(routine.id, {
              label: item.label,
              seconds: item.seconds ?? 5 * 60,
              source: "habit" as StepSource,
              refId: item.id,
            })
          }
        />

        <Picker
          title="From to-dos"
          items={openTodos
            .filter((t) => !used.has(t.id))
            .map((t) => ({ id: t.id, label: t.text, seconds: undefined }))}
          onPick={(item) =>
            addStep(routine.id, {
              label: item.label,
              seconds: 5 * 60,
              source: "todo" as StepSource,
              refId: item.id,
            })
          }
        />

        <div className="mb-3">
          <div className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Or something that is not tracked
          </div>
          <div className="flex gap-1.5">
            <Input
              value={free}
              onChange={(e) => setFree(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !free.trim()) return;
                addStep(routine.id, { label: free.trim(), seconds: 5 * 60, source: "free" });
                setFree("");
              }}
              placeholder="Shower, pack the bag…"
              className="h-10 flex-1"
            />
            <Button
              variant="primary"
              disabled={!free.trim()}
              onClick={() => {
                addStep(routine.id, { label: free.trim(), seconds: 5 * 60, source: "free" });
                setFree("");
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {ROUTINE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => patch(routine.id, { color: c })}
              className={cn(
                "size-8 rounded-lg border-2",
                routine.color === c ? "border-fg" : "border-transparent",
              )}
              style={{ background: c }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            remove(routine.id);
            onClose();
            toast.success(`${routine.name} removed`);
          }}
          className="w-full rounded-xl border border-danger/50 py-2.5 text-xs font-bold text-danger"
        >
          Remove {routine.name}
        </button>
      </div>
    </div>
  );
}

/**
 * A row of chips for things that already exist.
 *
 * A habit that carries its own duration brings it along; one that does not
 * gets five minutes, which is a guess the user can change in one tap rather
 * than a question asked before they have seen the shape of the routine.
 */
function Picker({
  title, items, onPick,
}: {
  title: string;
  items: { id: string; label: string; seconds?: number }[];
  onPick: (item: { id: string; label: string; seconds?: number }) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it)}
            className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold text-muted"
          >
            <Plus className="size-3" />
            {it.label}
            {it.seconds ? (
              <span className="tabular text-faint">
                {Math.max(1, Math.round(it.seconds / 60))}m
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export { MIN_STEP_SECONDS };
