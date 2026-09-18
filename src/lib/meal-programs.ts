import { recipeTotals, type RecipeIngredient, type RecipeTotals } from "./recipes.ts";
import type { FoodItem } from "./types.ts";

/**
 * A whole day of eating, saved under a name and applied in one tap.
 *
 * This fills the gap between two things that already exist. A `Recipe` is a
 * saved *meal*, and MealBuilder logs one straight into today. `planFood` writes
 * food to *any* date and leaves it greyed until it is confirmed. Neither answers
 * "what am I eating on Thursday", and that is the question a bulk actually lives
 * or dies on: 3,200 kcal is not decided at 8pm, it is decided when the week is
 * laid out.
 *
 * So a programme is a Recipe with a meal attached to every food and no servings
 * — a day rather than a dish. It stores foods and grams rather than totals for
 * the same reason a recipe does: correcting the rice from 500g to 600g has to
 * recompute the day, and that is impossible from a frozen number. A food whose
 * own figures are later corrected flows through to every programme using it.
 *
 * Applying one writes into `NutritionDay.planned` and never `items` — see the
 * note on that field. Nothing counts until the row is swiped, which is what
 * makes a plan a plan instead of a diary you lied to.
 *
 * It lives in its own localStorage key rather than the zustand store, exactly
 * like `Recipe` and the training `Program` beside it, and is therefore named in
 * lib/side-stores.ts. Anything that survives a wipe without being named there is
 * silently lost on a restore — that is the bug side-stores.ts exists to stop.
 */

export interface ProgramFood extends RecipeIngredient {
  /** Which meal it lands under. One of the diary's own meal names. */
  meal: string;
}

export interface MealProgram {
  id: string;
  name: string;
  foods: ProgramFood[];
}

/**
 * The order meals are shown in, matching the diary.
 *
 * Spelled out here rather than imported because `MEALS` is a module-private
 * const inside two components already, and a pure module cannot reach either
 * without dragging React into a file that tests import directly.
 */
export const PROGRAM_MEALS = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Pre-Workout",
  "Post-Workout",
  "Snacks",
] as const;

export const MEAL_PROGRAMS_KEY = "soma-meal-programs";

export interface ProgramMealGroup {
  meal: string;
  foods: ProgramFood[];
}

function newId(): string {
  return `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newProgramId(): string {
  return newId();
}

/**
 * The programme's foods grouped by meal, in diary order.
 *
 * A meal name that is not in PROGRAM_MEALS still appears, at the end, rather
 * than being dropped: a programme saved against a meal that has since been
 * renamed would otherwise lose those lines with nothing said.
 */
export function programMeals(program: MealProgram): ProgramMealGroup[] {
  const known = PROGRAM_MEALS as readonly string[];
  const out: ProgramMealGroup[] = [];

  for (const meal of PROGRAM_MEALS) {
    const foods = program.foods.filter((f) => f.meal === meal);
    if (foods.length) out.push({ meal, foods });
  }

  const other = new Set(program.foods.map((f) => f.meal).filter((m) => !known.includes(m)));
  for (const meal of other) {
    out.push({ meal, foods: program.foods.filter((f) => f.meal === meal) });
  }

  return out;
}

/**
 * What the whole programme contains, from the current library.
 *
 * Delegates to the recipe maths rather than repeating it, so "how an ingredient
 * becomes macros" has exactly one definition in the app. A programme is a
 * recipe that happens to carry a meal per line, and `servings: 1` says the day
 * is the batch.
 */
export function programTotals(
  program: MealProgram,
  library: FoodItem[],
): { totals: RecipeTotals; missing: string[] } {
  return recipeTotals(
    { id: program.id, name: program.name, ingredients: program.foods, servings: 1 },
    library,
  );
}

/** Just the calories and protein, for a one-line summary in a list. */
export function programSummary(
  program: MealProgram,
  library: FoodItem[],
): { cals: number; p: number; c: number; f: number; fiber: number; missing: string[] } {
  const { totals, missing } = programTotals(program, library);
  return {
    cals: totals.cals,
    p: totals.p,
    c: totals.c,
    f: totals.f,
    fiber: totals.fiber,
    missing,
  };
}

/**
 * A name that is not already taken, by appending "(2)", "(3)"…
 *
 * A trailing "(n)" on the base is stripped first, so duplicating "Monday (2)"
 * gives "Monday (3)" rather than the steadily compounding "Monday (2) (2)".
 */
export function uniqueProgramName(base: string, taken: Set<string>): string {
  const name = base.replace(/\s*\(\d+\)\s*$/, "").trim() || "Programme";
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} (${Date.now()})`;
}

/**
 * A copy of a programme under a fresh name and id.
 *
 * New id rather than a reused one, because the id is what a delete and a
 * restore merge on — two programmes sharing one id would fight over the same
 * row the first time a backup was folded back in. The foods are copied too, so
 * editing the copy cannot reach back into the original.
 */
