import assert from "node:assert/strict";
import { test } from "node:test";
import { widgetSnapshot } from "./widget-snapshot.ts";

const NOW = new Date(2026, 8, 27, 12); // a Sunday
const item = (cals: number, p: number) => ({ id: String(cals), name: "x", cals, p, c: 0, f: 0 });

test("the widget gets today's four rings, outer to inner, with the app's goals", () => {
  const s = widgetSnapshot(
    {
      nutrition: { "2026-09-27": { items: [item(1800, 150)], water: 2000 } as never },
      history: {},
      customGoals: { cals: 2300, protein: 165 },
    },
    NOW,
  );
  assert.equal(s.date, "2026-09-27");
  assert.deepEqual(s.rings.map((r) => r.id), ["cals", "protein", "water", "burnt"]);
  assert.equal(s.rings[0]!.value, 1800);
  assert.equal(s.rings[0]!.goal, 2300);
  assert.equal(s.rings[1]!.goal, 165);
  assert.equal(s.rings[2]!.value, 2000);
});

test("the week runs Monday to Sunday and carries each day's shares", () => {
  const s = widgetSnapshot(
    { nutrition: { "2026-09-21": { items: [item(2300, 0)] } as never }, history: {}, customGoals: { cals: 2300 } },
    NOW,
  );
  assert.equal(s.week.length, 7);
  assert.equal(s.week[0]!.date, "2026-09-21");
  assert.equal(s.week[6]!.date, "2026-09-27");
  assert.equal(s.week[0]!.f[0], 1);
  assert.equal(s.week[1]!.f[0], 0);
});
