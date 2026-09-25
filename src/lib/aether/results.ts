/**
 * The Results screen's numbers: one definition per metric, so the cards, the
 * change arrows, "within noise" and the charts all agree.
 *
 * Each metric says which way is BETTER for the owner's goals (jaw, chin,
 * neck, posture), or null where a change is neither good nor bad.
 */

import type { ScanRecord } from "./scan-store.ts";
import type { SweepSummary } from "./cylmap.ts";

export type Tag = "Measured" | "Estimated" | "Calculated";
export type Group = "Face" | "Side profile" | "Neck" | "Posture";

export interface Reading {
  v: number;
  /** ± for this one scan, when it has one. */
  e: number | null;
}

export interface MetricDef {
  key: string;
  group: Group;
  label: string;
  unit: "mm" | "°" | "cm" | "";
  digits: number;
  better: "up" | "down" | null;
  /** What the reading is — a straight 3D measurement, an estimate, or a ratio. */
  tag: (s: SweepSummary) => Tag;
  read: (s: SweepSummary) => Reading | null;
  /** Plain words on what the number is, for the chart's help. */
  about: string;
}

const r = (v: number | null | undefined, e: number | null | undefined = null): Reading | null =>
  v == null || !Number.isFinite(v) ? null : { v, e: e ?? null };

export const METRICS: MetricDef[] = [
  {
    key: "asym", group: "Face", label: "Facial asymmetry", unit: "mm", digits: 2, better: "down",
    tag: () => "Measured",
    read: (s) => r(s.symmetry?.rmsMm, s.symmetryNoiseMm),
    about: "How far each side of the face departs from the mirror of the other, on average, with the scan's own noise taken out.",
  },
  {
    key: "cheek", group: "Face", label: "Cheek width", unit: "mm", digits: 1, better: null,
    tag: () => "Measured",
    read: (s) => r(s.cheekWidthMm, s.cellNoiseMm),
    about: "Widest point across the cheekbones, stopping short of the ears.",
  },
  {
    key: "jaw", group: "Face", label: "Jaw width", unit: "mm", digits: 1, better: "up",
    tag: () => "Measured",
    read: (s) => r(s.jawWidthMm, s.cellNoiseMm),
    about: "Widest point across the lower jaw, below the ears. Needs the scan to reach round both sides.",
  },
  {
    key: "chin", group: "Side profile", label: "Chin behind nose", unit: "mm", digits: 1, better: "down",
    tag: () => "Measured",
    read: (s) => r(s.chinBehindNoseMm, s.cellNoiseMm),
    about: "How far the chin's most forward point sits behind the nose tip. Smaller means a more projected chin.",
  },
  {
    key: "chinneck", group: "Side profile", label: "Chin–neck angle", unit: "°", digits: 1, better: "down",
    tag: () => "Measured",
    read: (s) => r(s.full?.chinNeckDeg, s.full?.chinNeckNoiseDeg),
    about: "The angle between the under-chin line and the front of the neck. A sharper (smaller) angle reads as a more defined jaw and neck.",
  },
  {
    key: "underchin", group: "Side profile", label: "Under-chin length", unit: "mm", digits: 0, better: "up",
    tag: () => "Measured",
    read: (s) => r(s.full?.underChinMm),
    about: "From the chin point back to the chin–neck corner.",
  },
  {
    key: "neckw", group: "Neck", label: "Neck width", unit: "mm", digits: 0, better: "up",
    tag: () => "Measured",
    read: (s) => r(s.full?.neckWidthMm, s.full?.neckWidthNoiseMm),
    about: "Side to side at the neck's narrowest, below the chin–neck corner.",
  },
  {
    key: "neckd", group: "Neck", label: "Neck depth", unit: "mm", digits: 0, better: "up",
    tag: (s) => (s.full?.neckDepthPartial ? "Estimated" : "Measured"),
    read: (s) => r(s.full?.neckDepthMm),
    about: "Front to back at the same height. Marked estimated when the scan did not reach round to the back.",
  },
  {
    key: "neckjaw", group: "Neck", label: "Neck-to-jaw ratio", unit: "", digits: 2, better: "up",
    tag: () => "Calculated",
    read: (s) => r(s.full?.neckToJaw ?? s.full?.neckToCheek),
    about: "Neck width over jaw width (cheek width when the jaw was not reached).",
  },
  {
    key: "lean", group: "Posture", label: "Neck lean (fwd)", unit: "°", digits: 1, better: "down",
    tag: () => "Measured",
    read: (s) => r(s.full?.neckLeanDeg),
    about: "The front of the neck against true vertical, standing naturally. Forward head posture shows as a bigger lean.",
  },
  {
    key: "pitch", group: "Posture", label: "Head tipped fwd", unit: "°", digits: 1, better: null,
    tag: () => "Measured",
    read: (s) => r(s.full?.headPitchDeg),
    about: "The face's own up-axis against vertical while looking at the eye-level sticker.",
  },
];

