/**
 * How far the readings actually scatter around the trend.
 *
 * A line through your estimated 1RMs looks like a fact. It is a fit, and the
 * points it was fitted to are all over the place — hydration, sleep, whether
 * the set was rated honestly, whether the bar was loaded the same. Drawn as a
 * clean line, the chart claims a precision the data does not have, and every
 * conversation about "am I progressing" then happens against that claim.
 *
 * So the band is the residual spread: one standard deviation of the points
 * around their own fit. Not a confidence interval on the slope — that would be
 * a different and narrower thing, and would suggest a statistical framework
 * this app is not doing. This says only "readings land about this far from the
 * line", which is exactly what it measures.
 *
 * It is withheld entirely below `medium` confidence. Three points scattered
 * over ten days have a residual spread, arithmetically, and drawing it would
 * dress up noise as a measured range.
 */

export type Confidence = "none" | "low" | "medium" | "high";

/** Below this the band is not drawn at all. */
export const MIN_CONFIDENCE: Confidence[] = ["medium", "high"];

/** A band needs enough points that the spread means something. */
export const MIN_POINTS = 6;

export interface Fit {
  /** Value per millisecond. */
  slope: number;
  intercept: number;
}

export interface BandPoint {
  t: number;
  fit: number;
  lo: number;
  hi: number;
  /** [lo, hi] as recharts wants an Area range, so the caller does not rebuild it. */
  range: [number, number];
}

export interface Band {
  points: BandPoint[];
  /** One standard deviation of the residuals, in the series' own unit. */
  sd: number;
  fit: Fit;
}

export function fitLine(points: { t: number; v: number }[]): Fit | null {
  const n = points.length;
  if (n < 2) return null;
  const meanT = points.reduce((a, p) => a + p.t, 0) / n;
  const meanV = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.v - meanV);
    den += (p.t - meanT) ** 2;
  }
  // Every reading on the same day is a legitimate series; it just has no
  // slope. Returning a flat fit is right, and dividing by zero is not.
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanV - slope * meanT };
}

/**
 * Residual standard deviation, with the two degrees of freedom the fit used.
 *
 * n-2 rather than n: two points define a line exactly, so their residuals are
 * zero and a band drawn from them would be a line claiming perfect precision.
 */
export function residualSd(points: { t: number; v: number }[], fit: Fit): number {
  const n = points.length;
  if (n < 3) return 0;
  let ss = 0;
  for (const p of points) {
    const r = p.v - (fit.intercept + fit.slope * p.t);
    ss += r * r;
  }
  return Math.sqrt(ss / (n - 2));
}

/**
 * The band, or null when it should not be drawn.
 *
 * Null rather than an empty array so a caller cannot render "a band of
 * nothing" and have it read as "no uncertainty".
 */
export function residualBand(
  points: { t: number; v: number }[],
  confidence: Confidence,
): Band | null {
  if (!MIN_CONFIDENCE.includes(confidence)) return null;
  const clean = points
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (clean.length < MIN_POINTS) return null;

  const fit = fitLine(clean);
  if (!fit) return null;
  const sd = residualSd(clean, fit);
  // A perfectly straight series has no spread and needs no band; drawing a
  // zero-width one would be a line on top of a line.
  if (!(sd > 0)) return null;

  return {
    sd: Math.round(sd * 100) / 100,
    fit,
    points: clean.map((p) => {
      const f = fit.intercept + fit.slope * p.t;
      const lo = Math.round((f - sd) * 100) / 100;
      const hi = Math.round((f + sd) * 100) / 100;
      return { t: p.t, fit: Math.round(f * 100) / 100, lo, hi, range: [lo, hi] as [number, number] };
    }),
  };
}

/**
 * Confidence from span and count, matching lib/estimates.ts.
 *
 * Duplicated deliberately rather than imported: estimates.ts computes it for a
 * projection, this needs it for an arbitrary plotted series, and coupling the
 * chart to the projection machinery to share four lines would be the worse
 * trade. A test asserts the two agree.
 */
export function confidenceOf(points: { t: number }[]): Confidence {
  if (points.length < 3) return "none";
  const ts = points.map((p) => p.t).filter(Number.isFinite);
  if (ts.length < 3) return "none";
  const days = Math.round((Math.max(...ts) - Math.min(...ts)) / 86400000);
  if (days < 14) return "none";
  if (days < 42) return "low";
  if (days < 90) return "medium";
  return "high";
}

/** One line for the caption, so the band is never an unexplained shadow. */
export function bandNote(band: Band | null, unit: string): string | null {
  if (!band) return null;
  return `Shaded band is ±${band.sd}${unit ? ` ${unit}` : ""} — how far readings actually land from the trend, not a forecast.`;
}