export function duplicateProgram(program: MealProgram, existing: MealProgram[]): MealProgram {
  const taken = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  return {
    id: newId(),
    name: uniqueProgramName(program.name, taken),
    foods: program.foods.map((f) => ({ ...f })),
  };
}

function isProgram(value: unknown): value is MealProgram {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<MealProgram>;
  return typeof p.name === "string" && Array.isArray(p.foods);
}

/**
 * Repair whatever was in storage into something usable.
 *
 * A hand-edited or half-written entry should cost the user that one programme,
 * not the seven beside it, so each row is filtered rather than the whole array
 * being rejected. Grams that are not a finite positive number are dropped for
 * the same reason: a NaN portion would silently poison the day's totals.
 */
function normalize(value: MealProgram): MealProgram {
  const foods = value.foods
    .filter((f) => f && typeof f.food === "string" && Number.isFinite(Number(f.grams)))
    .map((f) => ({
      food: f.food,
      grams: Math.max(0, Number(f.grams)),
      meal: typeof f.meal === "string" && f.meal ? f.meal : "Lunch",
    }));
  return {
    id: typeof value.id === "string" && value.id ? value.id : newId(),
    name: value.name.trim() || "Programme",
    foods,
  };
}

/**
 * The saved programmes, seeding a week the first time.
 *
 * `null` and `"[]"` are deliberately different answers. An absent key is a
 * first run, so the seeded week is the starting point. An empty array is a
 * decision — the user deleted them — and resurrecting seven days they threw
 * away is not helpful.
 */
