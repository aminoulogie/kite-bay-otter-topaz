/**
 * What the tape said, over time.
 *
 * The measurement panel took a reading and then showed you nothing but the
 * reading. A single circumference is almost meaningless — the useful fact is
 * always the difference, and working it out meant paging back through the
 * calendar a week at a time and holding numbers in your head.
 *
 * Two decisions worth stating:
 *
 *  - A missing date is a date not measured, never a zero. Measuring weekly is
 *    the recommendation, so most days have nothing, and treating those as
 *    readings of 0cm would produce a chart that plunges every Tuesday.
 *  - The delta is against the PREVIOUS reading, not against the first. "Up
 *    0.4 since last time" is actionable; "up 3.1 since March" is a fact about
 *    March.
 */

import type { NutritionDay } from "./types.ts";

/** How many readings per site are worth showing. Beyond this it is a chart. */
export const HISTORY_LIMIT = 8;

/** Below this a change is tape placement, not tissue. */
export const NOISE_CM = 0.25;

export interface TapeReading {
  date: string;
  value: number;
  /** Change from the previous reading. Null for the first one there is. */
  delta: number | null;
  /** Days since the previous reading, so a delta can be read in context. */
  gapDays: number | null;
}

export interface TapeSite {
  key: string;
  /** Most recent first — the way it is read. */
  readings: TapeReading[];
  latest: TapeReading | null;
  /** Change across the whole window shown, once there are two readings. */
  net: number | null;
  spanDays: number | null;
}

function dayGap(a: string, b: string): number | null {
  const x = Date.parse(`${a}T12:00:00`);
  const y = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round(Math.abs(y - x) / 86_400_000);
}

/**
 * Every reading for one site, newest first, capped at `limit`.
 *
 * Deltas are computed BEFORE the cap so the oldest row shown still knows what
 * it moved from — capping first would silently label an eight-week-old
 * reading as the first one ever taken.
 */
export function tapeHistory(
  nutrition: Record<string, NutritionDay>,
  key: string,
  limit = HISTORY_LIMIT,
): TapeSite {
  const raw = Object.entries(nutrition ?? {})
    .map(([date, day]) => ({ date, value: Number(day?.measurements?.[key]) }))
    .filter((r) => Number.isFinite(r.value) && r.value > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const withDeltas: TapeReading[] = raw.map((r, i) => {
    const prev = i > 0 ? raw[i - 1]! : null;
    return {
      date: r.date,
      value: r.value,
      delta: prev ? Math.round((r.value - prev.value) * 100) / 100 : null,
      gapDays: prev ? dayGap(prev.date, r.date) : null,
    };
  });

  const readings = withDeltas.slice(-limit).reverse();
  const latest = readings[0] ?? null;
  const oldest = readings[readings.length - 1] ?? null;
  const net =
    latest && oldest && readings.length > 1
      ? Math.round((latest.value - oldest.value) * 100) / 100
      : null;

  return {
    key,
    readings,
    latest,
    net,
    spanDays: latest && oldest && readings.length > 1 ? dayGap(oldest.date, latest.date) : null,
  };
}

/** Every site that has ever been measured, in the order given. */
export function tapeHistories(
  nutrition: Record<string, NutritionDay>,
  keys: string[],
  limit = HISTORY_LIMIT,
): TapeSite[] {
  return keys.map((k) => tapeHistory(nutrition, k, limit)).filter((s) => s.readings.length > 0);
}

/**
 * How to describe a change, honestly.
 *
 * A quarter of a centimetre is where the tape sits, not where the muscle is.
 * Reporting it as growth teaches the user to trust a figure that is noise,
 * which is worse than reporting nothing.
 */
export function deltaLabel(delta: number | null): string {
  if (delta == null) return "first reading";
  if (Math.abs(delta) < NOISE_CM) return "no real change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} cm`;
}

export function deltaTone(delta: number | null): "up" | "down" | "flat" {
  if (delta == null || Math.abs(delta) < NOISE_CM) return "flat";
  return delta > 0 ? "up" : "down";
}
