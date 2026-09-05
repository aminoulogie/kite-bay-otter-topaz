import { useMemo } from "react";
import { MUSCLE_REGIONS } from "@/lib/recovery";
import type { Closeness, Limiter, SetQuality } from "@/lib/set-quality";
import { isGenuineFailure } from "@/lib/set-quality";
import { tapLight } from "@/lib/haptics";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

/**
 * Recording what ended a set.
 *
 * Four questions, each one tap, because this is filled in between sets with a
 * pump and a phone in one hand. Anything longer gets abandoned inside a week,
 * and a field nobody fills is worse than a field that does not exist.
 *
 * The verdict is never asked for. It is shown, derived from the answers, so
 * the reading stays honest even when the day felt heroic.
 */

const LIMITERS: { id: Limiter; label: string; hint: string }[] = [
  { id: "target", label: "Target muscle", hint: "the muscle you were training gave out" },
  { id: "synergist", label: "Another muscle", hint: "something else went first" },
  { id: "form", label: "Form broke", hint: "technique went before the muscle" },
  { id: "choice", label: "Chose to stop", hint: "left something in the tank" },
];

const CLOSENESS: { id: Closeness; label: string }[] = [
  { id: "reps_left", label: "2+ left" },
  { id: "one_left", label: "~1 left" },
  { id: "nothing", label: "Nothing left" },
  { id: "forced", label: "Forced / drop" },
];

const label = (key: string) =>
  MUSCLE_REGIONS.find((m) => m.key === key)?.label ?? key.replace(/_/g, " ");

