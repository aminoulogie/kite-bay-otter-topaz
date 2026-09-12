import { useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_TARGET, newStepId, targetOf } from "@/lib/habit-steps";
import { cn } from "@/lib/utils";
import type { Habit, HabitStep } from "@/lib/types";

/**
 * Edit the checklist behind a habit.
 *
 * Kept in a sheet rather than inline on the card because this is a once-a-month
 * action and ticking the steps is a daily one — the daily thing gets the space.
 *
 * The list is edited as a draft and written on save, so half-typed names never
 * reach the store and re-derive the history. Adding a step un-completes the
 * days that carry counts, which is correct but not something to do on every
 * keystroke.
 */
export function HabitStepsSheet({
  habit, onClose, onSave,
}: {
  habit: Habit;
  onClose: () => void;
  onSave: (steps: HabitStep[]) => void;
}) {
  const [draft, setDraft] = useState<HabitStep[]>(() =>
    (habit.steps ?? []).map((s) => ({ ...s, target: targetOf(s) })),
  );
  const [adding, setAdding] = useState("");

  const patch = (id: string, next: Partial<HabitStep>) =>
    setDraft((d) => d.map((s) => (s.id === id ? { ...s, ...next } : s)));

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    setDraft((d) => [...d, { id: newStepId(), name, target: 1 }]);
    setAdding("");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={`Checklist for ${habit.name}`}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">{habit.name}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>
        <p className="mb-3 text-xs leading-snug text-muted">
          {draft.length === 0
            ? "No checklist. Add steps and this habit only counts on days you finish all of them."
            : "This habit counts on a day once every step below is done that day."}
        </p>

        <div className="space-y-1.5">
          {draft.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2 py-1.5"
            >
              <input
                value={s.name}
                onChange={(e) => patch(s.id, { name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                aria-label="Step name"
              />
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-3 p-0.5">
                <button
                  type="button"
                  onClick={() => patch(s.id, { target: Math.max(1, s.target - 1) })}
                  disabled={s.target <= 1}
                  className="flex size-7 items-center justify-center rounded-full text-muted disabled:opacity-30"
                  aria-label={`Fewer times a day for ${s.name}`}
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="min-w-8 text-center text-xs font-extrabold tabular">
                  {s.target}×
                </span>
                <button
                  type="button"
                  onClick={() => patch(s.id, { target: Math.min(MAX_TARGET, s.target + 1) })}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="e.g. Moisturiser"
          />
          <Button onClick={add}>Add</Button>
        </div>

        {(habit.steps?.length ?? 0) > 0 && draft.length === 0 && (
          <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-bold leading-snug text-warn">
            Saving with no steps turns this back into a plain habit you tick
            yourself. The days you already earned stay marked.
          </p>
        )}

        <Button
          variant="primary"
          className="mt-3 w-full"
          onClick={() => {
            onSave(draft);
            onClose();
          }}
        >
          Save checklist
        </Button>
      </div>
    </div>
  );
}
