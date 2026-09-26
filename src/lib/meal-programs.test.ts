import assert from "node:assert/strict";
import { test } from "node:test";
import {
  duplicateProgram, programMeals, programSummary, programTotals,
  SEED_PROGRAMS, uniqueProgramName, type MealProgram,
} from "./meal-programs.ts";
import type { FoodItem } from "./types.ts";

/**
 * The library these tests measure against.
 *
 * Deliberately a fixture rather than the shipped one. The seed programmes are
 * built ONLY from foods the user logged in one specific week, and those names
 * have to keep resolving — importing the real library here would need a JSON
 * import attribute Node's type stripping does not accept, and would also make
 * this test fail for reasons that have nothing to do with the seed data.
 *
 * The fixture doubles as the guard: a seed line naming a food that is not here
 * fails the "resolves" test below, which is how a typo gets caught.
 */
const FIXTURE: Record<string, [number, number, number, number, number, number?]> = {
  "Whole Eggs": [143, 13.0, 0.7, 9.9, 0],
  "Pain de mie chaïb": [280, 7.5, 50.1, 4, 0],
  "Peanuts (Raw)": [567, 25.8, 16.1, 49.2, 8.5],
  "Rechta - cooked": [170, 5.5, 35, 1.5, 0],
  "Fromage picon": [207, 6.5, 8.5, 16.5, 0],
  "Chicken Breast (Cooked)": [165, 31.0, 0, 3.6, 0],
  "Labelle rice white": [343, 6.6, 78.5, 0.4, 0],
  "Ifruit carottes": [52, 0.2, 12.32, 0, 0],
  // Served as 150g rather than 100g, on purpose: it proves a portion is
  // measured against the food's own serving instead of an assumed 100.
  "White Rice (Cooked)": [195, 4.1, 43.0, 0.4, 0.6, 150],
  Baguette: [274, 8.8, 55.8, 1.3, 2.7],
  "Chicken Breast (Raw)": [120, 22.5, 0, 2.6, 0],
  "Subsidized milk": [45, 2.2, 4.5, 1.5, 0],
  "Pizza Margherita": [266, 11.0, 33, 10, 2.3],
  "Greek fraise": [136.88, 3.2, 17.07, 6.2, 0],
  "Petit suisse": [85, 7.5, 3.7, 4.5, 0],
  "Le berber fondu": [240, 9.0, 5, 20, 0],
  Tomato: [18, 0.9, 3.9, 0.2, 1.2],
  "Rouiba carote": [47, 0, 11, 0, 0],
  "Chicken Wing (Cooked)": [203, 30.4, 0, 8.1, 0],
  Cheesecake: [321, 5.5, 25.5, 22.5, 0.4],
  Nectarine: [44, 1.1, 10.6, 0.3, 1.7],
  "Pasta (Cooked)": [158, 5.8, 30.9, 0.9, 1.8],
};

const LIBRARY: FoodItem[] = Object.entries(FIXTURE).map(([name, v]) => ({
  name,
  serving: v[5] ?? 100,
  unit: "g",
  cals: v[0], p: v[1], c: v[2], f: v[3], fiber: v[4],
  sodium: 0, potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0,
  meal: "",
}));

function program(foods: MealProgram["foods"], name = "Test"): MealProgram {
  return { id: "t1", name, foods };
}

// --------------------------------------------------------------- the seeds --

test("every seeded line resolves against the library rather than vanishing", () => {
  for (const prog of SEED_PROGRAMS) {
    const { missing } = programTotals(prog, LIBRARY);
    assert.deepEqual(
      missing,
      [],
      `${prog.name} names food the library does not have: ${missing.join(", ")}`,
    );
  }
});

test("the seeded week lands on the calorie target", () => {
  const totals = SEED_PROGRAMS.map((p) => programSummary(p, LIBRARY).cals);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  // 3,200 is the goal this whole feature exists to hit. A day may drift, but
  // the week averaging more than a little off it means the seed data has been
  // edited without being measured.
  assert.ok(avg >= 3100 && avg <= 3300, `seeded week averages ${Math.round(avg)} kcal`);
});

test("every seeded day clears the protein floor", () => {
  for (const prog of SEED_PROGRAMS) {
    const { p } = programSummary(prog, LIBRARY);
    assert.ok(p >= 170, `${prog.name} carries only ${p}g protein`);
  }
});

