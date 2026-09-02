// Tests for the autoregulation layer (readiness / deload / stall context
// folded into the progression ladder).
// Run with:  node test/test-autoreg.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const { SomaIntelligenceEngine: E } = loadPlugin();

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

const LAST = { weight: 100, reps: 10, failure: 1 }; // ladder would say +5kg

// --------------------------------------------------------- increments ----
test("increment: kg uses 2.5, lb uses 5", () => {
  assert.strictEqual(E.loadIncrement("kg"), 2.5);
  assert.strictEqual(E.loadIncrement("lb"), 5);
});

// ------------------------------------------------------------ deload ----
test("deload: cuts to 60% of last load", () => {
  const r = E.computeAutoregulatedTarget(LAST, { isDeload: true });
  assert.strictEqual(r.weight, 60);
  assert.strictEqual(r.diffTier, "Deload");
  assert.ok(r.adjusted);
});
test("deload: result stays loadable on the bar", () => {
  const r = E.computeAutoregulatedTarget({ weight: 87.5, reps: 8, failure: 3 }, { isDeload: true });
  assert.strictEqual(r.weight % 2.5, 0, r.weight + " not loadable");
});
test("deload: bodyweight stays at bodyweight", () => {
  const r = E.computeAutoregulatedTarget({ weight: 0, reps: 12, failure: 3 }, { isDeload: true, isBW: true });
  assert.strictEqual(r.weight, 0);
});
test("deload: outranks a high readiness score", () => {
  const r = E.computeAutoregulatedTarget(LAST, { isDeload: true, readiness: 100 });
  assert.strictEqual(r.diffTier, "Deload");
});

// -------------------------------------------------------- readiness ----
test("readiness < 40: backs load off rather than adding", () => {
  const r = E.computeAutoregulatedTarget(LAST, { readiness: 25 });
  assert.strictEqual(r.weight, 90);
  assert.strictEqual(r.diffTier, "Under-recovered");
  assert.ok(r.autoNote.includes("25%"));
});
test("readiness < 40: never prescribes more than the ladder would", () => {
  const laddered = E.computeOverloadRecommendation(LAST);
  const r = E.computeAutoregulatedTarget(LAST, { readiness: 10 });
  assert.ok(r.weight < laddered.weight);
});
test("readiness 40-69: vetoes the load surge, chases a rep instead", () => {
  const r = E.computeAutoregulatedTarget(LAST, { readiness: 55 });
  assert.strictEqual(r.weight, 100, "should hold load");
  assert.strictEqual(r.reps, 11, "should add a rep");
  assert.strictEqual(r.diffTier, "Hold (Recovering)");
});
test("readiness 40-69: leaves a hold-target untouched", () => {
  // RPE 5 -> ladder already says hold; nothing to veto.
  const r = E.computeAutoregulatedTarget({ weight: 100, reps: 8, failure: 5 }, { readiness: 55 });
  assert.strictEqual(r.weight, 100);
  assert.strictEqual(r.adjusted, false);
});
test("readiness >= 90: ladder passes through unchanged", () => {
  const laddered = E.computeOverloadRecommendation(LAST);
  const r = E.computeAutoregulatedTarget(LAST, { readiness: 95 });
  assert.strictEqual(r.weight, laddered.weight);
  assert.strictEqual(r.reps, laddered.reps);
  assert.strictEqual(r.adjusted, false);
});
test("readiness null: behaves exactly like the bare ladder", () => {
  const laddered = E.computeOverloadRecommendation(LAST);
  const r = E.computeAutoregulatedTarget(LAST, {});
  assert.strictEqual(r.weight, laddered.weight);
  assert.strictEqual(r.reps, laddered.reps);
});
test("readiness: lb units round to a loadable 5lb step", () => {
  const r = E.computeAutoregulatedTarget({ weight: 225, reps: 5, failure: 1 }, { readiness: 20, unit: "lb" });
  assert.strictEqual(r.weight % 5, 0, r.weight + " not loadable in lb");
});

// ------------------------------------------------------------ trend ----
const mkHistory = (est1RMs) => {
  const h = {};
  est1RMs.forEach((w, i) => {
    h["2026-01-0" + (i + 1)] = {
      timestamp: new Date(2026, 0, i + 1).getTime(),
      exercises: [{ name: "Squat", sets: [{ weight: w, reps: 1, done: true, type: "normal" }] }]
    };
  });
  return h;
};

