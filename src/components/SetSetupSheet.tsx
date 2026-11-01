import { Choice, Section } from "@/components/SetQualitySheet";
import { tapLight } from "@/lib/haptics";
import {
  AIDS, CHEATS, GRIP_HANDS, GRIP_WIDTHS, hasRecordedSetup, setVariant, setupSummary, variantLabel,
  type Aid, type Cheat, type SetSetup, type SetupOptions,
} from "@/lib/set-setup";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

/**
 * How a set was done: grip width, hand position, straps, belt, and whether
 * the lift was made easier (arch, swing). One sheet per set, opened from the
 * Setup button that replaced the grip toggle.
 *
 * Only what makes sense for the lift is shown (lib/set-setup.ts
 * setupOptions): straps on pulls, arch on presses, momentum on curls, rows and
 * raises, a belt where the lower back is loaded — recommended on the lifts
 * where it is a safety matter.
 *
 * Every choice taps on and taps off: absent stays "not recorded".
 */
export function SetSetupSheet({
  value,
  previous,
  options,
  onChange,
  onClose,
  exerciseName,
  setNumber,
}: {
  value: SetSetup;
  /** The set before this one, offered as a one-tap copy. */
  previous: SetSetup | null;
  options: SetupOptions;
  onChange: (setup: SetSetup) => void;
  onClose: () => void;
  exerciseName: string;
  setNumber: number;
}) {
  const sheetRef = useSheet(onClose);
  const aids = value.aids ?? [];
  const cheats = value.cheats ?? [];
  const current: SetSetup = { grip: value.grip, aids: value.aids, cheats: value.cheats };

  const put = (patch: SetSetup) => onChange({ ...current, ...patch });
  const toggleAid = (a: Aid) =>
    put({ aids: aids.includes(a) ? aids.filter((x) => x !== a) : [...aids, a] });
  const toggleCheat = (c: Cheat) =>
    put({ cheats: cheats.includes(c) ? cheats.filter((x) => x !== c) : [...cheats, c] });

  const hands = GRIP_HANDS.filter((h) => h.id !== "mixed" || options.mixed);
  const variant = setVariant(value);
  const beltMissing = options.beltRecommended && !aids.includes("belt");

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="soma-sheet max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,var(--safe-bottom,env(safe-area-inset-bottom)))] pt-2"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Setup for set ${setNumber}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />

        <div className="mb-3 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-extrabold">{exerciseName}</div>
            <div className="text-[0.7rem] text-muted">Set {setNumber} · setup</div>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-bold text-accent-text">
            Done
          </button>
        </div>

        {options.width && (
          <Section title="Grip width">
            <div className="grid grid-cols-4 gap-1.5">
              {GRIP_WIDTHS.map((w) => (
                <Choice
                  key={w.id}
                  on={value.grip?.width === w.id}
                  onClick={() =>
                    put({ grip: { ...value.grip, width: value.grip?.width === w.id ? undefined : w.id } })
                  }
                  label={w.label}
                />
              ))}
            </div>
          </Section>
        )}

        {options.hand && (
          <Section title="Hands">
            <div className={cn("grid gap-1.5", hands.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
              {hands.map((h) => (
                <Choice
                  key={h.id}
                  on={value.grip?.orientation === h.id}
                  onClick={() =>
                    put({
                      grip: { ...value.grip, orientation: value.grip?.orientation === h.id ? undefined : h.id },
                    })
                  }
                  label={h.label}
                  hint={h.hint}
                />
              ))}
            </div>
          </Section>
        )}

        {(options.straps || options.belt) && (
          <Section title="Gear" hint="none ticked = bare hands, no belt">
            <div className="grid grid-cols-2 gap-1.5">
              {AIDS.filter((a) => (a.id === "straps" ? options.straps : options.belt)).map((a) => (
                <Choice
                  key={a.id}
                  on={aids.includes(a.id)}
                  onClick={() => toggleAid(a.id)}
                  label={a.id === "belt" && options.beltRecommended ? `${a.label} · recommended` : a.label}
                  hint={a.hint}
                />
              ))}
            </div>
            {beltMissing && (
              <p className="mt-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[0.65rem] leading-snug text-warn">
                A belt is recommended on this lift: it loads the lower back, and bracing against a belt
                protects it on heavy sets.
              </p>
            )}
          </Section>
        )}

        {(options.arch || options.momentum) && (
          <Section title="Made it easier?" hint="be honest, it only keeps the numbers fair">
            <div className="grid grid-cols-2 gap-1.5">
              {CHEATS.filter((c) => (c.id === "arch" ? options.arch : options.momentum)).map((c) => (
                <Choice
                  key={c.id}
                  on={cheats.includes(c.id)}
                  onClick={() => toggleCheat(c.id)}
                  label={c.label}
                  hint={c.hint}
                />
              ))}
            </div>
          </Section>
        )}

        <div className="mb-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-faint">Counts toward</span>
            <span className="font-display text-sm font-extrabold text-accent-text">
              {variantLabel(variant)} record
            </span>
          </div>
          <p className="mt-1.5 text-[0.6rem] leading-snug text-faint">
            {cheats.length
              ? "A cheated set gets its own PRs and weight suggestions, its Technique score goes down, and taking it to failure does not count as a true failure, so the plan keeps asking for strict reps."
              : aids.includes("straps")
                ? "Straps take grip out of the lift so your back can work to failure. They are not penalised; strapped sets just get their own PRs and weight suggestions."
                : "Grip and belt describe the set; they don't split your records. Straps and cheats do."}
          </p>
        </div>

        <div className="flex gap-1.5">
          {previous && hasRecordedSetup(previous) && (
            <button
              type="button"
              onClick={() => {
                tapLight();
                onChange({ grip: previous.grip, aids: previous.aids, cheats: previous.cheats });
              }}
              className="flex-1 rounded-xl border border-border bg-surface-2 px-2.5 py-2 text-left"
            >
              <div className="text-[0.72rem] font-bold">Same as set {setNumber - 1}</div>
              <div className="truncate text-[0.6rem] text-faint">{setupSummary(previous)}</div>
            </button>
          )}
          {hasRecordedSetup(value) && (
            <button
              type="button"
              onClick={() => {
                tapLight();
                onChange({});
              }}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[0.72rem] font-bold text-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