test("the seeds are seven distinct programmes with unique ids", () => {
  assert.equal(SEED_PROGRAMS.length, 7);
  assert.equal(new Set(SEED_PROGRAMS.map((p) => p.id)).size, 7);
  assert.equal(new Set(SEED_PROGRAMS.map((p) => p.name)).size, 7);
});

test("no seeded line has an empty food, a non-positive portion or no meal", () => {
  for (const prog of SEED_PROGRAMS) {
    for (const f of prog.foods) {
      assert.ok(f.food.trim(), `${prog.name} has a blank food name`);
      assert.ok(f.grams > 0, `${prog.name}: ${f.food} is ${f.grams}g`);
      assert.ok(f.meal.trim(), `${prog.name}: ${f.food} has no meal`);
    }
  }
});

// ------------------------------------------------------------- the portions --

test("a portion is measured against the food's own serving, not assumed to be 100g", () => {
  // White rice is recorded as 195 kcal per 150g serving. 300g is therefore two
  // servings and 390 kcal — not 585, which is what treating the entry as per
  // 100g would produce.
  const { totals } = programTotals(program([{ food: "White Rice (Cooked)", grams: 300, meal: "Lunch" }]), LIBRARY);
  assert.equal(totals.cals, 390);
  assert.equal(totals.grams, 300);
});

test("a food that is no longer in the library is reported, never counted as zero", () => {
  const prog = program([
    { food: "Whole Eggs", grams: 100, meal: "Breakfast" },
    { food: "Something Deleted", grams: 200, meal: "Lunch" },
  ]);
  const { totals, missing } = programTotals(prog, LIBRARY);
  assert.deepEqual(missing, ["Something Deleted"]);
  // Only the eggs counted, and the reported total says so by being small
  // rather than by quietly including a zero.
  assert.equal(totals.cals, 143);
});

// ------------------------------------------------------------- the grouping --

test("foods are grouped into diary order, not the order they were entered", () => {
  const prog = program([
    { food: "Baguette", grams: 100, meal: "Dinner" },
    { food: "Whole Eggs", grams: 100, meal: "Breakfast" },
    { food: "Tomato", grams: 100, meal: "Lunch" },
  ]);
  assert.deepEqual(programMeals(prog).map((g) => g.meal), ["Breakfast", "Lunch", "Dinner"]);
});

test("a meal the diary does not know about still shows, at the end", () => {
  // A programme saved before a meal was renamed must not lose those lines.
  const prog = program([
    { food: "Baguette", grams: 100, meal: "Second Breakfast" },
    { food: "Whole Eggs", grams: 100, meal: "Breakfast" },
  ]);
  assert.deepEqual(programMeals(prog).map((g) => g.meal), ["Breakfast", "Second Breakfast"]);
});

test("an empty programme groups to nothing rather than to a blank meal", () => {
  assert.deepEqual(programMeals(program([])), []);
});

// ------------------------------------------------------------ duplicating --

test("duplicating a programme gives it a new id and its own copy of the foods", () => {
  const mon = SEED_PROGRAMS[0]!;
  const copy = duplicateProgram(mon, SEED_PROGRAMS);
  assert.notEqual(copy.id, mon.id);
  assert.equal(copy.foods.length, mon.foods.length);
  // Editing the copy must not reach back into the original.
  assert.notEqual(copy.foods[0], mon.foods[0]);
  assert.deepEqual(copy.foods[0], mon.foods[0]);
});

test("duplicating a name that is already taken numbers it instead of colliding", () => {
  const mon = SEED_PROGRAMS[0]!;
  const taken = new Set(SEED_PROGRAMS.map((p) => p.name.toLowerCase()));
  assert.equal(uniqueProgramName(mon.name, taken), `${mon.name} (2)`);
  taken.add(`${mon.name} (2)`.toLowerCase());
  assert.equal(uniqueProgramName(mon.name, taken), `${mon.name} (3)`);
});

test("a name that already ends in a number is not numbered twice", () => {
  // Duplicating "Monday (2)" should give "Monday (3)", not "Monday (2) (2)".
  const taken = new Set(["monday", "monday (2)"]);
  assert.equal(uniqueProgramName("Monday (2)", taken), "Monday (3)");
});

test("a free name is left exactly as it is", () => {
  assert.equal(uniqueProgramName("Cutting week", new Set()), "Cutting week");
});

test("a blank name still yields something selectable", () => {
  assert.equal(uniqueProgramName("   ", new Set()), "Programme");
});
