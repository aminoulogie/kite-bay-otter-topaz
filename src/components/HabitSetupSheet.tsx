import { useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { MAX_TARGET, newStepId, targetOf } from "@/lib/habit-steps";
import { formatAmount, isBuild, totalRungs, type RampAdvance, type RampUnit } from "@/lib/habit-ramp";
import { getLocalDateKey } from "@/lib/soma";
import { cn } from "@/lib/utils";
import type { Habit, HabitRamp, HabitStep } from "@/lib/types";

type Shape = "simple" | "checklist" | "ramp";

const UNITS: { id: RampUnit; label: string }[] = [
  { id: "min", label: "Minutes" },
  { id: "count", label: "Times" },
  { id: "page", label: "Pages" },
];

function shapeOf(habit: Habit): Shape {
  if (habit.ramp) return "ramp";
  if ((habit.steps?.length ?? 0) > 0) return "checklist";
  return "simple";
}

/**
 * One sheet, because a habit has one shape.
 *
 * A tick, a checklist, or a number that moves every day — and they are
 * mutually exclusive on purpose. All three decide the same thing, whether the
 * day counts, and a habit wired to two of them at once would have two answers
 * to that question and no way to choose between them.
 */
export function HabitSetupSheet({
  habit, onClose, onSaveSteps, onSaveRamp,
}: {
  habit: Habit;
  onClose: () => void;
  onSaveSteps: (steps: HabitStep[]) => void;
  onSaveRamp: (ramp: HabitRamp | null) => void;
}) {
  const [shape, setShape] = useState<Shape>(() => shapeOf(habit));
  const [draft, setDraft] = useState<HabitStep[]>(() =>
    (habit.steps ?? []).map((s) => ({ ...s, target: targetOf(s) })),
  );
  const [adding, setAdding] = useState("");

  const [ramp, setRamp] = useState<HabitRamp>(() =>
    habit.ramp ?? {
      start: 1, target: 30, step: 1,
      from: getLocalDateKey(new Date()), unit: "min", advance: "earned",
    },
  );

  const patchStep = (id: string, next: Partial<HabitStep>) =>
    setDraft((d) => d.map((s) => (s.id === id ? { ...s, ...next } : s)));

  const addStep = () => {
    const name = adding.trim();
    if (!name) return;
    setDraft((d) => [...d, { id: newStepId(), name, target: 1 }]);
    setAdding("");
  };

  const save = () => {
    if (shape === "ramp") {
      onSaveSteps([]);
      onSaveRamp(ramp);
    } else if (shape === "checklist") {
      onSaveRamp(null);
      onSaveSteps(draft);
    } else {
      onSaveRamp(null);
      onSaveSteps([]);
    }
    onClose();
  };

  const climbing = isBuild(ramp);
  const rungs = totalRungs(ramp);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={`Set up ${habit.name}`}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">{habit.name}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <div className="flex gap-1">
          {(["simple", "checklist", "ramp"] as Shape[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShape(s)}
              className={cn(
                "h-9 flex-1 rounded-full text-xs font-bold transition-colors",
                shape === s ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
              )}
            >
              {s === "simple" ? "Just a tick" : s === "checklist" ? "Checklist" : "Daily number"}
            </button>
          ))}
        </div>

        {shape === "simple" && (
          <p className="mt-3 text-xs leading-snug text-muted">
            Tick it or don&apos;t. Nothing to configure — which is the right shape for
            most things.
          </p>
        )}

        {shape === "checklist" && (
          <>
            <p className="mt-3 text-xs leading-snug text-muted">
              The habit counts on a day once every step below is done that day.
            </p>
            <div className="mt-2 space-y-1.5">
              {draft.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2 py-1.5"
                >
                  <input
                    value={s.name}
                    onChange={(e) => patchStep(s.id, { name: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                    aria-label="Step name"
                  />
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-3 p-0.5">
                    <button
                      type="button"
                      onClick={() => patchStep(s.id, { target: Math.max(1, s.target - 1) })}
                      disabled={s.target <= 1}
                      className="flex size-7 items-center justify-center rounded-full text-muted disabled:opacity-30"
                      aria-label={`Fewer times a day for ${s.name}`}
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="min-w-8 text-center text-xs font-extrabold tabular">{s.target}×</span>
                    <button
                      type="button"
                      onClick={() => patchStep(s.id, { target: Math.min(MAX_TARGET, s.target + 1) })}
                      disabled={s.target >= MAX_TARGET}
                      className="flex size-7 items-center justify-center rounded-full text-muted disabled:opacity-30"
                      aria-label={`More times a day for ${s.name}`}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => d.filter((x) => x.id !== s.id))}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-danger"
                    aria-label={`Remove ${s.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className={cn("flex gap-2", draft.length && "mt-2")}>
              <Input
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStep()}
                placeholder="e.g. Moisturiser"
              />
              <Button onClick={addStep}>Add</Button>
            </div>
          </>
        )}

        {shape === "ramp" && (
          <>
            <p className="mt-3 text-xs leading-snug text-muted">
              A number that moves a little every day. Set the target above the start
              to build something up, below it to cut something down.
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Field label="Start at">
                <DecimalInput
                  value={String(ramp.start)}
                  onValueChange={(n) => setRamp((r) => ({ ...r, start: n ?? 0 }))}
                />
              </Field>
              <Field label="Each day">
                <DecimalInput
                  value={String(ramp.step)}
                  onValueChange={(n) => setRamp((r) => ({ ...r, step: n ?? 0 }))}
                />
              </Field>
              <Field label="Until">
                <DecimalInput
                  value={String(ramp.target)}
                  onValueChange={(n) => setRamp((r) => ({ ...r, target: n ?? 0 }))}
                />
              </Field>
            </div>

            <div className="mt-2 flex gap-1">
              {UNITS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setRamp((r) => ({ ...r, unit: u.id }))}
                  className={cn(
                    "h-8 flex-1 rounded-full text-[0.7rem] font-bold transition-colors",
                    ramp.unit === u.id ? "bg-surface-3 text-fg" : "bg-surface-2 text-faint",
                  )}
                >
                  {u.label}
                </button>
              ))}
            </div>

            <p className="mt-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-bold leading-snug">
              {climbing ? "Building up" : "Cutting down"} from{" "}
              {formatAmount(ramp.start, ramp.unit)} to {formatAmount(ramp.target, ramp.unit)}
              {ramp.step > 0 ? (
                <span className="font-normal text-muted">
                  {" "}— {rungs} {rungs === 1 ? "day" : "days"} of{" "}
                  {formatAmount(ramp.step, ramp.unit)} at a time.
                </span>
              ) : (
                <span className="font-normal text-danger"> — a step of nothing never moves.</span>
              )}
            </p>

            <div className="mt-3 space-y-1.5">
              {(["earned", "calendar"] as RampAdvance[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setRamp((r) => ({ ...r, advance: a }))}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left",
                    ramp.advance === a
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 size-4 shrink-0 rounded-full border-4",
                      ramp.advance === a ? "border-accent bg-bg" : "border-surface-3 bg-surface-3",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">
                      {a === "earned" ? "Move only on days I make it" : "Move every day"}
                    </span>
                    <span className="block text-xs leading-snug text-muted">
                      {a === "earned"
                        ? "Miss a day and it waits where it is. A week away does not put tomorrow a week out of reach."
                        : "The number moves whether or not you showed up. Harsher, and it can run away from you."}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {habit.ramp && (
              <Button
                className="mt-3 w-full text-danger"
                onClick={() => {
                  onSaveRamp(null);
                  onClose();
                }}
              >
                Remove the daily number
              </Button>
            )}
          </>
        )}

        <Button variant="primary" className="mt-3 w-full" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[0.6rem] font-bold uppercase tracking-wide text-faint">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
