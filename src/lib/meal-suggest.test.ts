import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LINES, MAX_PORTION_G, MIN_PORTION_G, suggestDay } from "./meal-suggest.ts";
import type { PantryItem } from "./pantry.ts";
import type { FoodItem, Goals } from "./types.ts";

const food = (name: string, o: Partial<FoodItem>): FoodItem =>
  ({
    name, serving: 100, unit: "g", cals: 0, p: 0, c: 0, f: 0,
    fiber: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0,
    ...o,
  }) as FoodItem;

const stock = (name: string, o: Partial<PantryItem> = {}): PantryItem =>
  ({ id: name, name, qty: 2000, unit: "g", low: 100, ...o });

const GOALS: Goals = { cals: 3000, protein: 180, carbs: 350, fat: 80 } as Goals;

const CHICKEN = food("Chicken breast", { cals: 165, p: 31, c: 0, f: 3.6 });
const RICE = food("White rice", { cals: 130, p: 2.7, c: 28, f: 0.3 });
const OIL = food("Olive oil", { cals: 884, p: 0, c: 0, f: 100 });
const LIBRARY = [CHICKEN, RICE, OIL];

test("an empty cupboard says so instead of inventing a menu", () => {
  const s = suggestDay([], LIBRARY, GOALS);
  assert.deepEqual(s.items, []);
  assert.match(s.note, /Nothing in the cupboard/);
});

test("it only ever proposes food you actually have", () => {
  const s = suggestDay([stock("White rice")], LIBRARY, GOALS);
  assert.ok(s.items.length > 0);
  for (const i of s.items) assert.equal(i.name, "White rice");
});

test("stock with no nutrition behind it is named, not guessed at", () => {
  const s = suggestDay([stock("Rice"), stock("Grandma's tagine")], LIBRARY, GOALS);
  assert.ok(s.skipped.includes("Grandma's tagine"));
  assert.ok(!s.items.some((i) => i.name === "Grandma's tagine"));
});

test("a cupboard counted in pieces cannot be portioned in grams", () => {
  const s = suggestDay([stock("White rice", { unit: "x", qty: 5 })], LIBRARY, GOALS);
  assert.deepEqual(s.items, []);
});

test("it never proposes more than is in the cupboard", () => {
  const s = suggestDay([stock("Chicken breast", { qty: 120 })], LIBRARY, GOALS);
  const total = s.items.reduce((a, i) => a + i.serving, 0);
  assert.ok(total <= 120, `${total} proposed from 120g of stock`);
});

test("a food the library names differently is still only used once", () => {
  // The bug this exists for: the dedupe was keyed on the LIBRARY name while
  // the loop checked the STOCK name, so "White rice" in the cupboard matching
  // "White Rice (Cooked)" in the library slipped through it every round — and
  // the fitter prescribed 180g of rice five times from 180g of stock.
  const lib = [food("White Rice (Cooked)", { cals: 130, p: 2.7, c: 28, f: 0.3 })];
  const s = suggestDay([stock("White rice", { qty: 180 })], lib, GOALS);
  assert.equal(s.items.length, 1, `proposed ${s.items.length} lines of the same rice`);
  assert.ok(
    s.items.reduce((a, i) => a + i.serving, 0) <= 180,
    "and never more of it than there is",
  );
});

test("no single portion is a thing nobody would eat", () => {
  const s = suggestDay([stock("Chicken breast"), stock("White rice")], LIBRARY, GOALS);
  for (const i of s.items) {
    assert.ok(i.serving <= MAX_PORTION_G, `${i.serving}g of ${i.name}`);
    assert.ok(i.serving >= MIN_PORTION_G);
  }
});

test("each food appears once, not four times because the maths liked it", () => {
  const s = suggestDay([stock("Chicken breast"), stock("White rice"), stock("Olive oil")], LIBRARY, GOALS);
  const names = s.items.map((i) => i.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length <= MAX_LINES);
});

test("it aims at what is LEFT of the day, not the whole day", () => {
  const alreadyEaten = [food("Big lunch", { serving: 100, cals: 2000, p: 170, c: 300, f: 70 })];
  const full = suggestDay([stock("Chicken breast"), stock("White rice")], LIBRARY, GOALS);
  const partial = suggestDay(
    [stock("Chicken breast"), stock("White rice")],
    LIBRARY,
    GOALS,
    alreadyEaten,
  );
  const gramsOf = (s: typeof full) => s.items.reduce((a, i) => a + i.serving, 0);
  assert.ok(gramsOf(partial) < gramsOf(full), "a day mostly eaten needs less food");
});

test("a day already on target proposes nothing rather than padding it", () => {
  const done = [food("Perfect day", { serving: 100, cals: 3000, p: 180, c: 350, f: 80 })];
  const s = suggestDay([stock("Chicken breast"), stock("White rice")], LIBRARY, GOALS, done);
  assert.deepEqual(s.items, []);
  assert.match(s.note, /closer to today's targets/);
});

test("the proposal moves the day towards its targets", () => {
  const s = suggestDay([stock("Chicken breast"), stock("White rice"), stock("Olive oil")], LIBRARY, GOALS);
  const missOf = (t: { p: number; c: number; f: number }) =>
    Math.abs(t.p - 180) / 180 + Math.abs(t.c - 350) / 350 + Math.abs(t.f - 80) / 80;
  assert.ok(missOf(s.projected) < missOf({ p: 0, c: 0, f: 0 }));
  assert.ok(s.projected.p > 0 && s.projected.c > 0);
});

test("no targets set means it says so rather than aiming at nothing", () => {
  const none = { cals: 0, protein: 0, carbs: 0, fat: 0 } as Goals;
  const s = suggestDay([stock("White rice")], LIBRARY, none);
  assert.deepEqual(s.items, []);
  assert.match(s.note, /targets first/);
});

test("what it hands back is loggable as-is", () => {
  const s = suggestDay([stock("Chicken breast"), stock("White rice")], LIBRARY, GOALS, [], "Dinner");
  for (const i of s.items) {
    assert.equal(i.meal, "Dinner");
    assert.equal(i.unit, "g");
    assert.ok(Number.isFinite(i.cals) && i.cals > 0);
    // Scaled to the portion, not left at the library's per-100g figures.
    assert.ok(Math.abs(i.cals - (i.serving / 100) * (i.name === "White rice" ? 130 : 165)) < 2);
  }
});

test("the same cupboard gives the same day, every time", () => {
  const pantry = [stock("Chicken breast"), stock("White rice"), stock("Olive oil")];
  const a = suggestDay(pantry, LIBRARY, GOALS);
  const b = suggestDay(pantry, LIBRARY, GOALS);
  assert.deepEqual(a, b);
});
