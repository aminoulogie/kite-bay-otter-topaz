import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  collectSideStores, mergeSideStores, restoreSideStores, sideStoreCounts,
  type SideStores,
} from "./side-stores.ts";
import { MEAL_PROGRAMS_KEY, SEED_PROGRAMS, type MealProgram } from "./meal-programs.ts";
import { MEMBERSHIP_KEY } from "./membership.ts";
import { ACTIVE_PROGRAM_KEY, PROGRAMS_KEY } from "./programs.ts";
import { RECIPES_KEY } from "./recipes.ts";
import { SUPPLEMENT_LOG_KEY } from "./supplements.ts";
import type { Program } from "./programs.ts";
import type { Recipe } from "./recipes.ts";

/** Every side-store key, so a new one has to be added here too. */
const KEYS = [
  PROGRAMS_KEY, ACTIVE_PROGRAM_KEY, RECIPES_KEY, MEAL_PROGRAMS_KEY, MEMBERSHIP_KEY, SUPPLEMENT_LOG_KEY,
];

/** localStorage and a window, since these modules are written for a browser. */
function fakeBrowser() {
  const store = new Map<string, string>();
  const events: string[] = [];
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as any).Event = class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  } as any;
  (globalThis as any).window = { dispatchEvent: (e: { type: string }) => events.push(e.type) };
  return { store, events };
}

const program = (id: string, days: string[]): Program =>
  ({ id, name: id, kind: "week", days, anchor: "2026-01-01" }) as Program;
const recipe = (id: string): Recipe => ({ id, name: id, ingredients: [], servings: 1 });
const mealProgram = (id: string, name = id): MealProgram =>
  ({ id, name, foods: [{ food: "Whole Eggs", grams: 100, meal: "Breakfast" }] });

let env: ReturnType<typeof fakeBrowser>;
beforeEach(() => {
  env = fakeBrowser();
});

test("everything outside the zustand store is collected", () => {
  env.store.set(PROGRAMS_KEY, JSON.stringify([program("p1", ["Push", "Pull"])]));
  env.store.set(ACTIVE_PROGRAM_KEY, "p1");
  env.store.set(RECIPES_KEY, JSON.stringify([recipe("r1")]));
  env.store.set(MEAL_PROGRAMS_KEY, JSON.stringify([mealProgram("mp1")]));
  env.store.set(MEMBERSHIP_KEY, JSON.stringify([{ id: "m1", start: "2026-01-01", end: "2026-02-01" }]));
  env.store.set(SUPPLEMENT_LOG_KEY, JSON.stringify(["creatine"]));

  const s = collectSideStores();
  assert.deepEqual(sideStoreCounts(s), {
    programs: 1, recipes: 1, mealPrograms: 1, membership: 1, supplements: 1,
  });
  assert.equal(s.activeProgramId, "p1");
  assert.deepEqual(s.programs?.[0]?.days, ["Push", "Pull"]);
});

test("an empty device collects empty lists, not undefined", () => {
  // Meal programmes are the one exception, and a deliberate one: a device that
  // has never saved any starts with the seeded week rather than an empty
  // dropdown. Everything else is genuinely empty, and empty rather than
  // undefined, which is what this pins.
  assert.deepEqual(sideStoreCounts(collectSideStores()), {
    programs: 0, recipes: 0, mealPrograms: SEED_PROGRAMS.length, membership: 0, supplements: 0,
  });
  assert.deepEqual(collectSideStores().programs, []);
  assert.deepEqual(collectSideStores().supplements, []);
});

test("a device that has never saved meal programmes gets the seeded week", () => {
  const seeded = collectSideStores().mealPrograms;
  assert.equal(seeded?.length, SEED_PROGRAMS.length);
  assert.deepEqual(seeded?.map((p) => p.name), SEED_PROGRAMS.map((p) => p.name));
  // Stable ids, not generated ones: a restore merges by id, and ids that
  // changed on every read would stack a fresh copy of the week each time.
  assert.deepEqual(seeded?.map((p) => p.id), SEED_PROGRAMS.map((p) => p.id));
});

test("deleting every meal programme sticks instead of resurrecting the seeds", () => {
  // null and "[]" have to mean different things: absent is a first run, and an
  // empty array is a decision.
  env.store.set(MEAL_PROGRAMS_KEY, JSON.stringify([]));
  assert.deepEqual(collectSideStores().mealPrograms, []);
});

