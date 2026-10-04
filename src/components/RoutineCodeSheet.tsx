import { useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { tapSuccess, tapWarn } from "@/lib/haptics";
import {
  decodeRoutines, encodeRoutines, planImport, summarise,
  type ImportPlan, type RoutineCode,
} from "@/lib/routine-code";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Routines in and out as a pasteable code.
 *
 * This exists because of how a routine used to reach a phone: written into
 * the app's source, then waiting on a published build — which for the native
 * app is a manual job that takes the better part of an hour. A code arrives
 * in the time it takes to paste it.
 *
 * The import is deliberately two steps. Pasting shows what the code WOULD do
 * — how many routines, which ones already exist under that name, how many
 * exercises are new, how many it cannot describe — and only then offers to
 * apply it. An import that silently replaces a routine of the same name is
 * how someone loses the one they spent an evening building.
 */
export function RoutineCodeSheet({ onClose }: { onClose: () => void }) {
  // The FUNCTION is selected and called outside the selector. Calling
  // s.routines() inside one rebuilds a fresh object on every store change,
  // which loops React until it throws #185 — guarded by selector-identity.test.
  const routinesFn = useSoma((s) => s.routines);
  const importRoutineCode = useSoma((s) => s.importRoutineCode);
  const routines = routinesFn();

  const [tab, setTab] = useState<"in" | "out">("in");
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<RoutineCode | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const names = useMemo(() => Object.keys(routines), [routines]);

  const read = async (text: string) => {
    setPaste(text);
    setParsed(null);
    setPlan(null);
    setError(null);
    if (!text.trim()) return;
    const r = await decodeRoutines(text);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setParsed(r.code);
    setPlan(planImport(r.code, routines, useSoma.getState().allExercises()));
  };

  const apply = () => {
    if (!parsed) return;
    const done = importRoutineCode(parsed);
    tapSuccess();
    toast.success(`Imported — ${summarise(done)}`);
    onClose();
  };

  const build = async () => {
    const chosen = picked.length ? picked : names;
    const subset: Record<string, { name: string }[]> = {};
    for (const n of chosen) subset[n] = routines[n] ?? [];
    if (!Object.keys(subset).length) {
      tapWarn();
      toast.error("Nothing to export.");
      return;
    }
    setOut(await encodeRoutines(subset, useSoma.getState().allExercises()));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out);
      tapSuccess();
      toast.success("Code copied");
    } catch {
      // Clipboard is refused without a user gesture in some webviews, and on
      // http. The code is on screen and selectable either way, so this is a
      // nicety failing rather than the feature failing.
      toast.message("Select the code and copy it by hand.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Routine code"
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">Routine code</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {([["in", "Paste a code"], ["out", "Make a code"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "h-11 rounded-xl border text-sm font-bold",
                tab === id ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "in" ? (
          <>
            <textarea
              value={paste}
              onChange={(e) => void read(e.target.value)}
              placeholder="SOMA-R1:…"
              aria-label="Paste a routine code"
              rows={4}
              className="w-full rounded-xl border border-border bg-surface-2 p-3 font-mono text-[0.7rem] text-fg placeholder:text-faint focus:border-border-strong focus:outline-none"
            />

            {error && (
              <p className="mt-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[0.7rem] font-bold text-danger">
                {error}
              </p>
            )}

            {/* What it would do, before it does any of it. */}
            {parsed && plan && (
              <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3">
                <p className="text-sm font-bold">{summarise(plan)}</p>
                <ul className="mt-1.5 space-y-0.5 text-[0.68rem] text-muted">
                  {plan.added.map((n) => (
                    <li key={n} className="flex gap-1.5">
                      <Check className="mt-0.5 size-3 shrink-0 text-accent-text" />
                      {n}
                    </li>
                  ))}
                  {plan.replaced.map((n) => (
                    <li key={n} className="flex gap-1.5 font-bold text-warn">
                      <span aria-hidden>!</span>
                      {n} — replaces the one you have
                    </li>
                  ))}
                </ul>
                {plan.newExercises.length > 0 && (
                  <p className="mt-1.5 text-[0.65rem] leading-snug text-faint">
                    Brings {plan.newExercises.length} exercise
                    {plan.newExercises.length === 1 ? "" : "s"} with it: {plan.newExercises.join(", ")}.
                  </p>
                )}
                {plan.unknown.length > 0 && (
                  <p className="mt-1.5 text-[0.65rem] leading-snug text-warn">
                    {plan.unknown.join(", ")} came with no description, so {plan.unknown.length === 1 ? "it arrives" : "they arrive"} as
                    a bare name — no muscle, no picture.
                  </p>
                )}
                {parsed.note && (
                  <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[0.68rem] italic text-muted">
                    “{parsed.note}”
                  </p>
                )}
              </div>
            )}

            <Button variant="primary" className="mt-2 w-full" disabled={!parsed} onClick={apply}>
              {parsed && plan ? `Add ${plan.added.length + plan.replaced.length} to my routines` : "Paste a code first"}
            </Button>
          </>
        ) : (
          <>
            <p className="mb-2 text-[0.68rem] leading-snug text-faint">
              Pick the routines to send, or leave none picked to send them all. The code carries
              the exercises too, so they arrive with their muscles and pictures intact.
            </p>
            <div className="mb-2 max-h-56 space-y-1 overflow-y-auto">
              {names.map((n) => {
                const on = picked.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))
                    }
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                        on ? "border-accent bg-accent text-accent-ink" : "border-border",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{n}</span>
                    <span className="shrink-0 text-[0.65rem] tabular text-faint">
                      {routines[n]?.length ?? 0}
                    </span>
                  </button>
                );
              })}
              {names.length === 0 && <p className="text-xs text-faint">No routines to export yet.</p>}
            </div>

            <Button variant="primary" className="w-full" onClick={() => void build()}>
              {picked.length ? `Make a code for ${picked.length}` : `Make a code for all ${names.length}`}
            </Button>

            {out && (
              <>
                <textarea
                  readOnly
                  value={out}
                  rows={4}
                  aria-label="The routine code"
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-2 w-full rounded-xl border border-border bg-surface-2 p-3 font-mono text-[0.7rem] text-fg"
                />
                <Button className="mt-1.5 w-full" onClick={() => void copy()}>
                  <Copy className="mr-1.5 size-4" />
                  Copy the code
                </Button>
              </>
            )}
          </>
        )}

        <p className="mt-3 text-[0.6rem] leading-snug text-faint">
          A code is just text. Send it to yourself, keep it in a note, paste it on another phone —
          it does not need the app to be rebuilt, and nothing leaves the device unless you send it.
        </p>
      </div>
    </div>
  );
}
