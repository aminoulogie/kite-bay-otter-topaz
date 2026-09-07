import { useState } from "react";
import { Layers } from "lucide-react";
import { SomaIntelligenceEngine } from "@/lib/soma";
import { cn } from "@/lib/utils";
import type { SessionExercise } from "@/lib/types";

/**
 * The engine's plate palette is written against the Obsidian plugin's token
 * names (--soma-*), which do not exist in this app. Rather than fork the
 * engine — it is a straight copy of the plugin's and should stay that way —
 * the colours are remapped here to this app's tokens. Anything unrecognised
 * falls through unchanged, so a real hex from the engine still works.
 */
const TOKEN: Record<string, string> = {
  "var(--soma-danger)": "var(--color-danger)",
  "var(--soma-accent)": "var(--color-accent)",
  "var(--soma-text)": "var(--color-fg)",
  "var(--soma-text-dim)": "var(--color-muted)",
};

const mapColor = (c: string) => TOKEN[c] ?? c;

interface Plate {
  weight: number;
  color: string;
}

/**
 * Plates for one side of the bar, drawn largest-first the way you actually
 * load them. A bare bar is stated explicitly rather than rendered as nothing,
 * so an empty row never reads as a bug.
 */
function PlateRow({ plates, bar, unit }: { plates: Plate[]; bar: number; unit: string }) {
  if (!plates.length) {
    return (
      <span className="text-[0.7rem] font-semibold text-faint">
        just the {bar}
        {unit} bar
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {plates.map((p, i) => (
        <span
          key={i}
          className="tabular rounded-md px-1.5 py-0.5 text-[0.62rem] font-extrabold text-[#0b0c10]"
          style={{ background: mapColor(p.color) }}
        >
          {p.weight}
          {unit}
        </span>
      ))}
    </span>
  );
}

/**
 * How to actually load the bar for the target: plates per side, and the ramp
 * up to it. Collapsed by default — it is reference you consult once while
 * setting up, not something to keep on screen for every exercise.
 *
 * Only rendered for barbell lifts; there is no plate maths to do on a
 * dumbbell or a machine.
 */
export function PlateLoading({
  exercise,
  targetWeight,
  unit,
}: {
  exercise: SessionExercise;
  targetWeight: number;
  unit: string;
}) {
  const [open, setOpen] = useState(false);

  if (!exercise.usesBar || !targetWeight || targetWeight <= 0) return null;

  const bar = exercise.barWeight || 20;
  const plates = SomaIntelligenceEngine.calculatePlateStack(targetWeight, bar, unit) as Plate[];
  const ramp = SomaIntelligenceEngine.calculateWarmupRamp(targetWeight, bar, unit) as {
    pct: number;
    weight: number;
    plates: Plate[];
  }[];

  return (
    <div className="rounded-xl border border-border bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[0.7rem] font-bold text-muted">
          <Layers className="size-3.5" />
          Plates &amp; warm-up
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {/* Labelled. These were bare coloured numbers with no unit and no
              hint that they are one side of the bar, which reads as noise
              rather than as an instruction. */}
          <span className="shrink-0 text-[0.55rem] font-bold uppercase tracking-wide text-faint">
            per side
          </span>
          <PlateRow plates={plates} bar={bar} unit={unit} />
          <span className={cn("text-faint transition-transform", open && "rotate-180")}>⌄</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[0.62rem] font-bold uppercase tracking-wider text-faint">
              Per side · {bar}
              {unit} bar
            </span>
            <span className="tabular text-xs font-bold text-accent-text">
              {targetWeight}
              {unit}
            </span>
          </div>

          <div className="mb-2">
            <PlateRow plates={plates} bar={bar} unit={unit} />
          </div>
          <p className="mb-3 text-[0.6rem] leading-snug text-faint">
            Load these on <b className="text-muted">each end</b> of the {bar}
            {unit} bar. Both sides together plus the bar make {targetWeight}
            {unit}.
          </p>

          <div className="mb-1 text-[0.62rem] font-bold uppercase tracking-wider text-faint">
            Warm-up ramp
          </div>
          <p className="mb-1.5 text-[0.6rem] leading-snug text-faint">
            Sets to do before the working weight, at 40 / 60 / 80% of it, rounded to
            something you can actually load. A few reps each, not to failure.
          </p>
          {ramp.map((r) => (
            <div
              key={r.pct}
              className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-0"
            >
              <span className="tabular text-xs font-semibold text-muted">
                {r.pct}% ·{" "}
                <b className="text-fg">
                  {r.weight}
                  {unit}
                </b>
              </span>
              <PlateRow plates={r.plates} bar={bar} unit={unit} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
