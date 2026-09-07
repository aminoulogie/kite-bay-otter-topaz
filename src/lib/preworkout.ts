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
/**
 * Which kinds of carbohydrate suit which window.
 *
 * Ranking on carbs-per-calorie alone puts table sugar and confectionery at the
 * top of every window, because nothing beats pure sucrose on that measure. That
 * is the right answer twenty minutes out and the wrong one ninety minutes out,
 * where you want food with some substance to it rather than a spoon of sugar.
 *
 * So the window decides: further out, slower and more complete carbohydrate —
 * grains, fruit, legumes, dairy. Closer in, fast and low-residue — fruit,
 * juice, sweets — and grains become the thing still sitting there when you
 * start. Negative numbers are penalties, and they are preferences rather than
 * rules: a penalised food still appears, lower down.
 */
function groupFit(group: string | undefined, window: PreWindow): number {
  const far = window.fromMin >= 60;
  const table: Record<string, [far: number, near: number]> = {
    Grains: [-120, 60],
    Legumes: [-100, 90],
    Fruit: [-60, -80],
    Dairy: [-40, 40],
    Drinks: [40, -90],
    Sweets: [140, -40],
    Algerian: [-40, 80],
    Nuts: [120, 200],
    Meat: [200, 300],
    Fish: [200, 300],
    Vegetables: [80, 80],
  };
  const pair = table[group ?? ""];
  if (!pair) return 0;
  return far ? pair[0] : pair[1];
}

/** Carbohydrate per 100g below which a food is not a carbohydrate source. */
const MIN_CARB_DENSITY = 12;

/** Groups nobody eats as pre-workout fuel, whatever the arithmetic says. */
const NOT_FUEL = new Set(["Supplements", "Fats", "Fast food"]);
const NOT_FUEL_NAME =
  // Ingredients rather than foods: nobody eats 130g of cornstarch before a
  // session, however well it scores on carbohydrate density.
  /gum|chewing|lime|lemon|vinegar|harissa|mustard|ketchup|spice|yeast|stock|bouillon|sauce|cornstarch|flour|breadcrumb|bran\b|margarine/i;

export function suggestFoods(library: FoodItem[], target: PreTarget, limit = 5): FoodItem[] {
  return library
    // Density first, and per 100g rather than per calorie.
    //
    // Ranking purely by carbs-per-calorie is what put sugar-free chewing gum
    // and 600g of lime at the top of this list: gum is mostly polyols and a
    // lime is mostly water, so both score beautifully per calorie while being
    // useless as fuel. A pre-workout carb source has to actually be dense in
    // carbohydrate, and be something a person eats by the plate.
    .filter((f) => (f.c || 0) >= MIN_CARB_DENSITY)
    .filter((f) => !NOT_FUEL.has(f.group ?? "") && !NOT_FUEL_NAME.test(f.name))
    .filter((f) => (f.f || 0) <= target.maxFatG && (f.fiber || 0) <= target.maxFiberG)
    .map((f) => ({
      f,
      // Among real carbohydrate sources, the leanest one wins: same carbs for
      // fewer calories means less sitting in the stomach.
      score: (f.c || 0) / Math.max(1, f.cals || 1),
      // Ties broken towards food you actually reach for. Two foods with the
      // same carb density are not equally useful if you have only ever eaten
      // one of them.
      used: f.usageCount || 0,
    }))
    .sort((a, b) => b.score - a.score || b.used - a.used)
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
  // The list scrolls inside a fixed window now, so a longer one costs no
  // screen space and stops the answer being "these four foods or nothing".
  limit = 12,
): Portion[] {
  const need = Math.max(0, target.carbsG - alreadyEatenCarbsG);
  if (need <= 0) return [];

  // Every plausible carbohydrate source, sized to the gap, then ranked on
  // whether the portion is something a person would actually eat.
  //
  // Ranking the FOODS first and sizing them afterwards is what produced 450g
  // of apple and 410g of quince: judged per calorie, watery fruit beats every
  // staple, and the absurdity only appears once the portion is worked out. So
  // the portion is worked out first and is itself the thing being judged.
  const scored = suggestFoods(library, target, 200).map((food) => {
    const per = food.serving || 100;
    const carbsPerG = (food.c || 0) / per;
    if (carbsPerG <= 0) return null;

    const rawGrams = need / carbsPerG;
    // To the nearest 5g under 100, nearest 10g above: the precision a kitchen
    // scale and a human are actually going to agree on.
    const grams = rawGrams < 100 ? Math.round(rawGrams / 5) * 5 : Math.round(rawGrams / 10) * 10;
    const scale = grams / per;

    const fatG = (food.f || 0) * scale;
    const fiberG = (food.fiber || 0) * scale;
    const overLimit = fatG > target.maxFatG || fiberG > target.maxFiberG;

    // A comfortable serving is roughly a handful to a plateful. Further from
    // that band, less useful — 30g of anything is a nibble and 450g is a meal
    // you will still be digesting.
    const IDEAL_LOW = 50;
    const IDEAL_HIGH = 250;
    const distance =
      grams < IDEAL_LOW ? IDEAL_LOW - grams : grams > IDEAL_HIGH ? grams - IDEAL_HIGH : 0;

    return {
      food, grams, scale, fatG, fiberG, overLimit,
      // Breaking the window's own limit is disqualifying rather than a
      // tiebreak, so those sink below everything that fits.
      rank:
        distance +
        groupFit(food.group, target.window) +
        (overLimit ? 1000 : 0) -
        (food.usageCount ?? 0) * 5,
    };
  });

  return scored
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ food, grams, scale, overLimit }) => ({
      food,
      grams,
      carbsG: Math.round((food.c || 0) * scale),
      proteinG: Math.round((food.p || 0) * scale),
      cals: Math.round((food.cals || 0) * scale),
      // A food can pass the per-100g check and still break the ceiling once
      // scaled to the portion actually needed — that is the case worth warning
      // about, because it is invisible until the maths is done.
      overLimit,
    }));
}
