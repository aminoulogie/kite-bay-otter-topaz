import type { ExerciseLog } from "./training-log";
import type { NutritionDay } from "./types";

/**
 * Where the next few months go, if nothing changes.
 *
 * Every figure here is a projection from the user's OWN trend, never from a
 * population average or a textbook rate. "Beginners gain 1kg a month" is
 * useless to someone eighteen months in, and quoting it would make the app
 * confidently wrong about the one person it knows anything about.
 *
 * Projections decay rather than extrapolating straight: strength gains slow as
 * you approach your ceiling, and a linear projection of a good month says you
 * will bench 200kg by summer. The decay is what keeps a 90-day number
 * defensible.
 */

export const HORIZONS = [30, 60, 90, 180] as const;
export type Horizon = (typeof HORIZONS)[number];

/**
 * How much of the recent rate survives at each horizon.
 *
 * Not a formula — a judgement, stated openly. A month out, most of the current
 * rate holds; six months out, a third of it is already optimistic for anyone
 * past their first year.
 */
const DECAY: Record<Horizon, number> = { 30: 0.9, 60: 0.75, 90: 0.62, 180: 0.4 };

export interface Projection {
  horizon: Horizon;
  value: number;
  /** Change from today, in the same unit. */
  delta: number;
}

export interface TrendEstimate {
  label: string;
  unit: string;
  current: number;
  /** Change per 30 days, measured from history. */
  ratePerMonth: number;
  projections: Projection[];
  /** Days of data behind it — the honest measure of how much to trust it. */
  sampleDays: number;
  confidence: "none" | "low" | "medium" | "high";
  note?: string;
}

function confidenceFor(days: number, points: number): TrendEstimate["confidence"] {
  if (points < 3 || days < 14) return "none";
  if (days < 42) return "low";
  if (days < 90) return "medium";
  return "high";
}

/**
 * Least-squares slope per day over (date, value) points.
 *
 * A regression rather than last-minus-first, because a single heavy day at
 * either end would otherwise set the whole trend.
 */
function slopePerDay(points: { t: number; v: number }[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const meanT = points.reduce((a, p) => a + p.t, 0) / n;
  const meanV = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.v - meanV);
    den += (p.t - meanT) ** 2;
  }
  if (den === 0) return 0;
  // num/den is already change per MILLISECOND, so converting to per-day
  // multiplies. Dividing here made every rate come out as zero.
  return (num / den) * 86400000;
}

function project(
  label: string,
  unit: string,
  points: { t: number; v: number }[],
  opts: { note?: string; floorAtZero?: boolean } = {},
): TrendEstimate {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const current = sorted.length ? sorted[sorted.length - 1]!.v : 0;
  const spanDays = sorted.length
    ? Math.round((sorted[sorted.length - 1]!.t - sorted[0]!.t) / 86400000)
    : 0;
  const perDay = slopePerDay(sorted);
  const ratePerMonth = Math.round(perDay * 30 * 100) / 100;

  const projections = HORIZONS.map((h) => {
    const raw = current + perDay * h * DECAY[h];
    const value = opts.floorAtZero ? Math.max(0, raw) : raw;
    return {
      horizon: h,
      value: Math.round(value * 10) / 10,
      delta: Math.round((value - current) * 10) / 10,
    };
  });

  return {
    label,
    unit,
    current: Math.round(current * 10) / 10,
    ratePerMonth,
    projections,
    sampleDays: spanDays,
    confidence: confidenceFor(spanDays, sorted.length),
    note: opts.note,
  };
}

export function bodyweightEstimate(nutrition: Record<string, NutritionDay>): TrendEstimate {
  const points = Object.entries(nutrition || {})
    .filter(([, d]) => d?.bodyWeight)
    .map(([date, d]) => ({ t: new Date(date).getTime(), v: d!.bodyWeight! }));
  return project("Bodyweight", "kg", points, {
    note: "From your logged weight, not from a target — the scale decides this, not the plan.",
  });
}

/**
 * Lean mass is deliberately NOT estimated from bodyweight alone.
 *
 * Splitting a weight change into muscle and fat needs body composition, and
 * this app measures circumference, not bodyfat. Inferring it from weight would
 * be a guess dressed as a measurement — so this reports what was actually
 * measured, and says what it cannot know.
 */
export function leanMassNote(): string {
  return (
    "Muscle vs fat cannot be split from bodyweight alone, and nothing here measures " +
    "body composition. Use the circumference trends and progress photos instead — " +
    "an arm that grew while bodyweight held is the honest version of this number."
  );
}

export function strengthEstimates(log: ExerciseLog[], top = 6): TrendEstimate[] {
  const e1rm = (w: number, r: number) => (w && r ? w * (1 + r / 30) : 0);

  return log
    .map((ex) => {
      const points = Object.entries(ex.days)
        .map(([date, sets]) => ({
          t: new Date(date).getTime(),
          v: sets.reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0),
        }))
        .filter((p) => p.v > 0);
      return { ex, est: project(ex.name, "kg", points, { floorAtZero: true }) };
    })
    .filter((x) => x.est.confidence !== "none")
    // Most-trained first: those are the projections with something behind them.
    .sort((a, b) => Object.keys(b.ex.days).length - Object.keys(a.ex.days).length)
    .slice(0, top)
    .map((x) => x.est);
}

export function measurementEstimates(nutrition: Record<string, NutritionDay>): TrendEstimate[] {
  const bySite = new Map<string, { t: number; v: number }[]>();
  for (const [date, d] of Object.entries(nutrition || {})) {
    for (const [site, cm] of Object.entries(d?.measurements ?? {})) {
      if (!cm) continue;
      bySite.set(site, [...(bySite.get(site) ?? []), { t: new Date(date).getTime(), v: cm }]);
    }
  }
  return [...bySite.entries()]
    .map(([site, pts]) => project(site.replace(/_/g, " "), "cm", pts))
    .filter((e) => e.confidence !== "none");
}

export function confidenceNote(c: TrendEstimate["confidence"], days: number): string {
  if (c === "none") return "Not enough logged yet to project anything.";
  if (c === "low") return `Only ${days} days behind this — treat it as a direction, not a number.`;
  if (c === "medium") return `${days} days of data. Reasonable, but one bad month would move it.`;
  return `${days} days of data.`;
}