test("a merge keeps the device's edit and brings back what only the backup has", () => {
  const backup: SideStores = {
    programs: [program("p1", ["Push"]), program("p2", ["Legs"])],
    activeProgramId: "p1",
    recipes: [recipe("r1")],
    membership: [{ id: "m1", start: "2026-01-01", end: "2026-02-01" }],
    supplements: ["creatine"],
  };
  const mine: SideStores = {
    // p1 was edited on the phone after the backup was taken.
    programs: [program("p1", ["Push", "Pull", "Legs"])],
    activeProgramId: "p1",
    recipes: [],
    membership: [{ id: "m2", start: "2026-03-01", end: "2026-04-01" }],
    supplements: ["vitamin-d"],
  };

  const out = mergeSideStores(backup, mine);
  // The device holds the newer edit, so its version of p1 survives...
  assert.deepEqual(out.programs?.find((p) => p.id === "p1")?.days, ["Push", "Pull", "Legs"]);
  // ...but p2, which only the backup knows about, is a missing row not a deleted one.
  assert.ok(out.programs?.some((p) => p.id === "p2"));
  assert.deepEqual(out.recipes?.map((r) => r.id), ["r1"]);
  // Both months were genuinely paid for, so neither is dropped.
  assert.deepEqual(out.membership?.map((m) => m.id).sort(), ["m1", "m2"]);
  // A supplement ticked in either copy is one the user takes.
  assert.deepEqual(out.supplements?.sort(), ["creatine", "vitamin-d"]);
});

test("meal programmes merge by id, with an edit on the phone surviving the backup", () => {
  const out = mergeSideStores(
    { mealPrograms: [mealProgram("mp1", "Monday"), mealProgram("mp2", "Tuesday")] },
    { mealPrograms: [mealProgram("mp1", "Monday, edited")] },
  );
  assert.equal(out.mealPrograms?.length, 2);
  assert.equal(out.mealPrograms?.find((p) => p.id === "mp1")?.name, "Monday, edited");
  assert.ok(out.mealPrograms?.some((p) => p.id === "mp2"));
});

test("the programme this phone is on now beats the one it was on then", () => {
  const out = mergeSideStores(
    { programs: [program("old", ["Push"])], activeProgramId: "old" },
    { programs: [program("new", ["Legs"])], activeProgramId: "new" },
  );
  assert.equal(out.activeProgramId, "new");
});

test("a device that never chose one takes the backup's choice", () => {
  const out = mergeSideStores({ activeProgramId: "p1" }, { activeProgramId: null });
  assert.equal(out.activeProgramId, "p1");
});

test("a restore writes every key and tells the screens to re-read", () => {
  const written = restoreSideStores(
    {
      programs: [program("p1", ["Push"])],
      activeProgramId: "p1",
      recipes: [recipe("r1")],
      mealPrograms: [mealProgram("mp1")],
      membership: [{ id: "m1", start: "2026-01-01", end: "2026-02-01" }],
      supplements: ["creatine"],
    },
    "replace",
  );
  assert.ok(written);
  for (const key of KEYS) assert.ok(env.store.has(key), `${key} was not written`);
  assert.deepEqual(collectSideStores().programs?.[0]?.days, ["Push"]);
  assert.deepEqual(collectSideStores().mealPrograms?.map((p) => p.id), ["mp1"]);
  // The calendar and the meal builder hold their copy in useState; without this
  // they keep showing what was there before the restore.
  assert.deepEqual(env.events, ["soma-side-stores-restored"]);
});

test("a backup written before side stores existed cannot clear them", () => {
  // The whole point of the feature: an old file says nothing about programmes,
  // and silence must not be read as "the user had none". Replace is the
  // dangerous mode, so it is the one tested.
  env.store.set(PROGRAMS_KEY, JSON.stringify([program("mine", ["Push", "Pull"])]));
  env.store.set(SUPPLEMENT_LOG_KEY, JSON.stringify(["creatine"]));

  assert.equal(restoreSideStores(undefined, "replace"), null);
  assert.equal(restoreSideStores(null, "merge"), null);

  assert.deepEqual(collectSideStores().programs?.[0]?.days, ["Push", "Pull"]);
  assert.deepEqual(collectSideStores().supplements, ["creatine"]);
  assert.deepEqual(env.events, [], "nothing changed, so nothing should be told to re-read");
});

test("a v2 file with an empty section really does mean empty", () => {
  // Unlike the case above: the section is present and says zero programmes,
  // which is a fact rather than an absence, so replace honours it.
  env.store.set(PROGRAMS_KEY, JSON.stringify([program("mine", ["Push"])]));
  restoreSideStores(
    { programs: [], recipes: [], mealPrograms: [], membership: [], supplements: [] },
    "replace",
  );
  assert.deepEqual(collectSideStores().programs, []);
  // The one that had seeds behind it: a restore carrying an empty section must
  // not bring the seeded week back.
  assert.deepEqual(collectSideStores().mealPrograms, []);
});

test("a merge onto a fresh phone is just the backup", () => {
  restoreSideStores(
    { programs: [program("p1", ["Push"])], activeProgramId: "p1", supplements: ["creatine"] },
    "merge",
  );
  const out = collectSideStores();
  assert.deepEqual(out.programs?.map((p) => p.id), ["p1"]);
  assert.equal(out.activeProgramId, "p1");
  assert.deepEqual(out.supplements, ["creatine"]);
});

test("a malformed section is ignored rather than crashing the restore", () => {
  env.store.set(PROGRAMS_KEY, JSON.stringify([program("mine", ["Push"])]));
  assert.equal(restoreSideStores("not an object" as unknown as SideStores, "replace"), null);
  assert.deepEqual(collectSideStores().programs?.[0]?.id, "mine");
});
