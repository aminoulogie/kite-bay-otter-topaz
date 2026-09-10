import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deduct, findStock, isLow, lineFor, listCost, lowItems, matchName, restock, stockKey,
  withLowStock, type GroceryLine, type PantryItem,
} from "./pantry.ts";

let n = 0;
const id = () => `id${++n}`;

const item = (over: Partial<PantryItem> & { name: string }): PantryItem => ({
  id: over.name, qty: 1000, unit: "g", low: 200, ...over,
});

const RICE = item({ name: "Rice", qty: 1000, low: 200, price: 320, packSize: 1000 });
const CHICKEN = item({ name: "Chicken breast", qty: 400, low: 300, price: 900, packSize: 1000 });

test("names match however they were typed", () => {
  assert.equal(stockKey("  Chicken   Breast "), "chicken breast");
  assert.ok(findStock([CHICKEN], "CHICKEN BREAST"));
  assert.equal(findStock([CHICKEN], "beef"), undefined);
});

test("eating takes it out of the cupboard", () => {
  const r = deduct([RICE], "rice", 150, "g");
  assert.equal(r.deducted, 150);
  assert.equal(r.pantry[0]!.qty, 850);
});

test("grams never come off a stock counted in pieces", () => {
  // Guessing a conversion would silently corrupt the count, and a corrupted
  // count is worse than no count because it looks like it works.
  const eggs = item({ name: "Eggs", qty: 12, unit: "x", low: 3 });
  const r = deduct([eggs], "eggs", 60, "g");
  assert.equal(r.deducted, 0);
  assert.equal(r.pantry[0]!.qty, 12);
});

test("stock never goes negative", () => {
  const r = deduct([item({ name: "Rice", qty: 100, low: 50 })], "rice", 400, "g");
  assert.equal(r.pantry[0]!.qty, 0);
  assert.equal(r.deducted, 100, "only what was actually there came off");
});

test("food that is not tracked changes nothing", () => {
  const r = deduct([RICE], "saffron", 2, "g");
  assert.equal(r.deducted, 0);
  assert.deepEqual(r.pantry, [RICE]);
});

test("going low is a crossing, not a state", () => {
  // An already-empty cupboard must not raise a fresh grocery line at every
  // single meal.
  const first = deduct([CHICKEN], "chicken breast", 200, "g");
  assert.equal(first.wentLow, true, "400 -> 200 crosses the 300 mark");
  const again = deduct(first.pantry, "chicken breast", 50, "g");
  assert.equal(again.wentLow, false, "already below it");
});

test("the list is raised from what is low, once", () => {
  const pantry = [RICE, item({ name: "Chicken breast", qty: 100, low: 300, packSize: 1000 })];
  assert.deepEqual(lowItems(pantry).map((p) => p.name), ["Chicken breast"]);

  const once = withLowStock([], pantry, id);
  assert.equal(once.length, 1);
  const twice = withLowStock(once, pantry, id);
  assert.equal(twice.length, 1, "the same item is not raised again");
  assert.equal(twice, once, "and the list is returned unchanged so nothing rewrites");
});

test("a line asks for what a shop actually sells", () => {
  // "We need 340g of rice" is not a thing anyone can buy.
  const line = lineFor(item({ name: "Rice", qty: 40, low: 200, packSize: 1000 }), "l1");
  assert.equal(line.qty, 1000);
  assert.equal(line.auto, true);
});

test("a price is carried, never invented", () => {
  const priced = lineFor(RICE, "l1");
  assert.equal(priced.price, 320);
  const unknown = lineFor(item({ name: "Saffron", qty: 0, low: 1 }), "l2");
  assert.equal(unknown.price, undefined);
});

test("the total says how much of the list it could not price", () => {
  const list: GroceryLine[] = [
    { id: "1", name: "Rice", qty: 1000, unit: "g", price: 320 },
    { id: "2", name: "Chicken", qty: 1000, unit: "g", price: 900 },
    { id: "3", name: "Saffron", qty: 5, unit: "g" },
  ];
  const c = listCost(list);
  assert.equal(c.total, 1220);
  assert.equal(c.priced, 2);
  assert.equal(c.unpriced, 1, "a total that quietly ignores it reads as the whole shop");
});

test("putting the shopping away tops the cupboard back up", () => {
  const list: GroceryLine[] = [
    { id: "1", name: "Rice", qty: 1000, unit: "g", price: 350, got: true },
  ];
  const r = restock([item({ name: "Rice", qty: 40, low: 200, price: 320 })], list, id, "2026-09-10");
  assert.equal(r.pantry[0]!.qty, 1040);
  assert.equal(r.pantry[0]!.price, 350, "what it costs now, not what it cost in March");
  assert.equal(r.pantry[0]!.updated, "2026-09-10");
  assert.deepEqual(r.remaining, []);
});

test("what you did not buy stays on the list", () => {
  const list: GroceryLine[] = [
    { id: "1", name: "Rice", qty: 1000, unit: "g", got: true },
    { id: "2", name: "Saffron", qty: 5, unit: "g" },
  ];
  const r = restock([RICE], list, id);
  assert.deepEqual(r.remaining.map((l) => l.name), ["Saffron"]);
  assert.deepEqual(r.bought.map((l) => l.name), ["Rice"]);
});

test("buying something untracked starts tracking it", () => {
  const list: GroceryLine[] = [
    { id: "1", name: "Lentils", qty: 500, unit: "g", price: 200, got: true },
  ];
  const r = restock([], list, id);
  const added = r.pantry[0]!;
  assert.equal(added.name, "Lentils");
  assert.equal(added.qty, 500);
  assert.equal(added.price, 200);
  assert.ok(added.low > 0, "and gets a sensible restock mark");
});

test("low is inclusive, because at exactly the mark you are out", () => {
  assert.equal(isLow(item({ name: "x", qty: 200, low: 200 })), true);
  assert.equal(isLow(item({ name: "x", qty: 201, low: 200 })), false);
});

// ------------------------------------------------------- matching by name --

test("the library's qualifier does not stop a match", () => {
  // The whole feature silently did nothing before this: the library calls it
  // "Chicken Breast (Raw)", a person writes "Chicken breast", and neither
  // could see the other.
  const lib = [{ name: "Chicken Breast (Raw)" }, { name: "Chicken Nuggets" }];
  assert.equal(matchName("Chicken breast", lib, (x) => x.name)?.name, "Chicken Breast (Raw)");
});

test("a prefix match respects word boundaries", () => {
  const lib = [{ name: "Chicken Nuggets" }, { name: "Chickpeas" }];
  assert.equal(matchName("chicken", lib, (x) => x.name)?.name, "Chicken Nuggets");
  assert.equal(matchName("chick", lib, (x) => x.name), undefined, "not a word");
});

test("the most generic name wins a tie", () => {
  const lib = [
    { name: "Rice, White, Grilled And Seasoned" },
    { name: "Rice White" },
  ];
  assert.equal(matchName("rice white", lib, (x) => x.name)?.name, "Rice White");
});

test("no match is no match, not the nearest thing", () => {
  assert.equal(matchName("saffron", [{ name: "Chicken" }], (x) => x.name), undefined);
  assert.equal(matchName("", [{ name: "Chicken" }], (x) => x.name), undefined);
});

test("eating the library's name deducts from the cupboard's name", () => {
  const pantry = [item({ name: "Chicken breast", qty: 1000, low: 200 })];
  const r = deduct(pantry, "Chicken Breast (Raw)", 200, "g");
  assert.equal(r.deducted, 200);
  assert.equal(r.pantry[0]!.qty, 800);
});
