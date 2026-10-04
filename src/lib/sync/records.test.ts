import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChanges, diff, toRecords } from "./records.ts";

const base = {
  seeded: true,
  activeDate: "2026-10-04",
  settings: { accent: "#d3fd50", uiScale: 1.1, mealTimes: [{ label: "Lunch", time: "12:30", share: 25 }] },
  nutrition: { "2026-10-03": { items: [] }, "2026-10-04": { items: [{ name: "Oats", cals: 300 }] } },
  todos: [{ id: "a", text: "Call client" }, { id: "b", text: "Send invoice" }],
  customFoods: [{ name: "Shake", cals: 400 }],
  readingSince: null,
};

test("records split by map entry, id'd item and setting; local fields left out", () => {
  const r = toRecords(base);
  assert.ok(r.has("nutrition/2026-10-04"));
  assert.ok(r.has("todos#a"));
  assert.equal(r.get("todos@order"), '["a","b"]');
  assert.ok(r.has("settings.mealTimes"));
  assert.ok(!r.has("settings.uiScale"), "display size is per device");
  assert.ok(!r.has("activeDate") && !r.has("seeded"));
  assert.ok(r.has("customFoods"), "items without ids sync as one record");
});

test("a round trip through records rebuilds the synced state", () => {
  const empty = { seeded: false, activeDate: "x", settings: { uiScale: 0.9 } };
  const rebuilt = applyChanges(empty, diff(new Map(), toRecords(base)));
  assert.deepEqual(rebuilt.nutrition, base.nutrition);
  assert.deepEqual(rebuilt.todos, base.todos);
  assert.deepEqual(rebuilt.customFoods, base.customFoods);
  assert.equal((rebuilt.settings as { uiScale: number }).uiScale, 0.9, "this device keeps its own display size");
  assert.equal(rebuilt.activeDate, "x");
});

test("two devices editing different things both survive", () => {
  const before = toRecords(base);
  // Phone logs food; PC ticks a task. Each sends only its own change.
  const phone = { ...base, nutrition: { ...base.nutrition, "2026-10-04": { items: [{ name: "Oats", cals: 300 }, { name: "Rice", cals: 500 }] } } };
  const pc = { ...base, todos: [{ id: "a", text: "Call client", done: true }, base.todos[1]] };
  const fromPhone = diff(before, toRecords(phone));
  const fromPc = diff(before, toRecords(pc));
  assert.deepEqual(fromPhone.map((c) => c.key), ["nutrition/2026-10-04"]);
  assert.deepEqual(fromPc.map((c) => c.key), ["todos#a"]);
  const merged = applyChanges(applyChanges(base, fromPhone), fromPc);
  assert.equal((merged.nutrition as Record<string, { items: unknown[] }>)["2026-10-04"]!.items.length, 2);
  assert.equal((merged.todos as { done?: boolean }[])[0]!.done, true);
});

test("removals and reordering travel too", () => {
  const before = toRecords(base);
  const after = { ...base, todos: [{ id: "b", text: "Send invoice" }], nutrition: { "2026-10-04": base.nutrition["2026-10-04"] } };
  const changes = diff(before, toRecords(after));
  const merged = applyChanges(base, changes);
  assert.deepEqual(merged.todos, after.todos);
  assert.deepEqual(Object.keys(merged.nutrition as object), ["2026-10-04"]);
});
