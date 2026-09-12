import assert from "node:assert/strict";
import { test } from "node:test";
import { followsSettings, resolveGoals, sameGoals } from "./goals.ts";
import { DEFAULT_GOALS } from "./soma/data.ts";
import type { Settings } from "./types.ts";

const base = (over: Partial<Settings> = {}) => ({ ...over }) as Settings;

test("with nothing set the defaults come back untouched", () => {
  assert.deepEqual(resolveGoals(base()), { ...DEFAULT_GOALS });
  assert.deepEqual(resolveGoals(undefined), { ...DEFAULT_GOALS });
});

test("an override wins over the default", () => {
  assert.equal(resolveGoals(base({ customGoals: { cals: 3200 } })).cals, 3200);
});

test("CLEARING an override goes back to the default — the bug this exists for", () => {
  const was = resolveGoals(base({ customGoals: { cals: 3200 } }));
  assert.equal(was.cals, 3200);
  // The field emptied in Settings removes the key entirely.
  const now = resolveGoals(base({ customGoals: {} }));
  assert.equal(now.cals, DEFAULT_GOALS.cals, "a merge would have left 3200 here for ever");
});

test("a rebuild never keeps a key the overrides no longer carry", () => {
  const g = resolveGoals(base({ customGoals: { cals: 3200, protein: 200 } }));
  const after = resolveGoals(base({ customGoals: { protein: 200 } }));
  assert.equal(g.cals, 3200);
  assert.equal(after.cals, DEFAULT_GOALS.cals);
  assert.equal(after.protein, 200);
});

test("the derived protein figure applies only when that setting is on", () => {
  const off = resolveGoals(base({ proteinPerKg: 2 }), 80);
  assert.equal(off.protein, DEFAULT_GOALS.protein);
  const on = resolveGoals(base({ autoProteinTarget: true, proteinPerKg: 2 }), 80);
  assert.equal(on.protein, 160);
});

test("an explicit protein target beats the bodyweight one", () => {
  const g = resolveGoals(
    base({ autoProteinTarget: true, proteinPerKg: 2, customGoals: { protein: 210 } }),
    80,
  );
  assert.equal(g.protein, 210);
});

test("auto protein with no weight yet falls back rather than writing zero", () => {
  const g = resolveGoals(base({ autoProteinTarget: true, proteinPerKg: 2 }), undefined);
  assert.equal(g.protein, DEFAULT_GOALS.protein);
  assert.ok(g.protein > 0);
});

test("sameGoals compares every field, both ways", () => {
  const a = resolveGoals(base());
  assert.equal(sameGoals(a, resolveGoals(base())), true);
  assert.equal(sameGoals(a, resolveGoals(base({ customGoals: { cals: 1 } }))), false);
  assert.equal(sameGoals(undefined, undefined), true);
  assert.equal(sameGoals(a, undefined), false);
});

test("today follows a target edit whatever is logged against it", () => {
  assert.equal(followsSettings("2026-09-12", "2026-09-12", 0), true);
  assert.equal(followsSettings("2026-09-12", "2026-09-12", 9), true);
});

test("a past day with food in it keeps the target it was scored under", () => {
  assert.equal(followsSettings("2026-09-01", "2026-09-12", 4), false);
});

test("an empty day follows, past or future — there is nothing to rescore", () => {
  assert.equal(followsSettings("2026-09-01", "2026-09-12", 0), true);
  assert.equal(followsSettings("2026-09-20", "2026-09-12", 0), true);
});