test("trend: rising 1RM reads as up and not stalled", () => {
  const t = E.computeVolumeTrend(mkHistory([100, 105, 110]), "Squat");
  assert.strictEqual(t.direction, "up");
  assert.strictEqual(t.stalled, false);
});
test("trend: flat 1RM across the window reads as stalled", () => {
  const t = E.computeVolumeTrend(mkHistory([100, 100, 100]), "Squat");
  assert.strictEqual(t.direction, "flat");
  assert.strictEqual(t.stalled, true);
});
test("trend: falling 1RM reads as down and stalled", () => {
  const t = E.computeVolumeTrend(mkHistory([110, 105, 100]), "Squat");
  assert.strictEqual(t.direction, "down");
  assert.strictEqual(t.stalled, true);
});
test("trend: too few sessions never claims a stall", () => {
  const t = E.computeVolumeTrend(mkHistory([100, 100]), "Squat");
  assert.strictEqual(t.stalled, false);
});
test("trend: drop sets are excluded from the trend line", () => {
  const h = {
    "2026-01-01": { timestamp: 1, exercises: [{ name: "Squat", sets: [
      { weight: 100, reps: 5, done: true, type: "normal" },
      { weight: 60,  reps: 12, done: true, type: "dropset" }
    ]}]}
  };
  const t = E.computeVolumeTrend(h, "Squat");
  // The top set, not the lighter drop set, defines the point.
  assert.ok(t.points[0].est1RM > 100, "drop set dragged the trend down");
});
test("trend: incomplete sets are ignored", () => {
  const h = {
    "2026-01-01": { timestamp: 1, exercises: [{ name: "Squat", sets: [
      { weight: 200, reps: 5, done: false, type: "normal" }
    ]}]}
  };
  assert.strictEqual(E.computeVolumeTrend(h, "Squat").points.length, 0);
});
test("trend: unknown exercise degrades gracefully", () => {
  const t = E.computeVolumeTrend(mkHistory([100, 105]), "Bench Press");
  assert.strictEqual(t.direction, "unknown");
  assert.strictEqual(t.stalled, false);
});
test("trend: null history degrades gracefully", () => {
  assert.strictEqual(E.computeVolumeTrend(null, "Squat").stalled, false);
});
test("trend: bar exercises count the bar in the estimate", () => {
  const h = {
    "2026-01-01": { timestamp: 1, exercises: [{
      name: "Squat", usesBar: true, barWeight: 20,
      sets: [{ weight: 100, reps: 1, done: true, type: "normal" }]
    }]}
  };
  assert.strictEqual(E.computeVolumeTrend(h, "Squat").points[0].est1RM, 120);
});

// ----------------------------------------------- stall interaction ----
test("stall: a recovered but stalled lift is flagged, not loaded up", () => {
  const trend = E.computeVolumeTrend(mkHistory([100, 100, 100]), "Squat");
  const r = E.computeAutoregulatedTarget(LAST, { readiness: 95, trend });
  assert.strictEqual(r.diffTier, "Stalled");
  assert.ok(r.adjusted);
  assert.ok(/swap the variation/.test(r.autoNote));
});
test("stall: under-recovery takes precedence over a stall", () => {
  const trend = E.computeVolumeTrend(mkHistory([100, 100, 100]), "Squat");
  const r = E.computeAutoregulatedTarget(LAST, { readiness: 20, trend });
  assert.strictEqual(r.diffTier, "Under-recovered");
});
test("stall: a progressing lift is never flagged as stalled", () => {
  const trend = E.computeVolumeTrend(mkHistory([100, 105, 110]), "Squat");
  const r = E.computeAutoregulatedTarget(LAST, { readiness: 95, trend });
  assert.notStrictEqual(r.diffTier, "Stalled");
});

// ------------------------------------------------------ invariants ----
test("invariant: never returns a negative load", () => {
  for (const readiness of [null, 0, 30, 55, 75, 100]) {
    for (const isDeload of [true, false]) {
      const r = E.computeAutoregulatedTarget({ weight: 5, reps: 5, failure: 5 }, { readiness, isDeload });
      assert.ok(r.weight >= 0, "negative weight at readiness=" + readiness);
    }
  }
});
test("invariant: always returns usable reps", () => {
  for (const readiness of [null, 0, 30, 55, 75, 100]) {
    const r = E.computeAutoregulatedTarget(LAST, { readiness });
    assert.ok(r.reps >= 1 && isFinite(r.reps), "bad reps at readiness=" + readiness);
  }
});
test("invariant: handles a missing lastSet at every readiness level", () => {
  for (const readiness of [null, 0, 50, 100]) {
    const r = E.computeAutoregulatedTarget(null, { readiness });
    assert.ok(r && typeof r.weight === "number" && isFinite(r.weight));
  }
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
