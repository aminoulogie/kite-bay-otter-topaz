import { useId, useMemo, useState } from "react";
import anatomy from "@/lib/bodymap/anatomy.json";
import { cn } from "@/lib/utils";

/**
 * Anatomical recovery heatmap.
 *
 * The geometry — outlines, static parts and every muscle path — is the user's
 * own hand-built SVG, imported verbatim from the Obsidian vault. It is not
 * regenerated or simplified: those coordinates took real work and are the
 * point of the feature.
 *
 * What changed in the port is the data behind it. The original coloured
 * muscles from a hardcoded recovery value; here every muscle is driven by
 * computeBiologicalReadiness over actual logged sessions, so the body reflects
 * what was really trained rather than a demo state.
 */

interface Muscle {
  name: string;
  region: string;
  defaultHours: number;
  view: "front" | "back";
  tier: string;
  desc: string;
  paths: string[];
}

const MUSCLES = anatomy.MUSCLES as unknown as Record<string, Muscle>;
const STATIC_PARTS = anatomy.STATIC_PARTS as unknown as Record<
  string,
  Record<string, { d: string; color: string }>
>;

const FRONT_VIEWBOX = "0 0 724 1448";
const BACK_VIEWBOX = "724 0 724 1448";

// The original tier palette and thresholds, unchanged.
const HEAT_TIERS = {
  fresh: { base: "#22c55e", light: "#a7f3c8", dark: "#0f2e1c", label: "Fresh" },
  low: { base: "#eab308", light: "#fde68a", dark: "#3f2f08", label: "Low" },
  moderate: { base: "#f97316", light: "#fdc493", dark: "#3f200a", label: "Moderate" },
  high: { base: "#ef4444", light: "#fca5a5", dark: "#3f1212", label: "High" },
};

function getTier(recovery: number) {
  if (recovery >= 85) return HEAT_TIERS.fresh;
  if (recovery >= 60) return HEAT_TIERS.low;
  if (recovery >= 35) return HEAT_TIERS.moderate;
  return HEAT_TIERS.high;
}

const LEGEND = [
  { tier: HEAT_TIERS.high, sub: "Severe fatigue" },
  { tier: HEAT_TIERS.moderate, sub: "Noticeable" },
  { tier: HEAT_TIERS.low, sub: "Mild" },
  { tier: HEAT_TIERS.fresh, sub: "Recovered" },
];

export function BodyHeatmap({
  readiness,
}: {
  /** muscle key -> 0-100 recovery, from the real training history */
  readiness: Record<string, number>;
}) {
  const [view, setView] = useState<"front" | "back">("front");
  const [selected, setSelected] = useState<string | null>(null);
  // Gradient ids must be unique per mount, or a second instance on the page
  // steals the first one's fills.
  const uid = useId().replace(/:/g, "");

  const keys = useMemo(
    () => Object.keys(MUSCLES).filter((k) => MUSCLES[k]!.view === view),
    [view],
  );

  const recoveryOf = (k: string) => Math.round(readiness[k] ?? 100);

  const detailKey = selected && MUSCLES[selected]?.view === view ? selected : null;
  const detail = detailKey ? MUSCLES[detailKey]! : null;
  const detailRecovery = detailKey ? recoveryOf(detailKey) : 0;
  const detailTier = detail ? getTier(detailRecovery) : HEAT_TIERS.fresh;

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-1.5">
        {(["front", "back"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[0.7rem] font-bold uppercase tracking-wider transition-colors",
              view === v
                ? "border-accent bg-accent text-accent-ink"
                : "border-border bg-surface-2 text-muted",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="mx-auto w-full max-w-[260px]">
        <svg
          viewBox={view === "front" ? FRONT_VIEWBOX : BACK_VIEWBOX}
          className="h-auto w-full overflow-visible drop-shadow-[0_14px_25px_rgba(0,0,0,0.65)]"
          role="img"
          aria-label={`${view} view muscle recovery map`}
        >
          <defs>
            {keys.map((k) => {
              const t = getTier(recoveryOf(k));
              return (
                <radialGradient key={k} id={`g-${uid}-${k}`} cx="32%" cy="26%" r="80%">
                  <stop offset="0%" stopColor={t.light} stopOpacity="1" />
                  <stop offset="30%" stopColor={t.base} stopOpacity="1" />
                  <stop offset="62%" stopColor={t.base} stopOpacity="0.96" />
                  <stop offset="85%" stopColor={t.dark} stopOpacity="0.97" />
                  <stop offset="100%" stopColor={t.dark} stopOpacity="1" />
                </radialGradient>
              );
            })}
            {/* Muscle-fibre striations, the detail that makes it read as tissue
                rather than flat shapes. */}
            <pattern
              id={`fiber-${uid}`}
              width="5"
              height="5"
              patternTransform="rotate(58)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="5" height="5" fill="transparent" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="#000" strokeWidth="0.8" strokeOpacity="0.75" />
              <line x1="2.5" y1="0" x2="2.5" y2="5" stroke="#fff" strokeWidth="0.5" strokeOpacity="0.38" />
            </pattern>
          </defs>

          <path
            d={view === "front" ? anatomy.FRONT_OUTLINE : anatomy.BACK_OUTLINE}
            fill="#1a2030"
            stroke="#2c3646"
            strokeWidth="2.5"
          />

          {Object.entries(STATIC_PARTS[view] ?? {}).map(([name, part]) => (
            <path key={name} d={part.d} fill={part.color} />
          ))}

          {keys.map((k) => {
            const m = MUSCLES[k]!;
            const t = getTier(recoveryOf(k));
            const isSel = k === detailKey;
            return (
              <g key={k}>
                {m.paths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill={`url(#g-${uid}-${k})`}
                    stroke={isSel ? "#38bdf8" : t.dark}
                    strokeWidth={isSel ? 2.5 : 0.6}
                    onClick={() => setSelected(isSel ? null : k)}
                    className="cursor-pointer transition-[filter,opacity]"
                    style={{
                      color: t.base,
                      filter: isSel
                        ? "saturate(1.35) brightness(1.35)"
                        : "saturate(0.9) brightness(0.95)",
                      opacity: isSel ? 1 : 0.95,
                    }}
                  />
                ))}
                {m.paths.map((d, i) => (
                  <path
                    key={`f${i}`}
                    d={d}
                    fill={`url(#fiber-${uid})`}
                    className="pointer-events-none"
                    style={{ mixBlendMode: "overlay", opacity: 0.45 }}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {LEGEND.map((l) => (
          <span key={l.tier.label} className="flex items-center gap-1.5 text-[0.65rem] text-muted">
            <span className="size-2 rounded-full" style={{ background: l.tier.base }} />
            <b className="text-fg">{l.tier.label}</b> {l.sub}
          </span>
        ))}
      </div>

      {detail ? (
        <div
          className="rounded-2xl border bg-surface-2 p-3"
          style={{ borderColor: detailTier.base + "80" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-sm font-extrabold">{detail.name}</div>
              <div className="mt-0.5 text-[0.7rem] font-bold text-accent-text">
                {detail.defaultHours}h recovery window · {detailRecovery}% ready
              </div>
              <p className="mt-1 text-[0.7rem] leading-snug text-muted">{detail.desc}</p>
            </div>
            <span
              className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[0.7rem] font-bold text-white"
              style={{ background: detailTier.base }}
            >
              {detailTier.label}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-center text-[0.7rem] text-faint">
          Tap a muscle for its recovery window.
        </p>
      )}
    </div>
  );
}
