import { BASE_FOOD_LIBRARY } from "./soma";
import EXTRA from "./food-library.json";
import type { FoodItem } from "./types";

/**
 * The shipped food library: the original twelve plus several hundred more.
 *
 * ## What is in here, and what deliberately is not
 *
 * Every entry is a GENERIC food with figures from published composition tables
 * — the sort of thing "chicken breast" or "couscous" means anywhere. That
 * covers the overwhelming majority of what anyone logs, which is why the most
 * used entries in any food tracker are generic rather than branded.
 *
 * There are no brand names and no barcodes in this file, and that is a
 * decision rather than an omission. A barcode is an identifier for one exact
 * package, and I have no access to Soummam's or Candia's product data. Writing
 * plausible-looking EAN-13s next to plausible-looking macros would produce two
 * failure modes, both worse than the food simply being absent: a code that
 * matches nothing means the scanner reports "not found" for a product that IS
 * in Open Food Facts, and a code that collides with a real product means the
 * scanner confidently logs a different food's calories. Invented nutrition
 * figures presented as a specific product's label are not a library, they are
 * a fabrication that happens to be shaped like one.
 *
 * Real branded products reach the library by the two routes that carry real
 * data: scanning one saves it here with its true barcode (lib/food-cache.ts),
 * and a CSV or published Google Sheet imports thousands at once
 * (lib/food-import.ts). Both are the user's own data, and both are correct.
 *
 * Micronutrients are 0 where a value was not to hand. That reads as "not
 * recorded" throughout the app — the minerals card already names the foods
 * behind a gap rather than treating a blank as a zero.
 */

interface RawFood extends Omit<FoodItem, "meal" | "isBase"> {
  group?: string;
}

/** The shipped list, in a stable order, tagged as base foods. */
export const SHIPPED_FOODS: FoodItem[] = [
  ...(BASE_FOOD_LIBRARY as unknown as FoodItem[]),
  ...(EXTRA as RawFood[]).map((f) => ({ ...f, meal: "", isBase: true }) as FoodItem),
];

/**
 * The library as the app should see it: shipped foods, then the user's own,
 * deduplicated by name so an edited food replaces the one it overrides rather
 * than appearing twice.
 *
 * Order matters — customs come second so they win.
 */
export function composeLibrary(customFoods: FoodItem[]): FoodItem[] {
  const byName = new Map<string, FoodItem>();
  for (const f of SHIPPED_FOODS) byName.set(f.name.trim().toLowerCase(), f);
  for (const f of customFoods) byName.set(f.name.trim().toLowerCase(), f);
  return [...byName.values()];
}

/** Food groups present in the shipped list, for filtering the picker. */
export function foodGroups(library: FoodItem[]): string[] {
  const seen = new Set<string>();
  for (const f of library) {
    const g = (f as RawFood).group;
    if (g) seen.add(g);
  }
  return [...seen].sort();
}

/**
 * Search that tolerates how people actually type.
 *
 * Accents are stripped from both sides, so "creme" finds "Crème" and "cafe"
 * finds "Café" — on a phone keyboard nobody reaches for the accented key mid
 * meal. Matching is on the name and the group, so "algerian" lists the whole
 * Maghrebi section.
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function searchFoods(library: FoodItem[], query: string, limit = 60): FoodItem[] {
  const q = normalizeSearch(query);
  if (!q) return library.slice(0, limit);

  const scored: { f: FoodItem; rank: number }[] = [];
  for (const f of library) {
    const name = normalizeSearch(f.name);
    const group = normalizeSearch((f as RawFood).group ?? "");
    let rank = -1;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (group.includes(q)) rank = 3;
    else if ((f.barcode ?? "").includes(q)) rank = 0;
    if (rank >= 0) scored.push({ f, rank });
  }

  return scored
    // Best match first, then the food you reach for most, then alphabetically.
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (b.f.usageCount ?? 0) - (a.f.usageCount ?? 0) ||
        a.f.name.localeCompare(b.f.name),
    )
    .slice(0, limit)
    .map((x) => x.f);
}