export function loadMealPrograms(): MealProgram[] {
  try {
    const raw = localStorage.getItem(MEAL_PROGRAMS_KEY);
    if (raw === null) return SEED_PROGRAMS.map((p) => ({ ...p, foods: p.foods.map((f) => ({ ...f })) }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProgram).map(normalize);
  } catch {
    // No localStorage at all, or unparseable: the seeds are still a usable
    // answer, and a first render is not the moment to have nothing.
    return SEED_PROGRAMS.map((p) => ({ ...p, foods: p.foods.map((f) => ({ ...f })) }));
  }
}

export function saveMealPrograms(programs: MealProgram[]): void {
  try {
    localStorage.setItem(MEAL_PROGRAMS_KEY, JSON.stringify(programs));
  } catch {
    /* a full store must not lose the edit being made */
  }
}

/**
 * One programme per weekday, built ONLY from foods logged in the last week.
 *
 * That constraint is the user's and it is respected literally. Every food named
 * below appears in the 2026-09-12 → 2026-09-18 log, so each line resolves
 * against the library without inventing anything, and the foods are logged in
 * grams against entries whose per-100g figures already agree with their own
 * serving weight.
 *
 * What the constraint costs, stated plainly because it is not obvious from the
 * numbers: fiber lands around 17g a day against a 40g target. The only fiber
 * sources in this set are peanuts (8.5g/100g), baguette (2.7), pizza (2.3),
 * pasta (1.8), nectarine (1.7) and tomato (1.2). Reaching 40g would take about
 * 470g of peanuts, which is 2,665 kcal of them. It is arithmetically out of
 * reach, not merely unmet — legumes and vegetables are what close it, and they
 * are not in last week's log.
 *
 * The names are the library's own, so renaming a food in the library or a
 * custom food stops resolving here — which `programTotals` reports as
 * `missing` rather than counting as zero.
 */
export const SEED_PROGRAMS: MealProgram[] = [
  {
    id: "mp-seed-monday",
    name: "Monday",
    foods: [
      { food: "Whole Eggs", grams: 200, meal: "Breakfast" },
      { food: "Pain de mie chaïb", grams: 100, meal: "Breakfast" },
      { food: "Subsidized milk", grams: 250, meal: "Breakfast" },
      { food: "Chicken Breast (Cooked)", grams: 250, meal: "Lunch" },
      { food: "White Rice (Cooked)", grams: 600, meal: "Lunch" },
      { food: "Tomato", grams: 150, meal: "Lunch" },
      { food: "Peanuts (Raw)", grams: 60, meal: "Snacks" },
      { food: "Ifruit carottes", grams: 400, meal: "Snacks" },
      { food: "Whole Eggs", grams: 100, meal: "Dinner" },
      { food: "Baguette", grams: 150, meal: "Dinner" },
      { food: "Greek fraise", grams: 150, meal: "Dinner" },
    ],
  },
  {
    id: "mp-seed-tuesday",
    name: "Tuesday",
    foods: [
      { food: "Whole Eggs", grams: 150, meal: "Breakfast" },
      { food: "Baguette", grams: 150, meal: "Breakfast" },
      { food: "Subsidized milk", grams: 300, meal: "Breakfast" },
      { food: "Chicken Breast (Raw)", grams: 320, meal: "Lunch" },
      { food: "Rechta - cooked", grams: 500, meal: "Lunch" },
      { food: "Tomato", grams: 150, meal: "Lunch" },
      { food: "Peanuts (Raw)", grams: 50, meal: "Snacks" },
      { food: "Rouiba carote", grams: 400, meal: "Snacks" },
      { food: "Fromage picon", grams: 80, meal: "Dinner" },
      { food: "Baguette", grams: 100, meal: "Dinner" },
      { food: "Nectarine", grams: 200, meal: "Dinner" },
      { food: "Greek fraise", grams: 150, meal: "Dinner" },
    ],
  },
  {
    id: "mp-seed-wednesday",
    name: "Wednesday",
    foods: [
      { food: "Whole Eggs", grams: 200, meal: "Breakfast" },
      { food: "Pain de mie chaïb", grams: 120, meal: "Breakfast" },
      { food: "Subsidized milk", grams: 250, meal: "Breakfast" },
      { food: "Pasta (Cooked)", grams: 600, meal: "Lunch" },
      { food: "Chicken Breast (Cooked)", grams: 200, meal: "Lunch" },
      { food: "Tomato", grams: 150, meal: "Lunch" },
      { food: "Peanuts (Raw)", grams: 40, meal: "Snacks" },
      { food: "Rouiba carote", grams: 500, meal: "Snacks" },
      { food: "Fromage picon", grams: 100, meal: "Dinner" },
      { food: "Baguette", grams: 150, meal: "Dinner" },
      { food: "Le berber fondu", grams: 40, meal: "Dinner" },
    ],
  },
  {
    id: "mp-seed-thursday",
    name: "Thursday",
    foods: [
      { food: "Whole Eggs", grams: 150, meal: "Breakfast" },
      { food: "Pain de mie chaïb", grams: 130, meal: "Breakfast" },
      { food: "Subsidized milk", grams: 300, meal: "Breakfast" },
      { food: "Chicken Wing (Cooked)", grams: 300, meal: "Lunch" },
      { food: "White Rice (Cooked)", grams: 550, meal: "Lunch" },
      { food: "Tomato", grams: 150, meal: "Lunch" },
      { food: "Peanuts (Raw)", grams: 60, meal: "Snacks" },
      { food: "Ifruit carottes", grams: 400, meal: "Snacks" },
      { food: "Petit suisse", grams: 200, meal: "Dinner" },
      { food: "Baguette", grams: 150, meal: "Dinner" },
      { food: "Nectarine", grams: 150, meal: "Dinner" },
    ],
  },
  {
    id: "mp-seed-friday",
    name: "Friday",
    foods: [
      { food: "Whole Eggs", grams: 200, meal: "Breakfast" },
      { food: "Pain de mie chaïb", grams: 100, meal: "Breakfast" },
      { food: "Subsidized milk", grams: 250, meal: "Breakfast" },
      { food: "Pizza Margherita", grams: 300, meal: "Lunch" },
      { food: "Greek fraise", grams: 150, meal: "Lunch" },
      { food: "Peanuts (Raw)", grams: 30, meal: "Snacks" },
      { food: "Ifruit carottes", grams: 500, meal: "Snacks" },
      { food: "Chicken Breast (Cooked)", grams: 250, meal: "Dinner" },
      { food: "White Rice (Cooked)", grams: 450, meal: "Dinner" },
      { food: "Tomato", grams: 150, meal: "Dinner" },
    ],
  },
  {
    id: "mp-seed-saturday",
    name: "Saturday",
    foods: [
      { food: "Whole Eggs", grams: 200, meal: "Breakfast" },
      { food: "Baguette", grams: 150, meal: "Breakfast" },
      { food: "Subsidized milk", grams: 250, meal: "Breakfast" },
      { food: "Chicken Breast (Raw)", grams: 300, meal: "Lunch" },
      { food: "Labelle rice white", grams: 120, meal: "Lunch" },
      { food: "Tomato", grams: 150, meal: "Lunch" },
      { food: "Cheesecake", grams: 120, meal: "Snacks" },
      { food: "Peanuts (Raw)", grams: 20, meal: "Snacks" },
      { food: "Chicken Breast (Cooked)", grams: 200, meal: "Dinner" },
      { food: "White Rice (Cooked)", grams: 400, meal: "Dinner" },
      { food: "Greek fraise", grams: 150, meal: "Dinner" },
    ],
  },
  {
    id: "mp-seed-sunday",
    name: "Sunday",
    foods: [
      { food: "Whole Eggs", grams: 150, meal: "Breakfast" },
      { food: "Baguette", grams: 150, meal: "Breakfast" },
      { food: "Subsidized milk", grams: 300, meal: "Breakfast" },
      { food: "Rechta - cooked", grams: 450, meal: "Lunch" },
      { food: "Chicken Breast (Cooked)", grams: 250, meal: "Lunch" },
      { food: "Tomato", grams: 150, meal: "Lunch" },
      { food: "Petit suisse", grams: 200, meal: "Snacks" },
      { food: "Peanuts (Raw)", grams: 40, meal: "Snacks" },
      { food: "Fromage picon", grams: 80, meal: "Dinner" },
      { food: "Baguette", grams: 150, meal: "Dinner" },
      { food: "Nectarine", grams: 200, meal: "Dinner" },
      { food: "Rouiba carote", grams: 400, meal: "Dinner" },
    ],
  },
];
