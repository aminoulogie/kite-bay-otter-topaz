import { checkPreWorkout, preTargets, PRE_WINDOWS } from "./preworkout.ts";
import { totalWaterMl } from "./hydration.ts";
import type { DayInputs } from "./day-score.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

/**
 * Everything scoreDay needs for one date, assembled in exactly one place.
 *
 * This exists because there were two of them. The calendar square built its own
 * inputs and passed the real sleep figure; the day card underneath built its
 * own and passed `sleepHours: null`, behind a comment claiming sleep was not
 * tracked yet — which stopped being true when sleep logging was added. So the
 * same day scored 90 in the square and 88 on the card, from the same data, and
 * the card's "of 100 pts tracked" line quietly showed a smaller denominator.
 *
 * Two call sites computing the same score two ways will always drift. One
 * function, and both read from it.
 */

/** A day counts as having eaten only if something was actually logged. */
function foodTotals(day: NutritionDay | undefined) {
  const items = day?.items ?? [];
  return items.reduce(
    (t, i) => ({ cals: t.cals + (i.cals || 0), p: t.p + (i.p || 0) }),
    { cals: 0, p: 0 },
  );
}

/**
 * How well the pre-workout window was fuelled, 0-1, or null.
 *
 * Judged against the light-meal window rather than asking which one applied on
 * a day already past: it is the middle of the four and the only one that can be
 * assumed after the fact without inventing a training time.
 */
function preworkoutShare(day: NutritionDay | undefined, bodyweightKg: number): number | null {
  const items = day?.items ?? [];
  const anyPre = items.some((i) =>
    ["pre-workout", "pre workout", "preworkout"].includes(String(i.meal ?? "").toLowerCase()),
  );
  if (!anyPre) return null;
  const window = PRE_WINDOWS.find((w) => w.id === "snack") ?? PRE_WINDOWS[1]!;
  const check = checkPreWorkout(day, preTargets(bodyweightKg, window));
  // Over-eating the window is not better than hitting it, and breaking the fat
  // or fibre ceiling actively costs you, so a heavy verdict is capped.
  const carbs = Math.max(0, Math.min(1, check.carbsPct / 100));
  return check.verdict === "heavy" ? Math.min(carbs, 0.6) : carbs;
}

export interface BuildDayInputsArgs {
  date: string;
  session: HistorySession | null;
  /** Previous session on the same split, for the progression component. */
  previous: HistorySession | null;
  nutrition: Record<string, NutritionDay>;
  /** True when the programme had this day down as rest. */
  isRestDay?: boolean;
  /** Latest known bodyweight, for scaling the pre-workout target. */
  bodyweightKg?: number;
}

export function buildDayInputs({
  date, session, previous, nutrition, isRestDay, bodyweightKg = 0,
}: BuildDayInputsArgs): DayInputs {
  const day = nutrition[date];
  const logged = (day?.items?.length ?? 0) > 0;
  const totals = foodTotals(day);

  return {
    session,
    previous,
    isRestDay,
    protein:
      logged && day?.goals?.protein ? { grams: totals.p, target: day.goals.protein } : null,
    calories: logged && day?.goals?.cals ? { kcal: totals.cals, target: day.goals.cals } : null,
    sleepHours: day?.sleep?.hours ?? null,
    creatineG: day?.creatine ?? null,
    preworkout: isRestDay ? null : preworkoutShare(day, bodyweightKg),
  };
}

/** The most recent bodyweight on or before a date, for scaling targets. */
export function bodyweightOn(nutrition: Record<string, NutritionDay>, date: string): number {
  const keys = Object.keys(nutrition ?? {})
    .filter((k) => k <= date && nutrition[k]?.bodyWeight)
    .sort();
  const last = keys[keys.length - 1];
  return last ? (nutrition[last]!.bodyWeight ?? 0) : 0;
}

/** The previous session on the same split, which is what progression compares against. */
export function previousSameSplit(
  history: Record<string, HistorySession>,
  date: string,
): HistorySession | null {
  const current = history[date];
  if (!current) return null;
  const earlier = Object.entries(history)
    .filter(([d, s]) => d < date && s?.split === current.split)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return earlier[0]?.[1] ?? null;
}

/** Water for the day, for anything that reports hydration alongside the score. */
export function dayWater(nutrition: Record<string, NutritionDay>, date: string): number {
  return totalWaterMl(nutrition[date]);
}
