/**
 * The last seven days of eating, as one number each.
 *
 * A week is the unit that actually means something for food. One day under
 * target is lunch running late; five are a pattern, and neither is visible in
 * a chart of today. Averages are over the days that were LOGGED, not over
 * seven — dividing a four-day week by seven reports a deficit nobody ran and
 * makes a good week look like a failure.
 */

export interface DayTotals {
  cals: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  water: number;
}

export interface WeekGoals {
  cals: number;
  protein: number;
  water: number;
}

export interface WeekRow {
  date: string;
  totals: DayTotals;
  logged: boolean;
}

export interface WeekSummary {
  /** Days with anything logged at all. */
  loggedDays: number;
  /** Mean over the LOGGED days, or 0 when there are none. */
  avg: DayTotals;
  /** Days whose calories landed within tolerance of the target. */
  onTarget: number;
  /** Days that hit the protein goal. Protein is a floor, not a window. */
  proteinHit: number;
  /** Days that hit the water goal. */
  waterHit: number;
  /** The longest run of logged days ending on the most recent day. */
  streak: number;
}

/** Within this fraction of the calorie target counts as on target. */
export const CAL_TOLERANCE = 0.1;

const EMPTY: DayTotals = { cals: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0 };

function n(value: unknown): number {
  const x = Number(value);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

export function summariseWeek(rows: WeekRow[], goals: WeekGoals): WeekSummary {
  const list = (rows ?? []).filter((r) => r && r.logged);
  const days = list.length;
  if (!days) {
    return { loggedDays: 0, avg: { ...EMPTY }, onTarget: 0, proteinHit: 0, waterHit: 0, streak: 0 };
  }

  const sum = { ...EMPTY };
  let onTarget = 0;
  let proteinHit = 0;
  let waterHit = 0;
  const calGoal = n(goals?.cals);
  const band = calGoal * CAL_TOLERANCE;

  for (const r of list) {
    const t = r.totals ?? EMPTY;
    sum.cals += n(t.cals);
    sum.protein += n(t.protein);
    sum.carbs += n(t.carbs);
    sum.fat += n(t.fat);
    sum.fiber += n(t.fiber);
    sum.water += n(t.water);
    if (calGoal > 0 && Math.abs(n(t.cals) - calGoal) <= band) onTarget += 1;
    if (n(goals?.protein) > 0 && n(t.protein) >= n(goals.protein)) proteinHit += 1;
    if (n(goals?.water) > 0 && n(t.water) >= n(goals.water)) waterHit += 1;
  }

  const avg = Object.fromEntries(
    Object.entries(sum).map(([k, v]) => [k, Math.round(v / days)]),
  ) as unknown as DayTotals;

  // Counted backwards from the newest day, so a gap in the middle of the week
  // ends the run rather than being averaged away.
  let streak = 0;
  for (let i = (rows ?? []).length - 1; i >= 0; i--) {
    if (!rows[i]?.logged) break;
    streak += 1;
  }

  return { loggedDays: days, avg, onTarget, proteinHit, waterHit, streak };
}

/** A 0-1 bar height for a day against the week's own biggest value. */
export function barHeights(rows: WeekRow[], pick: (t: DayTotals) => number): number[] {
  const values = (rows ?? []).map((r) => (r?.logged ? n(pick(r.totals ?? EMPTY)) : 0));
  const top = Math.max(...values, 1);
  return values.map((v) => v / top);
}
