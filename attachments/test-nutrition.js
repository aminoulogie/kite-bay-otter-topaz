// Phase 4: maintenance calories from real data, and the protein target link.
// Run with:  node test/test-nutrition.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const E = loadPlugin().SomaIntelligenceEngine;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

// Builds a nutrition file: `days` consecutive dates, each with `cals` eaten,
// and a linear weight drift from startW to endW.
function db({ days, cals, startW, endW, foodEvery = 1, weighEvery = 1 }) {
  const out = { _settings: { proteinPerKg: 2 } };
  for (let i = 0; i < days; i++) {
    const d = new Date(2026, 0, 1 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const entry = {};
    if (i % foodEvery === 0) entry.items = [{ name: "food", cals }];
    if (i % weighEvery === 0) {
      entry.bodyWeight = Math.round((startW + (endW - startW) * (i / (days - 1))) * 100) / 100;
    }
    out[key] = entry;
  }
  return out;
}

// ------------------------------------------------------------ series ----
test("series: extracts calories from items", () => {
  const s = E.nutritionSeries({ "2026-01-01": { items: [{ cals: 300 }, { cals: 200 }] } });
  assert.strictEqual(s[0].cals, 500);
});
test("series: also reads the meals structure", () => {
  const s = E.nutritionSeries({ "2026-01-01": { meals: { Breakfast: [{ cals: 400 }], Lunch: [{ cals: 100 }] } } });
  assert.strictEqual(s[0].cals, 500);
});
test("series: ignores metadata and title-keyed junk", () => {
  const s = E.nutritionSeries({ _settings: { x: 1 }, "Untitled": { items: [{ cals: 999 }] }, "2026-01-01": { items: [{ cals: 100 }] } });
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].date, "2026-01-01");
});
test("series: comes back in date order", () => {
  const s = E.nutritionSeries({ "2026-01-03": {}, "2026-01-01": {}, "2026-01-02": {} });
  assert.deepStrictEqual(s.map(d => d.date), ["2026-01-01", "2026-01-02", "2026-01-03"]);
});
test("series: a day with no weight reports null, not zero", () => {
  assert.strictEqual(E.nutritionSeries({ "2026-01-01": { items: [] } })[0].weight, null);
});

// ------------------------------------------------------- maintenance ----
test("maintenance: weight held flat means maintenance equals intake", () => {
  const r = E.computeMaintenanceCalories(db({ days: 28, cals: 2500, startW: 70, endW: 70 }));
  assert.ok(r.ok, r.reason);
  assert.ok(Math.abs(r.maintenance - 2500) < 25, "got " + r.maintenance);
});
test("maintenance: losing weight means maintenance is ABOVE intake", () => {
  const r = E.computeMaintenanceCalories(db({ days: 28, cals: 2000, startW: 72, endW: 70 }));
  assert.ok(r.ok, r.reason);
  assert.ok(r.maintenance > 2000, "got " + r.maintenance);
});
test("maintenance: gaining weight means maintenance is BELOW intake", () => {
  const r = E.computeMaintenanceCalories(db({ days: 28, cals: 3000, startW: 70, endW: 72 }));
  assert.ok(r.ok, r.reason);
  assert.ok(r.maintenance < 3000, "got " + r.maintenance);
});
test("maintenance: the arithmetic is right", () => {
  // 2kg lost over 27 days at 7700 kcal/kg = 570 kcal/day deficit.
  const r = E.computeMaintenanceCalories(db({ days: 28, cals: 2000, startW: 72, endW: 70 }));
  const expected = 2000 + (2 * 7700) / 27;
  assert.ok(Math.abs(r.maintenance - expected) < 30, r.maintenance + " vs " + Math.round(expected));
});
test("maintenance: reports the observed weight change", () => {
  const r = E.computeMaintenanceCalories(db({ days: 28, cals: 2000, startW: 72, endW: 70 }));
  assert.ok(Math.abs(r.weightDelta + 2) < 0.1, "got " + r.weightDelta);
});

// ------------------------------------------------------- refusals -------
test("refuses: a single weigh-in is not a trend", () => {
  const d = db({ days: 28, cals: 2500, startW: 70, endW: 70, weighEvery: 999 });
  const r = E.computeMaintenanceCalories(d);
  assert.strictEqual(r.ok, false);
  assert.ok(/two different days/.test(r.reason), r.reason);
});
test("refuses: too few food logs", () => {
  const d = db({ days: 28, cals: 2500, startW: 72, endW: 70, foodEvery: 999 });
  const r = E.computeMaintenanceCalories(d);
  assert.strictEqual(r.ok, false);
  assert.ok(/more day/.test(r.reason), r.reason);
});
test("refuses: too short a span between weigh-ins", () => {
  const r = E.computeMaintenanceCalories(db({ days: 5, cals: 2500, startW: 70, endW: 70 }));
  assert.strictEqual(r.ok, false);
  assert.ok(/Needs 10 days/.test(r.reason), r.reason);
});
test("refuses: empty or junk input returns null, never a number", () => {
  assert.strictEqual(E.computeMaintenanceCalories({}), null);
  assert.strictEqual(E.computeMaintenanceCalories(null), null);
});
test("refuses: never claims ok without a maintenance figure", () => {
  const r = E.computeMaintenanceCalories(db({ days: 5, cals: 2500, startW: 70, endW: 70 }));
  assert.strictEqual(r.maintenance, undefined);
});

// ----------------------------------------------------- confidence -------
test("confidence: a long well-logged run reads good", () => {
  const r = E.computeMaintenanceCalories(db({ days: 28, cals: 2500, startW: 70, endW: 70 }));
  assert.strictEqual(r.confidence, "good");
});
test("confidence: a sparse run is downgraded", () => {
  const r = E.computeMaintenanceCalories(db({ days: 14, cals: 2500, startW: 70, endW: 70, foodEvery: 2 }));
  assert.ok(["fair", "rough"].includes(r.confidence), "got " + r.confidence);
});

// -------------------------------------------------------- formula -------
test("formula: still available for comparison", () => {
  assert.strictEqual(E.formulaMaintenance(70), 2240);
});
test("formula: junk in, null out", () => {
  assert.strictEqual(E.formulaMaintenance(0), null);
  assert.strictEqual(E.formulaMaintenance("abc"), null);
});
test("formula and real data can disagree — that is the point", () => {
  const r = E.computeMaintenanceCalories(db({ days: 28, cals: 2900, startW: 70, endW: 70 }));
  assert.notStrictEqual(r.maintenance, E.formulaMaintenance(70));
});

// -------------------------------------------------------- protein -------
test("protein: multiplies weight by the g/kg setting", () => {
  assert.strictEqual(E.proteinTargetFor(72, 2.0), 144);
  assert.strictEqual(E.proteinTargetFor(80, 1.6), 128);
});
test("protein: defaults to 2.0 g/kg", () => {
  assert.strictEqual(E.proteinTargetFor(70), 140);
});
test("protein: a bad per-kg value falls back rather than returning nonsense", () => {
  assert.strictEqual(E.proteinTargetFor(70, 0), 140);
  assert.strictEqual(E.proteinTargetFor(70, "abc"), 140);
});
test("protein: no weight means no target", () => {
  assert.strictEqual(E.proteinTargetFor(0), null);
  assert.strictEqual(E.proteinTargetFor(null), null);
});
test("protein: rises with bodyweight", () => {
  assert.ok(E.proteinTargetFor(80, 2) > E.proteinTargetFor(70, 2));
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
