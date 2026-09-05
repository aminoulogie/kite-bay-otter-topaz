import type { FoodItem, NutritionDay } from "./types";

/**
 * What to eat before training, and how long before.
 *
 * Scaled to bodyweight rather than fixed, because "40g of carbs" means
 * something different at 60kg and at 100kg, and a fixed number is wrong for
 * everyone but the person it was written for.
 *
 * The timing is the part most guides get vague about, so it is stated per
 * window: what is useful three hours out is not what is useful twenty minutes
 * out, and eating the three-hour meal at twenty minutes is how people end up
 * training on a full stomach.
 */

export interface PreWindow {
  id: string;
  label: string;
  /** Minutes before the session this window covers. */
  fromMin: number;
  toMin: number;
  carbsPerKg: number;
  proteinPerKg: number;
  /** Fat and fibre slow gastric emptying; close to a session that is a cost. */
  maxFatG: number;
  maxFiberG: number;
  note: string;
}

export const PRE_WINDOWS: PreWindow[] = [
  {
    id: "meal",
    label: "Full meal",
    fromMin: 120,
    toMin: 240,
    carbsPerKg: 1.5,
    proteinPerKg: 0.4,
    maxFatG: 25,
    maxFiberG: 12,
    note: "Far enough out that fat and fibre are fine — this is just a normal meal.",
  },
  {
    id: "snack",
    label: "Light meal",
    fromMin: 60,
    toMin: 120,
    carbsPerKg: 0.8,
    proteinPerKg: 0.25,
    maxFatG: 12,
    maxFiberG: 6,
    note: "Keep fat and fibre down from here on — they sit in the stomach.",
  },
  {
    id: "topup",
    label: "Top-up",
    fromMin: 20,
    toMin: 60,
    carbsPerKg: 0.4,
    proteinPerKg: 0.15,
    maxFatG: 5,
    maxFiberG: 3,
    note: "Fast carbs and a little protein. Nothing that needs digesting.",
  },
  {
    id: "immediate",
    label: "Right before",
    fromMin: 0,
    toMin: 20,
    carbsPerKg: 0.2,
    proteinPerKg: 0,
    maxFatG: 2,
    maxFiberG: 1,
    note: "Liquid only if anything. This close, food is a liability, not fuel.",
  },
];

export interface PreTarget {
  window: PreWindow;
  carbsG: number;
  proteinG: number;
  maxFatG: number;
  maxFiberG: number;
}

export function preTargets(bodyweightKg: number, window: PreWindow): PreTarget {
  const kg = bodyweightKg > 0 ? bodyweightKg : 75;
  return {
    window,
    carbsG: Math.round(kg * window.carbsPerKg),
    proteinG: Math.round(kg * window.proteinPerKg),
    maxFatG: window.maxFatG,
    maxFiberG: window.maxFiberG,
  };
}

export function windowForMinutes(minutes: number): PreWindow {
  return (
    PRE_WINDOWS.find((w) => minutes >= w.fromMin && minutes <= w.toMin) ??
    // Beyond the longest window it is simply a normal meal.
    PRE_WINDOWS[0]!
  );
}

export interface PreCheck {
  carbsG: number;
  proteinG: number;
  fatG: number;
  fiberG: number;
  carbsPct: number;
  proteinPct: number;
  fatOver: boolean;
  fiberOver: boolean;
  itemCount: number;
  verdict: "empty" | "light" | "good" | "heavy";
}

/**
 * What has actually been eaten in the window, against the target.
 *
 * Reads the day's log rather than asking the user to declare a pre-workout
 * meal: food already logged should not need logging twice, and a section that
 * demands its own entry is one that gets skipped.
 */
