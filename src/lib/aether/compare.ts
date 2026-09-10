/**
 * Two captures, side by side, honestly.
 *
 * This is the thing the tab was missing and the only thing anyone actually
 * wants from it: not "what am I today" but "what changed". The trouble is that
 * almost every pair of captures is NOT comparable, and a difference computed
 * across two poses is a measurement of how you held the phone.
 *
 * So comparability is decided first and reported as a first-class result. A
 * pair that fails it still shows the images — looking at two photographs is
 * always legitimate — but the numbers are withheld and the reason is named.
 * That is the whole design: the failure mode being avoided is a reassuring
 * "+2.1% symmetry" that means the head was turned four degrees further.
 */

import type { ScanRecord } from "./scan-store.ts";

/** Beyond this much difference in head angle the readings are not the same measurement. */
export const MAX_POSE_DELTA_DEG = 4;

/** Under this a change is landmark jitter rather than a face. */
export const NOISE_PCT = 0.5;

export interface Comparability {
  ok: boolean;
  /** Named reasons, in the order they matter. Empty when ok. */
  reasons: string[];
  /** How far the two head poses differ, for the caller to show. */
  yawDelta: number | null;
  pitchDelta: number | null;
  rollDelta: number | null;
}

export interface MetricDelta {
  id: string;
  label: string;
  /** The older figure, then the newer. */
  from: number;
  to: number;
  delta: number;
  /** Percent change, when the metric is a ratio rather than already a percent. */
  pct: number | null;
  unit: string;
  /** True when the change is inside the noise floor for this metric. */
  noise: boolean;
  /** Which direction is an improvement, when there is one. Null when neutral. */
  better: "up" | "down" | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const absDelta = (a: number | null, b: number | null): number | null =>
  a == null || b == null ? null : Math.abs(a - b);

/**
 * Whether two captures can be compared at all.
 *
 * Order matters: kind first, because comparing a profile to a front shot is
 * not a marginal call, then the gates, then pose. A caller showing only the
 * first reason still shows the most fundamental one.
 */
export function comparability(a: ScanRecord, b: ScanRecord): Comparability {
  const reasons: string[] = [];

  const yawDelta = absDelta(num(a.face?.yawDeg), num(b.face?.yawDeg));
  const pitchDelta = absDelta(num(a.face?.pitchDeg), num(b.face?.pitchDeg));
  const rollDelta = absDelta(num(a.face?.rollDeg), num(b.face?.rollDeg));

  if (a.kind !== b.kind) reasons.push("Different poses — a profile and a front shot measure different things.");
  if (a.id === b.id) reasons.push("That is the same capture twice.");

  if (!a.face || !b.face) {
    reasons.push("One of these has no face measurements.");
  } else {
    if (!a.face.gates.ok || !b.face.gates.ok) {
      reasons.push("One capture was gated — its readings were not trusted when it was taken.");
    }
    for (const [name, d] of [["Yaw", yawDelta], ["Pitch", pitchDelta], ["Roll", rollDelta]] as const) {
      if (d != null && d > MAX_POSE_DELTA_DEG) {
        reasons.push(
          `${name} differs by ${d.toFixed(1)}° — beyond ${MAX_POSE_DELTA_DEG}° the difference is how you held the phone.`,
        );
      }
    }
  }

  return { ok: reasons.length === 0, reasons, yawDelta, pitchDelta, rollDelta };
}

interface MetricDef {
  id: string;
  label: string;
  unit: string;
  /** Noise floor in the metric's own units. */
  floor: number;
  better: "up" | "down" | null;
  read: (s: ScanRecord) => number | null;
}

/**
 * What is worth comparing, and which way is up.
 *
 * `better` is left null wherever there is no defensible answer. Under-eye
 * darkness responding to sleep is a real, published finding, so lower is
 * better there. Facial thirds being closer to canon is NOT an improvement in
 * any sense the evidence supports, so it is reported as movement only.
 */
export const METRICS: MetricDef[] = [
  {
    id: "symmetry",
    label: "Symmetry",
    unit: "%",
    floor: NOISE_PCT,
    better: "up",
    // alpha is a Procrustes distance: smaller is more symmetric. The published
    // figure is the percentage, computed the same way the Looks tab does it.
    read: (s) => (s.face ? Math.max(0, Math.min(100, 100 - s.face.alpha * 100)) : null),
  },
  {
    id: "underEye",
    label: "Under-eye darkness",
    unit: "%",
    floor: 1,
    better: "down",
    read: (s) => num(s.skin?.underEyeIndex),
  },
  {
    id: "erythema",
    label: "Redness",
    unit: "%",
    floor: 1,
    better: "down",
    read: (s) => num(s.skin?.erythemaIndex),
  },
  {
    id: "unevenness",
    label: "Evenness of tone",
    unit: "%",
    floor: 1,
    // Reported as unevenness, so down is the improvement.
    better: "down",
    read: (s) => {
      const u = num(s.skin?.unevenness);
      return u == null ? null : u * 100;
    },
  },
  {
    id: "shine",
    label: "Shine",
    unit: "%",
    floor: 1,
    better: null,
    read: (s) => {
      const v = num(s.skin?.shine);
      return v == null ? null : v * 100;
    },
  },
  {
    id: "puffiness",
    label: "Cheek width / intercanthal",
    unit: "",
    floor: 0.02,
    better: null,
    read: (s) => num(s.puffiness),
  },
];

/**
 * Every metric both captures carry, oldest first as `from`.
 *
 * A metric present on one capture and not the other is dropped rather than
 * shown as a change from nothing — the older captures predate the skin
 * measurements entirely, and "+34% redness" against an absent baseline would
 * be an invention.
 */
export function compareScans(a: ScanRecord, b: ScanRecord): MetricDelta[] {
  const [older, newer] = a.date <= b.date ? [a, b] : [b, a];
  const out: MetricDelta[] = [];

  for (const m of METRICS) {
    const from = m.read(older);
    const to = m.read(newer);
    if (from == null || to == null) continue;
    const delta = Math.round((to - from) * 100) / 100;
    out.push({
      id: m.id,
      label: m.label,
      from: Math.round(from * 100) / 100,
      to: Math.round(to * 100) / 100,
      delta,
      pct: from !== 0 ? Math.round((delta / Math.abs(from)) * 1000) / 10 : null,
      unit: m.unit,
      noise: Math.abs(delta) < m.floor,
      better: m.better,
    });
  }
  return out;
}

/** Whether a change is in the direction the metric calls good. Null when neutral or noise. */
export function verdict(d: MetricDelta): "better" | "worse" | null {
  if (d.noise || !d.better) return null;
  if (d.delta === 0) return null;
  const up = d.delta > 0;
  return (d.better === "up") === up ? "better" : "worse";
}

/**
 * The two captures worth offering by default: the newest, and the newest
 * comparable one before it.
 *
 * Not simply the newest two. The newest two are usually the front and the 45°
 * of the same sitting, which compare to nothing.
 */
export function defaultPair(scans: ScanRecord[]): [ScanRecord, ScanRecord] | null {
  const sorted = [...scans].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (comparability(sorted[i]!, sorted[j]!).ok) return [sorted[j]!, sorted[i]!];
    }
  }
  return null;
}
