/**
 * What is actually in the house.
 *
 * The loop this closes: you log the chicken you ate, the chicken in the fridge
 * goes down, and when there is nearly none left it turns up on a grocery list
 * with the price you paid last time — so the money side knows what the week is
 * about to cost before you have spent it.
 *
 * Three rules hold this together, and the third is the one that matters most:
 *
 *  1. **Stock only ever moves when food is CONFIRMED eaten.** Planning a meal
 *     does not empty the fridge. Anything else and the plan would eat your
 *     stock twice — once when you wrote it down and again when you ate it.
 *  2. **Units must agree.** 200g of chicken comes off a stock measured in
 *     grams and comes off nothing at all when the stock is measured in
 *     pieces. Guessing a conversion would silently corrupt the count.
 *  3. **Prices are never invented.** A price appears here because the user
 *     typed it after a shop, and it is remembered so the next list can be
 *     costed. An app that guesses what chicken costs in Algiers and files the
 *     guess as an expense is worse than one that asks.
 */

export type StockUnit = "g" | "ml" | "x";

export interface PantryItem {
  id: string;
  /** As written on the food. Matched case- and space-insensitively. */
  name: string;
  qty: number;
  unit: StockUnit;
  /** At or below this, it goes on the list. */
  low: number;
  /** What one restock costs. Absent until the user has paid for one. */
  price?: number;
  /** How much one restock buys, so the price means something. */
  packSize?: number;
  /** When stock last changed, for the "nothing has moved" case. */
  updated?: string;
}

export interface GroceryLine {
  id: string;
  name: string;
  qty: number;
  unit: StockUnit;
  /** Copied from the pantry when the line is raised; editable before paying. */
  price?: number;
  /** Ticked off in the shop. */
  got?: boolean;
  /** Raised by the low-stock rule rather than typed by hand. */
  auto?: boolean;
}

