/**
 * Creatine saturation and supply.
 *
 * The app recorded a daily dose and did nothing with it, so the saturation
 * figure never moved. Saturation is not a property of today's dose — it is the
 * accumulated result of every day before it, including the days that were
 * missed, which is why it has to be integrated over the log rather than read
 * off a single number.
 *
 * The model is deliberately simple and its constants are named, because the
 * physiology is approximate and the point is a believable trend rather than a
 * false precision:
 *
 *   - Muscle stores fill toward a ceiling. At a maintenance dose they reach
 *     roughly 90-95% in about four weeks, which is the widely reported figure.
 *   - A loading dose fills faster, but not proportionally: the ceiling is a
 *     ceiling, so four times the dose is not four times the rate.
 *   - Stores wash out slowly when nothing is taken. The half-life in muscle is
 *     weeks, not days, so missing one day barely moves it — which is the
 *     honest answer, and the opposite of what a naive streak counter says.
 */

export const MAINTENANCE_G = 5;

/** Fraction of the remaining gap closed per day at the maintenance dose. */
const FILL_RATE = 0.1; // ~94% after 28 days at 5g

/** Fraction lost per day when nothing is taken. ~30-day half-life. */
const WASHOUT_RATE = 0.023;

/**
 * Diminishing returns above maintenance.
 *
 * 20g/day loading fills in about a week rather than four, so it is faster but
 * far from four times faster.
 */
function fillFactor(doseG: number): number {
  if (doseG <= 0) return 0;
  return Math.min(2.2, Math.sqrt(doseG / MAINTENANCE_G));
}

export interface SaturationPoint {
  date: string;
  saturation: number; // 0-100
  doseG: number;
}

/**
 * Walk the log day by day, including days with no dose.
 *
 * Iterating only the logged days would silently treat a three-week gap as a
 * single missed day and report saturation that was never there.
 */
export function saturationSeries(
  dosesByDate: Record<string, number>,
  opts: { from?: string; to?: string; startAt?: number } = {},
): SaturationPoint[] {
  const dates = Object.keys(dosesByDate).sort();
  if (!dates.length) return [];

  const from = opts.from ?? dates[0]!;
  const to = opts.to ?? dates[dates.length - 1]!;
  const out: SaturationPoint[] = [];

  let sat = opts.startAt ?? 0;
  const cursor = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");

  while (cursor <= end) {
    const key = isoDay(cursor);
    const dose = dosesByDate[key] ?? 0;

    if (dose > 0) {
      sat += (100 - sat) * FILL_RATE * fillFactor(dose);
    } else {
      sat -= sat * WASHOUT_RATE;
    }
    sat = Math.max(0, Math.min(100, sat));

    out.push({ date: key, saturation: Math.round(sat * 10) / 10, doseG: dose });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function currentSaturation(dosesByDate: Record<string, number>, today?: string): number {
  const series = saturationSeries(dosesByDate, { to: today });
  return series.length ? series[series.length - 1]!.saturation : 0;
}

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ------------------------------------------------------------------- supply --

export interface SupplyStatus {
  gramsLeft: number;
  dailyAverage: number;
  daysLeft: number | null; // null when nothing has been taken yet
  runsOut: string | null; // ISO date
}

/**
 * How long the tub lasts.
 *
 * Based on the actual average intake over recent days rather than the nominal
 * 5g, because a dose that is skipped half the time really does last twice as
 * long, and telling the user otherwise would send them to a shop early.
 */
export function supplyStatus(
  gramsLeft: number,
  dosesByDate: Record<string, number>,
  today = isoDay(new Date()),
  window = 30,
): SupplyStatus {
  const cutoff = new Date(today + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - window);
  const from = isoDay(cutoff);

  const recent = Object.entries(dosesByDate).filter(([d]) => d >= from && d <= today);
  const total = recent.reduce((t, [, g]) => t + (g || 0), 0);
  // Averaged over the window, not over the days that happen to be logged, so
  // skipped days count as the zeros they were.
  const dailyAverage = window > 0 ? total / window : 0;

  if (gramsLeft <= 0 || dailyAverage <= 0) {
    return { gramsLeft, dailyAverage: Math.round(dailyAverage * 100) / 100, daysLeft: null, runsOut: null };
  }

  const daysLeft = Math.floor(gramsLeft / dailyAverage);
  const out = new Date(today + "T00:00:00");
  out.setDate(out.getDate() + daysLeft);

  return {
    gramsLeft,
    dailyAverage: Math.round(dailyAverage * 100) / 100,
    daysLeft,
    runsOut: isoDay(out),
  };
}

/** Plain-language read on where saturation sits. */
export function saturationLabel(pct: number): string {
  if (pct >= 90) return "saturated";
  if (pct >= 70) return "nearly there";
  if (pct >= 40) return "filling";
  if (pct > 0) return "low";
  return "empty";
}
