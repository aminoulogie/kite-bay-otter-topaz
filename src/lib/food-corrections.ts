/**
 * Corrections to the custom foods imported from the Obsidian food list.
 *
 * Each one is a figure that cannot be right given the food's own other
 * numbers — calories four times what its carbohydrate allows, a protein of
 * zero on a cheese whose calories need 7.5 g of it — plus the fibre those
 * entries left at 0 and typical micronutrients, which none of them carried.
 *
 * Applied only while the wrong figure is still there (`when`): if you have
 * since fixed a food yourself, your number is the one that stays. Micros are
 * only filled where a food has none at all, and are per 100 g or 100 ml —
 * typical values for the kind of food (USDA / CIQUAL), since these labels
 * print none.
 */
import type { FoodItem } from "./types.ts";

type Micros = Partial<Pick<FoodItem, "sodium" | "potassium" | "calcium" | "iron" | "magnesium" | "zinc">> &
  Record<string, number | undefined>;

interface Correction {
  name: string;
  /** Applied only while every one of these still holds. */
  when?: Partial<Record<"cals" | "p" | "c" | "f" | "fiber", number>>;
  set?: Partial<Record<"cals" | "p" | "c" | "f" | "fiber", number>>;
  micros?: Micros;
  why: string;
}

const MILK: Micros = { sodium: 44, potassium: 150, calcium: 120, magnesium: 11, zinc: 0.4, iron: 0.03, vitB12: 0.45 };
const FRESH_CHEESE: Micros = { sodium: 36, potassium: 135, calcium: 110, magnesium: 10, zinc: 0.5, iron: 0.1 };

export const CORRECTIONS: Correction[] = [
  {
    name: "Rouiba carote",
    when: { cals: 184 },
    set: { cals: 45 },
    micros: { sodium: 10, potassium: 140, calcium: 12, magnesium: 7, iron: 0.2, zinc: 0.1, vitA: 400 },
    why: "184 kcal per 100 ml would need 46 g of sugar; its own 11 g of carbohydrate is about 45 kcal.",
  },
  {
    name: "Fromage Blanc Nature",
    when: { f: 12 },
    set: { f: 3 },
    micros: FRESH_CHEESE,
    why: "12 g of fat alone is 108 kcal, more than its 80.6; 3 g is what the calories add up to.",
  },
  {
    name: "جبن طازج",
    when: { p: 0 },
    set: { p: 7.5 },
    micros: FRESH_CHEESE,
    why: "85 kcal with 3.7 g carbohydrate and 4.5 g fat leaves 7.5 g of protein unaccounted for.",
  },
  {
    name: "Cooked pasta",
    when: { cals: 220, c: 43 },
    set: { cals: 158, p: 5.8, c: 30.9, f: 0.9, fiber: 1.8 },
    micros: { sodium: 1, potassium: 44, calcium: 7, magnesium: 18, iron: 0.5, zinc: 0.5 },
    why: "Cooked pasta is about 62% water; 220 kcal and 43 g carbohydrate is dry matter it does not have.",
  },
  { name: "Pain baguette", when: { fiber: 0 }, set: { fiber: 2.7 },
    micros: { sodium: 580, potassium: 120, calcium: 40, magnesium: 25, iron: 1.2, zinc: 0.8 },
    why: "White bread has about 2.7 g fibre per 100 g." },
  { name: "Pates cru", when: { fiber: 0 }, set: { fiber: 3.2 },
    micros: { sodium: 6, potassium: 223, calcium: 21, magnesium: 53, iron: 1.3, zinc: 1.4 },
    why: "Dry pasta has about 3.2 g fibre per 100 g." },
  { name: "Petit suisse", micros: FRESH_CHEESE, why: "Micronutrients." },
  { name: "Mayo lesieur", micros: { sodium: 630, potassium: 20, calcium: 8, magnesium: 1, iron: 0.2, zinc: 0.1, vitE: 3 }, why: "Micronutrients." },
  { name: "F&H PB CHOCO", micros: { sodium: 200, potassium: 550, calcium: 50, magnesium: 150, iron: 2, zinc: 2.5 }, why: "Micronutrients." },
  { name: "Candia choco", micros: { sodium: 60, potassium: 170, calcium: 110, magnesium: 13, iron: 0.25, zinc: 0.4 }, why: "Micronutrients." },
  { name: "Fromage picon", micros: { sodium: 1100, potassium: 150, calcium: 350, magnesium: 20, iron: 0.3, zinc: 2 }, why: "Micronutrients." },
  { name: "Subsidized milk", micros: MILK, why: "Micronutrients." },
  { name: "حليب كونديا 1 لتر", micros: MILK, why: "Micronutrients." },
  { name: "viande hachee 5%", micros: { sodium: 66, potassium: 330, calcium: 12, magnesium: 21, iron: 2.3, zinc: 5.5, vitB12: 2.2 }, why: "Micronutrients." },
  { name: "Creme fondelice", micros: { sodium: 40, potassium: 110, calcium: 80, magnesium: 8, iron: 0.05, zinc: 0.3 }, why: "Micronutrients." },
  { name: "Flan caramel soummam", micros: { sodium: 70, potassium: 130, calcium: 100, magnesium: 10, iron: 0.1, zinc: 0.4 }, why: "Micronutrients." },
];

const MICRO_KEYS = ["sodium", "potassium", "calcium", "iron", "magnesium", "zinc"] as const;

/** The foods with the corrections applied; the same array when none applied. */
export function correctCustomFoods(foods: FoodItem[]): FoodItem[] {
  let changed = false;
  const out = foods.map((food) => {
    const fix = CORRECTIONS.find((c) => c.name.toLowerCase() === (food.name ?? "").trim().toLowerCase());
    if (!fix) return food;
    let next = food;
    const holds = Object.entries(fix.when ?? {}).every(
      ([k, v]) => Number((food as unknown as Record<string, unknown>)[k] ?? 0) === v,
    );
    if (fix.set && holds) next = { ...next, ...fix.set };
    const hasMicros = MICRO_KEYS.some((k) => Number(next[k]) > 0);
    if (fix.micros && !hasMicros) next = { ...next, ...(fix.micros as Partial<FoodItem>) };
    if (next !== food) changed = true;
    return next;
  });
  return changed ? out : foods;
}
