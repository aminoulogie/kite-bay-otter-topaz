/**
 * Looking for a relationship between two things you track, honestly.
 *
 * This is the payoff for keeping training, food, money and reading in one app,
 * and it is also the easiest place in the whole thing to produce a confident
 * lie. Two weeks of data will happily yield r = 0.8 between anything and
 * anything; a screen that says "your session scores drop when you spend more"
 * on the strength of nine days is worse than a screen that says nothing,
 * because it will be believed and acted on.
 *
 * So the gates are deliberately unfriendly:
 *
 *   - at least MIN_PAIRS days where BOTH sides were logged. Not days where one
 *     was: a missing figure is not a zero, and pairing against zero is how you
 *     manufacture a correlation out of the days you forgot to log.
 *   - |r| at or above MIN_R. Below that it is a cloud.
 *   - both series have to actually vary. A month of identical sleep correlates
 *     with nothing, and the formula divides by zero trying.
 *
 * And what comes out is phrased as "these moved together", never as one
 * causing the other. Sleeping badly and spending more are both what a bad week
 * looks like; neither is the reason for the other.
 */

/** Fewer paired days than this and there is nothing to say. */
export const MIN_PAIRS = 14;
/** Below this the relationship is not worth a sentence. */
export const MIN_R = 0.45;

export interface Pair {
  a: number;
  b: number;
}

/**
 * Pearson's r, or null when it cannot be computed.
 *
 * Null rather than 0 for a constant series: "no relationship" and "the
 * question does not apply" are different answers, and 0 would be reported as
 * the former.
 */
export function pearson(pairs: Pair[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;

  let sa = 0;
  let sb = 0;
  for (const p of pairs) {
    sa += p.a;
    sb += p.b;
  }
  const ma = sa / n;
  const mb = sb / n;

  let num = 0;
  let da = 0;
  let db = 0;
  for (const p of pairs) {
    const x = p.a - ma;
    const y = p.b - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return null;
  const r = num / Math.sqrt(da * db);
  // Floating point can nudge a perfect correlation just past 1.
  return Math.max(-1, Math.min(1, r));
}

export interface Series {
  /** Values by date key. A date absent means not logged, which is not zero. */
  values: Map<string, number>;
  label: string;
}

/** Days where both series have a value, which is the only kind that counts. */
export function pairUp(a: Series, b: Series): Pair[] {
  const out: Pair[] = [];
  for (const [date, va] of a.values) {
    const vb = b.values.get(date);
    if (vb == null) continue;
    out.push({ a: va, b: vb });
  }
  return out;
}

export interface Finding {
  a: string;
  b: string;
  r: number;
  n: number;
  /** A sentence a person can read, with no causal claim in it. */
  text: string;
}

/**
 * The strongest relationship worth reporting, or null.
 *
 * One finding rather than a list. A ranked table of correlations invites
 * reading down it until something agrees with you, which is the opposite of
 * what this is for.
 */
export function strongestFinding(series: Series[]): Finding | null {
  let best: Finding | null = null;

  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const a = series[i]!;
      const b = series[j]!;
      const pairs = pairUp(a, b);
      if (pairs.length < MIN_PAIRS) continue;
      const r = pearson(pairs);
      if (r == null || Math.abs(r) < MIN_R) continue;
      if (best && Math.abs(r) <= Math.abs(best.r)) continue;
      best = {
        a: a.label,
        b: b.label,
        r,
        n: pairs.length,
        text:
          r > 0
            ? `${a.label} and ${b.label} have moved together across ${pairs.length} days.`
            : `${a.label} has been higher on days ${b.label} was lower, across ${pairs.length} days.`,
      };
    }
  }
  return best;
}

/** How far off "enough data" a pair of series is, for an honest empty state. */
export function shortfall(series: Series[]): number {
  let most = 0;
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      most = Math.max(most, pairUp(series[i]!, series[j]!).length);
    }
  }
  return Math.max(0, MIN_PAIRS - most);
}