export function SetQualitySheet({
  value,
  onChange,
  onClose,
  exerciseName,
  primaryKeys,
  allKeys,
  setNumber,
}: {
  value: SetQuality;
  onChange: (patch: Partial<SetQuality>) => void;
  onClose: () => void;
  exerciseName: string;
  /** the muscle the lift is programmed for */
  primaryKeys: string[];
  /** everything the lift touches, primaries included */
  allKeys: string[];
  setNumber: number;
}) {
  const sheetRef = useSheet(onClose);
  // The likely culprits are the muscles this lift already works that are not
  // the ones it is programmed for. Offering those first turns the common case
  // into one tap instead of a scroll through twenty-three muscles.
  const suspects = useMemo(() => {
    const p = new Set(primaryKeys);
    const seen = new Set<string>();
    return allKeys
      .filter((k) => !p.has(k))
      .filter((k) => {
        const l = label(k);
        if (seen.has(l)) return false; // triceps / triceps_back read as one muscle
        seen.add(l);
        return true;
      });
  }, [primaryKeys, allKeys]);

  const genuine = isGenuineFailure(value);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="soma-sheet max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />

        <div className="mb-3 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-extrabold">{exerciseName}</div>
            <div className="text-[0.7rem] text-muted">Set {setNumber}</div>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-bold text-accent-text">
            Done
          </button>
        </div>

        <Section title="What stopped it?">
          <div className="grid grid-cols-2 gap-1.5">
            {LIMITERS.map((l) => (
              <Choice
                key={l.id}
                on={value.limiter === l.id}
                onClick={() => onChange({ limiter: l.id, limitedBy: l.id === "synergist" ? value.limitedBy : undefined })}
                label={l.label}
                hint={l.hint}
              />
            ))}
          </div>
        </Section>

        {value.limiter === "synergist" && (
          <Section title="Which muscle went first?">
            <div className="flex flex-wrap gap-1.5">
              {suspects.map((k) => {
                const on = value.limitedBy?.includes(k) ?? false;
                return (
                  <Chip
                    key={k}
                    on={on}
                    onClick={() =>
                      onChange({
                        limitedBy: on
                          ? (value.limitedBy ?? []).filter((x) => x !== k)
                          : [...(value.limitedBy ?? []), k],
                      })
                    }
                  >
                    {label(k)}
                  </Chip>
                );
              })}
              {MUSCLE_REGIONS.filter(
                (m) => !suspects.includes(m.key) && !primaryKeys.includes(m.key),
              )
                .filter((m, i, a) => a.findIndex((x) => x.label === m.label) === i)
                .map((m) => {
                  const on = value.limitedBy?.includes(m.key) ?? false;
                  if (!on) return null;
                  return (
                    <Chip key={m.key} on onClick={() =>
                      onChange({ limitedBy: (value.limitedBy ?? []).filter((x) => x !== m.key) })}>
                      {m.label}
                    </Chip>
                  );
                })}
              <details className="w-full">
                <summary className="cursor-pointer py-1 text-[0.7rem] font-bold text-accent-text">
                  Something else…
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {MUSCLE_REGIONS.filter((m, i, a) => a.findIndex((x) => x.label === m.label) === i)
                    .filter((m) => !suspects.includes(m.key))
                    .map((m) => (
                      <Chip
                        key={m.key}
                        on={value.limitedBy?.includes(m.key) ?? false}
                        onClick={() => {
                          const on = value.limitedBy?.includes(m.key) ?? false;
                          onChange({
                            limitedBy: on
                              ? (value.limitedBy ?? []).filter((x) => x !== m.key)
                              : [...(value.limitedBy ?? []), m.key],
                          });
                        }}
                      >
                        {m.label}
                      </Chip>
                    ))}
                </div>
              </details>
            </div>
          </Section>
        )}

        <Section title="How close to failure?">
          <div className="grid grid-cols-4 gap-1.5">
            {CLOSENESS.map((c) => (
              <Choice key={c.id} on={value.closeness === c.id} onClick={() => onChange({ closeness: c.id })} label={c.label} />
            ))}
          </div>
        </Section>

        <Section title="Burn" hint="builds through a set — a heavy triple having none is normal">
          <Scale value={value.burn} onChange={(burn) => onChange({ burn })} labels={["none", "some", "on fire"]} />
        </Section>

        <Section title="Form" hint="judge the last reps, not the first">
          <Scale value={value.form} onChange={(form) => onChange({ form })} labels={["broke down", "some drift", "clean"]} />
        </Section>

        <div
          className={cn(
            "mb-2 rounded-xl border px-3 py-2.5 text-[0.72rem] font-semibold",
            genuine
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-border bg-surface-2 text-muted",
          )}
        >
          {genuine ? (
            <>True failure of {primaryKeys.map(label)[0] ?? "the target"} — this one counts fully.</>
          ) : value.limiter === "synergist" ? (
            <>
              Logged as a hard set that did not take{" "}
              {primaryKeys.map(label)[0] ?? "the target"} to failure. The stimulus goes to{" "}
              {(value.limitedBy ?? []).map(label).join(" and ") || "whatever gave out"}.
            </>
          ) : (
            <>Fill in what stopped the set to see how it counts.</>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-faint">
        {title}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-faint/80">— {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Choice({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        tapLight();
        onClick();
      }}
      className={cn(
        "rounded-xl border px-2.5 py-2 text-left transition-colors",
        on ? "border-accent bg-accent/15" : "border-border bg-surface-2",
      )}
    >
      <div className={cn("text-[0.75rem] font-bold", on ? "text-accent-text" : "text-fg")}>{label}</div>
      {hint && <div className="mt-0.5 text-[0.6rem] leading-tight text-faint">{hint}</div>}
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-[0.7rem] font-bold transition-colors",
        on ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-muted",
      )}
    >
      {children}
    </button>
  );
}

function Scale({
  value,
  onChange,
  labels,
}: {
  value?: 1 | 2 | 3;
  onChange: (v: 1 | 2 | 3) => void;
  labels: [string, string, string] | string[];
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {([1, 2, 3] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "rounded-xl border py-2 text-center transition-colors",
            value === n ? "border-accent bg-accent/15" : "border-border bg-surface-2",
          )}
        >
          <div className={cn("text-sm font-extrabold", value === n ? "text-accent-text" : "text-fg")}>{n}</div>
          <div className="text-[0.6rem] text-faint">{labels[n - 1]}</div>
        </button>
      ))}
    </div>
  );
}