export function checkPreWorkout(
  day: NutritionDay | undefined,
  target: PreTarget,
  mealNames: string[] = ["Pre-Workout", "Pre workout", "Preworkout"],
): PreCheck {
  const wanted = new Set(mealNames.map((m) => m.toLowerCase()));
  const items = (day?.items ?? []).filter((i: FoodItem) =>
    wanted.has(String(i.meal ?? "").toLowerCase()),
  );

  const t = items.reduce(
    (a, i) => ({
      carbsG: a.carbsG + (i.c || 0),
      proteinG: a.proteinG + (i.p || 0),
      fatG: a.fatG + (i.f || 0),
      fiberG: a.fiberG + (i.fiber || 0),
    }),
    { carbsG: 0, proteinG: 0, fatG: 0, fiberG: 0 },
  );

  const carbsPct = target.carbsG ? Math.round((t.carbsG / target.carbsG) * 100) : 0;
  const proteinPct = target.proteinG ? Math.round((t.proteinG / target.proteinG) * 100) : 100;
  const fatOver = t.fatG > target.maxFatG;
  const fiberOver = t.fiberG > target.maxFiberG;

  let verdict: PreCheck["verdict"] = "good";
  if (!items.length) verdict = "empty";
  else if (fatOver || fiberOver) verdict = "heavy";
  else if (carbsPct < 60) verdict = "light";

  return {
    carbsG: Math.round(t.carbsG),
    proteinG: Math.round(t.proteinG),
    fatG: Math.round(t.fatG),
    fiberG: Math.round(t.fiberG),
    carbsPct,
    proteinPct,
    fatOver,
    fiberOver,
    itemCount: items.length,
    verdict,
  };
}

/**
 * Foods that suit a given window, from what the user actually owns.
 *
 * Ranked by carb density against the window's fat and fibre ceilings, so the
 * suggestions are things already in their library rather than a generic list
 * of oats and bananas they may not have.
 */
export function suggestFoods(library: FoodItem[], target: PreTarget, limit = 5): FoodItem[] {
  return library
    .filter((f) => (f.c || 0) > 0)
    .filter((f) => (f.f || 0) <= target.maxFatG && (f.fiber || 0) <= target.maxFiberG)
    .map((f) => ({
      f,
      // Carbs per calorie, so a food is judged on what it contributes rather
      // than on how big a portion happens to be recorded.
      score: (f.c || 0) / Math.max(1, f.cals || 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}

export interface Portion {
  food: FoodItem;
  grams: number;
  carbsG: number;
  proteinG: number;
  cals: number;
  /** True when the portion needed would break the window's fat or fibre limit. */
  overLimit: boolean;
}

/**
 * How much of a food actually closes the gap.
 *
 * "You need 63g of carbohydrate" is a number, not an instruction — it still
 * leaves the arithmetic of turning it into food to be done in the gym car
 * park. This answers in portions: 145g of rice, two bananas.
 *
 * Rounded to something a person can serve. Nobody weighs 147g of anything, and
 * a target that looks precise invites ignoring it entirely.
 */
export function portionsFor(
  library: FoodItem[],
  target: PreTarget,
  alreadyEatenCarbsG = 0,
  limit = 4,
): Portion[] {
  const need = Math.max(0, target.carbsG - alreadyEatenCarbsG);
  if (need <= 0) return [];

  return suggestFoods(library, target, limit).map((food) => {
    const per = food.serving || 100;
    const carbsPerG = (food.c || 0) / per;
    if (carbsPerG <= 0) {
      return { food, grams: 0, carbsG: 0, proteinG: 0, cals: 0, overLimit: true };
    }

    const rawGrams = need / carbsPerG;
    // To the nearest 5g under 100, nearest 10g above: the precision a kitchen
    // scale and a human are actually going to agree on.
    const grams = rawGrams < 100 ? Math.round(rawGrams / 5) * 5 : Math.round(rawGrams / 10) * 10;
    const scale = grams / per;

    const fatG = (food.f || 0) * scale;
    const fiberG = (food.fiber || 0) * scale;

    return {
      food,
      grams,
      carbsG: Math.round((food.c || 0) * scale),
      proteinG: Math.round((food.p || 0) * scale),
      cals: Math.round((food.cals || 0) * scale),
      // A food can pass the per-100g check and still break the ceiling once
      // scaled to the portion actually needed — that is the case worth warning
      // about, because it is invisible until the maths is done.
      overLimit: fatG > target.maxFatG || fiberG > target.maxFiberG,
    };
  });
}