export interface Row {
  def: MetricDef;
  now: Reading;
  tag: Tag;
  /** Latest minus the first scan that had this metric. */
  delta: number | null;
  /** True when the change is inside what the two scans' noise can explain. */
  withinNoise: boolean;
  /** "good" / "bad" / "neutral" for the arrow's colour. */
  verdict: "good" | "bad" | "neutral";
}

/** Sweep scans, oldest first. */
export function sweepScans(scans: ScanRecord[]): ScanRecord[] {
  return scans.filter((x) => x.depth?.sweep).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export function rows(sweeps: ScanRecord[]): Row[] {
  if (!sweeps.length) return [];
  const latest = sweeps[sweeps.length - 1]!.depth!.sweep!;
  const out: Row[] = [];
  for (const def of METRICS) {
    const now = def.read(latest);
    if (!now) continue;
    const firstScan = sweeps.slice(0, -1).find((x) => def.read(x.depth!.sweep!));
    const first = firstScan ? def.read(firstScan.depth!.sweep!) : null;
    const delta = first ? now.v - first.v : null;
    // Two independent readings: their errors add in quadrature; a change
    // under twice that is not distinguishable from noise. A reading without
    // its own ± borrows the scan's surface noise (mm), 1° (angles) or 0.02
    // (ratios) — never zero, which would call any wobble a change.
    const fallback = def.unit === "°" ? 1 : def.unit === "" ? 0.02 : (latest.cellNoiseMm ?? 0.5);
    const noise = Math.hypot(now.e ?? fallback, first ? (first.e ?? fallback) : 0);
    const shown = delta == null ? 0 : Number(delta.toFixed(def.digits));
    const withinNoise = delta == null ? false : shown === 0 || Math.abs(delta) < 2 * noise;
    const verdict =
      delta == null || withinNoise || def.better == null || delta === 0
        ? "neutral"
        : (delta > 0) === (def.better === "up")
          ? "good"
          : "bad";
    out.push({ def, now, tag: def.tag(latest), delta, withinNoise, verdict });
  }
  return out;
}

export interface Point {
  t: number;
  date: string;
  v: number;
  lo: number;
  hi: number;
}

/** One metric over time, with its noise band, from `sinceMs` on. */
export function series(sweeps: ScanRecord[], def: MetricDef, sinceMs = 0): Point[] {
  const out: Point[] = [];
  for (const x of sweeps) {
    const t = Date.parse(x.capturedAt);
    if (t < sinceMs) continue;
    const rd = def.read(x.depth!.sweep!);
    if (!rd) continue;
    const e = rd.e ?? 0;
    out.push({ t, date: x.date, v: rd.v, lo: rd.v - e, hi: rd.v + e });
  }
  return out;
}

export function format(v: number, def: MetricDef): string {
  return `${v.toFixed(def.digits)}${def.unit === "°" ? "°" : def.unit ? ` ${def.unit}` : ""}`;
}
