import { useState } from "react";
import { ListPlus, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { tapLight } from "@/lib/haptics";
import { FOCUS_MINUTES, isFocusId, suggestSeconds } from "@/lib/focus";
import { duration, type StepSource } from "@/lib/routine";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * "How long, and now or later?" — for one to-do, habit or block.
 *
 * Opened from the to-do list, the habit cards and the day plan, so that
 * allocating time to something is done where you are looking at it, not by
 * going to the Time tab and finding it again. The duration arrives already
 * filled in (last time's, or the habit's own, or one work block), so the
 * common case is a single tap on Run.
 */
export function FocusSheet({
  label, source, refId, habitSeconds, maxSeconds, onClose,
}: {
  label: string;
  source: StepSource;
  refId?: string;
  habitSeconds?: number;
  /** A ceiling, for a block with only so much of it left. */
  maxSeconds?: number;
  onClose: () => void;
}) {
  const prefs = useSoma((s) => s.focusPrefs);
  const add = useSoma((s) => s.addFocusItem);
  const runNow = useSoma((s) => s.runFocusItemNow);
  const running = useSoma((s) => isFocusId(s.dayRoutineRun?.routineId));

  const suggested = suggestSeconds(source, refId, prefs, habitSeconds);
  const initial = Math.max(1, Math.round(Math.min(suggested, maxSeconds ?? suggested) / 60));
  const [minutes, setMinutes] = useState<number>(initial);
  const seconds = Math.max(1, Math.round(minutes)) * 60;

  const item = { label, seconds, source, refId };

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={`Focus on ${label}`}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Time for
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center">
            <X className="size-5 text-muted" />
          </button>
        </div>
        <div className="mb-4 font-display text-lg font-extrabold leading-tight">{label}</div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {FOCUS_MINUTES.filter((m) => !maxSeconds || m * 60 <= maxSeconds).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                tapLight();
                setMinutes(m);
              }}
              className={cn(
                "min-h-10 rounded-full border px-3.5 text-xs font-bold tabular",
                minutes === m
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface-2 text-muted",
              )}
            >
              {m}m
            </button>
          ))}
        </div>
        <label className="mb-4 flex items-center gap-2 text-xs text-faint">
          <span>Or</span>
          <DecimalInput
            aria-label="Minutes"
            value={minutes}
            onValueChange={(n) => setMinutes(Math.max(1, Math.min(240, Math.round(n ?? 1))))}
            className="h-10 w-20 text-center"
          />
          <span>minutes</span>
        </label>

        <div className="flex gap-2">
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              add(item);
              toast.success(`${label} queued · ${duration(seconds)}`);
              onClose();
            }}
          >
            <ListPlus className="size-4" /> Add to Focus
          </Button>
          <Button
            size="lg"
            variant="primary"
            className="flex-1"
            onClick={() => {
              runNow(item);
              if (running) toast.success(`${label} is next`);
              onClose();
            }}
          >
            <Play className="size-4" fill="currentColor" /> {running ? "Up next" : "Run now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
