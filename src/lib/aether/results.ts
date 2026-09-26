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
  /** Scans averaged into the latest figure. */
  n: number;
}

/** Sweep scans, oldest first. */
export function sweepScans(scans: ScanRecord[]): ScanRecord[] {
  return scans.filter((x) => x.depth?.sweep).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/** Two scans this close together are a repeat, not a change. */
const REPEAT_GAP_MS = 45 * 60 * 1000;

/**
 * The latest pair of full scans taken back to back — a "baseline day". Their
 * difference is the owner's real repeatability, which beats any estimate:
 * it includes how they stand, breathe and hold their face, not just sensor noise.
 */
export function baselinePair(sweeps: ScanRecord[]): [ScanRecord, ScanRecord] | null {
  for (let k = sweeps.length - 1; k > 0; k--) {
    const a = sweeps[k - 1]!, b = sweeps[k]!;
    if (Date.parse(b.capturedAt) - Date.parse(a.capturedAt) <= REPEAT_GAP_MS) return [a, b];
  }
  return null;
}

/**
 * Scans within 45 minutes of each other are one SESSION: the same face,
 * measured again. Every figure is the session's average — two or three
 * back-to-back scans cut the noise by 30–40% — and its ± comes from how
 * much those scans disagreed, which is the honest error.
 */
export function sessions(sweeps: ScanRecord[]): ScanRecord[][] {
  const out: ScanRecord[][] = [];
  for (const x of sweeps) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && Date.parse(x.capturedAt) - Date.parse(prev.capturedAt) <= REPEAT_GAP_MS) last.push(x);
    else out.push([x]);
  }
  return out;
}

interface SessionReading extends Reading {
  n: number;
  /** Spread between the session's scans (sample SD), when there were two or more. */
  sd: number | null;
}

function readSession(session: ScanRecord[], def: MetricDef): SessionReading | null {
  const rs = session.map((x) => def.read(x.depth!.sweep!)).filter((r): r is Reading => r !== null);
  if (!rs.length) return null;
  const n = rs.length;
  const v = rs.reduce((a, r) => a + r.v, 0) / n;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, r) => a + (r.v - v) ** 2, 0) / (n - 1)) : null;
  const own = rs.every((r) => r.e != null) ? rs.reduce((a, r) => a + r.e!, 0) / n / Math.sqrt(n) : null;
  // The error of the mean: the larger of what each scan claims and what the
  // scans' disagreement shows.
  const e = sd != null ? Math.max(own ?? 0, sd / Math.sqrt(n)) : own;
  return { v, e, n, sd };
}

export function rows(sweeps: ScanRecord[]): Row[] {
  if (!sweeps.length) return [];
  const groups = sessions(sweeps);
  const latestSession = groups[groups.length - 1]!;
  const latest = latestSession[latestSession.length - 1]!.depth!.sweep!;
  const out: Row[] = [];
  for (const def of METRICS) {
    const now = readSession(latestSession, def);
    if (!now) continue;
    const firstSession = groups.slice(0, -1).find((g) => readSession(g, def));
    const first = firstSession ? readSession(firstSession, def) : null;
    const delta = first ? now.v - first.v : null;
    // Two independent readings: their errors add in quadrature; a change
    // under twice that is not distinguishable from noise. A reading without
    // its own ± borrows the scan's surface noise (mm), 1° (angles) or 0.02
    // (ratios) — never zero, which would call any wobble a change.
    const fallback = def.unit === "°" ? 1 : def.unit === "" ? 0.02 : (latest.cellNoiseMm ?? 0.5);
    let noise = Math.hypot(now.e ?? fallback, first ? (first.e ?? fallback) : 0);
    // Measured repeatability — the spread of scans taken back to back, from
    // the most recent session that had two or more — scaled to these two
    // averages. It includes how the face was held, not just the sensor.
    const rep = [...groups].reverse().map((g) => readSession(g, def)).find((r) => r?.sd != null)?.sd;
    if (rep != null && first) noise = Math.max(noise, rep * Math.sqrt(1 / now.n + 1 / first.n));
    const shown = delta == null ? 0 : Number(delta.toFixed(def.digits));
    const withinNoise = delta == null ? false : shown === 0 || Math.abs(delta) < 2 * noise;
    const verdict =
      delta == null || withinNoise || def.better == null || delta === 0
        ? "neutral"
        : (delta > 0) === (def.better === "up")
          ? "good"
          : "bad";
    out.push({ def, now: { v: now.v, e: now.e }, tag: def.tag(latest), delta, withinNoise, verdict, n: now.n });
  }
  return out;
}

export interface Point {
  t: number;
  date: string;
  v: number;
  lo: number;
  hi: number;
  /** Scans averaged into this point. */
  n: number;
}

/** One metric over time — one point per session, with its noise band — from `sinceMs` on. */
export function series(sweeps: ScanRecord[], def: MetricDef, sinceMs = 0): Point[] {
  const out: Point[] = [];
  for (const g of sessions(sweeps)) {
    const t = Date.parse(g[g.length - 1]!.capturedAt);
    if (t < sinceMs) continue;
    const rd = readSession(g, def);
    if (!rd) continue;
    const e = rd.e ?? 0;
    out.push({ t, date: g[0]!.date, v: rd.v, lo: rd.v - e, hi: rd.v + e, n: rd.n });
  }
  return out;
}

export function format(v: number, def: MetricDef): string {
  return `${v.toFixed(def.digits)}${def.unit === "°" ? "°" : def.unit ? ` ${def.unit}` : ""}`;
}