/** Identity of a pantry row: "Chicken Breast" and "chicken breast" are one thing. */
export function stockKey(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The looser form used to match ACROSS lists.
 *
 * The food library calls it "Chicken Breast (Raw)". A person tracking their
 * cupboard writes "Chicken breast". Exact matching linked neither to the other
 * and the whole feature silently did nothing — the pantry knew about food the
 * suggester could not see, and eating chicken deducted from no stock at all.
 *
 * So the parenthetical qualifier goes, along with punctuation. This is only
 * for matching; the name the user typed is what is stored and shown.
 */
export function normaliseName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the one entry that means the same food, or nothing.
 *
 * Exact first, then a prefix on a word boundary — "chicken breast" finds
 * "Chicken Breast (Raw)" but never "Chicken Nuggets". When several qualify the
 * SHORTEST wins, on the grounds that it is the most generic: "Chicken Breast"
 * over "Chicken Breast Grilled And Marinated". Deterministic, and visible in
 * the UI so a wrong link can be seen and corrected rather than silently
 * feeding the wrong numbers into a plan.
 */
export function matchName<T>(
  name: string,
  list: T[],
  nameOf: (x: T) => string,
): T | undefined {
  const want = normaliseName(name);
  if (!want) return undefined;
  const norm = (list ?? []).map((x) => ({ x, n: normaliseName(nameOf(x)) }));

  const exact = norm.find((e) => e.n === want);
  if (exact) return exact.x;

  // Either direction: the stock may be the more specific name, or the library.
  const starts = norm.filter(
    (e) => e.n.startsWith(`${want} `) || want.startsWith(`${e.n} `),
  );
  if (!starts.length) return undefined;
  return starts.reduce((a, b) => (b.n.length < a.n.length ? b : a)).x;
}

export function findStock(pantry: PantryItem[], name: string): PantryItem | undefined {
  return matchName(name, pantry ?? [], (p) => p.name);
}

/** Grams and millilitres are interchangeable for this purpose; pieces are not. */
function unitsAgree(a: string, b: string): boolean {
  const norm = (u: string) => {
    const s = String(u ?? "").trim().toLowerCase();
    if (s === "g" || s === "gram" || s === "grams") return "g";
    if (s === "ml" || s === "millilitre" || s === "milliliter") return "ml";
    return "x";
  };
  const x = norm(a);
  const y = norm(b);
  if (x === "x" || y === "x") return x === y;
  return x === y;
}

export interface DeductResult {
  pantry: PantryItem[];
  /** How much actually came off. Zero when there was no matching stock. */
  deducted: number;
  /** True when the item crossed its low mark on this deduction. */
  wentLow: boolean;
}

/**
 * Take an eaten portion out of stock.
 *
 * Never below zero. A negative count would be reported as "you have minus
 * 40g of rice", which is not information anybody can act on — the honest
 * reading of eating more than the app knew about is simply "none left".
 */
export function deduct(
  pantry: PantryItem[],
  name: string,
  qty: number,
  unit: string,
  today?: string,
): DeductResult {
  const list = pantry ?? [];
  const amount = Number(qty) || 0;
  const item = findStock(list, name);
  if (!item || amount <= 0) return { pantry: list, deducted: 0, wentLow: false };
  const i = list.indexOf(item);
  if (!unitsAgree(item.unit, unit)) return { pantry: list, deducted: 0, wentLow: false };

  const before = item.qty;
  const next = Math.max(0, before - amount);
  const out = [...list];
  out[i] = { ...item, qty: next, updated: today ?? item.updated };
  return {
    pantry: out,
    deducted: before - next,
    // Only the crossing, not the state: a cupboard that is already empty
    // should not raise a fresh grocery line every single meal.
    wentLow: before > item.low && next <= item.low,
  };
}

export function isLow(item: PantryItem): boolean {
  return (Number(item.qty) || 0) <= (Number(item.low) || 0);
}

export function lowItems(pantry: PantryItem[]): PantryItem[] {
  return (pantry ?? []).filter(isLow).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The line a low item should raise.
 *
 * Quantity is the pack size when one is known, because that is what you can
 * actually buy — "we need 340g of rice" is not a thing a shop sells.
 */
export function lineFor(item: PantryItem, id: string): GroceryLine {
  return {
    id,
    name: item.name,
    qty: Number(item.packSize) > 0 ? item.packSize! : Math.max(1, Number(item.low) || 1),
    unit: item.unit,
    price: item.price,
    auto: true,
  };
}

/**
 * Merge the low-stock items into an existing list without duplicating.
 *
 * Returns the list unchanged when nothing is new, so a caller can store the
 * result unconditionally without writing on every render.
 */
export function withLowStock(
  list: GroceryLine[],
  pantry: PantryItem[],
  makeId: () => string,
): GroceryLine[] {
  const have = new Set((list ?? []).map((l) => stockKey(l.name)));
  const added: GroceryLine[] = [];
  for (const item of lowItems(pantry)) {
    if (have.has(stockKey(item.name))) continue;
    added.push(lineFor(item, makeId()));
  }
  return added.length ? [...(list ?? []), ...added] : (list ?? []);
}

/**
 * What the list will cost, and how much of it is a guess.
 *
 * `unpriced` is reported rather than estimated. A total that quietly ignores
 * six unpriced items reads as the whole shop and is wrong by whatever they
 * cost, so the count travels with the figure.
 */
export function listCost(list: GroceryLine[]): { total: number; priced: number; unpriced: number } {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const l of list ?? []) {
    const p = Number(l.price);
    if (Number.isFinite(p) && p > 0) {
      total += p;
      priced++;
    } else {
      unpriced++;
    }
  }
  return { total: Math.round(total * 100) / 100, priced, unpriced };
}

/**
 * Put the shopping away.
 *
 * Every line that was actually bought tops its stock back up and remembers
 * what it cost. Lines left unticked stay on the list — you did not buy them,
 * and clearing them would lose the only record that you still need them.
 */
export function restock(
  pantry: PantryItem[],
  list: GroceryLine[],
  makeId: () => string,
  today?: string,
): { pantry: PantryItem[]; remaining: GroceryLine[]; bought: GroceryLine[] } {
  const bought = (list ?? []).filter((l) => l.got);
  const remaining = (list ?? []).filter((l) => !l.got);
  const out = [...(pantry ?? [])];

  for (const line of bought) {
    const i = out.findIndex((p) => stockKey(p.name) === stockKey(line.name));
    const price = Number(line.price) > 0 ? Number(line.price) : undefined;
    if (i >= 0) {
      const item = out[i]!;
      out[i] = {
        ...item,
        qty: (Number(item.qty) || 0) + (Number(line.qty) || 0),
        // The price paid this time replaces the one remembered, so the next
        // list is costed at what things cost now rather than in March.
        price: price ?? item.price,
        packSize: Number(line.qty) > 0 ? line.qty : item.packSize,
        updated: today ?? item.updated,
      };
    } else {
      // Bought something that was not being tracked: start tracking it.
      out.push({
        id: makeId(),
        name: line.name,
        qty: Number(line.qty) || 0,
        unit: line.unit,
        low: Math.max(1, Math.round((Number(line.qty) || 0) * 0.2)),
        price,
        packSize: Number(line.qty) > 0 ? line.qty : undefined,
        updated: today,
      });
    }
  }

  return { pantry: out, remaining, bought };
}
