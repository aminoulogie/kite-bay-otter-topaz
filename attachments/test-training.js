// Phase 3: volume landmarks, rest timing, exercise substitution,
// warm-up sets and subjective readiness.
// Run with:  node test/test-training.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const P = loadPlugin();
const E = P.SomaIntelligenceEngine;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

const NOW = new Date(2026, 8, 1, 12, 0, 0).getTime();
const daysAgo = (n) => NOW - n * 86400000;

// Build a session with N working sets hitting the given muscle keys.
function session(ts, keys, setCount, type = "normal") {
  return {
    timestamp: ts,
    exercises: [{
      name: "Test Lift",
      targetKeys: keys,
      sets: Array.from({ length: setCount }, () => ({ weight: 100, reps: 8, done: true, type }))
    }]
  };
}

// ------------------------------------------------------- landmarks ----
test("landmarks: every entry is ordered mev < mav < mrv", () => {
  const lms = E.VOLUME_LANDMARKS;
  Object.entries(lms).forEach(([k, l]) => {
    assert.ok(l.mev < l.mav, k + ": mev not below mav");
    assert.ok(l.mav < l.mrv, k + ": mav not below mrv");
    assert.ok(l.label && l.label.length, k + ": no label");
  });
});
test("landmarks: cover the muscles the exercise DB actually targets", () => {
  const lms = E.VOLUME_LANDMARKS;
  const missing = new Set();
  (P.BASE_EXERCISE_DB || []).forEach(ex =>
    (ex.targetKeys || []).forEach(k => { if (!lms[k]) missing.add(k); })
  );
  assert.strictEqual(missing.size, 0, "no landmarks for: " + [...missing].join(", "));
});

// --------------------------------------------------- volume status ----
test("status: zero sets reads as not trained", () => {
  assert.strictEqual(E.volumeStatus(0, { mev: 8, mav: 16, mrv: 22 }).tier, "none");
});
test("status: below MEV is under, and says how many to add", () => {
  const r = E.volumeStatus(5, { mev: 8, mav: 16, mrv: 22 });
  assert.strictEqual(r.tier, "under");
  assert.ok(/add 3 sets/.test(r.note), r.note);
});
test("status: inside MEV-MAV is optimal", () => {
  assert.strictEqual(E.volumeStatus(12, { mev: 8, mav: 16, mrv: 22 }).tier, "optimal");
});
test("status: MEV and MAV boundaries are inclusive of optimal", () => {
  assert.strictEqual(E.volumeStatus(8,  { mev: 8, mav: 16, mrv: 22 }).tier, "optimal");
  assert.strictEqual(E.volumeStatus(16, { mev: 8, mav: 16, mrv: 22 }).tier, "optimal");
});
test("status: between MAV and MRV is high", () => {
  assert.strictEqual(E.volumeStatus(20, { mev: 8, mav: 16, mrv: 22 }).tier, "high");
});
test("status: past MRV is over, and says how many to cut", () => {
  const r = E.volumeStatus(25, { mev: 8, mav: 16, mrv: 22 });
  assert.strictEqual(r.tier, "over");
  assert.ok(/cut 3 sets/.test(r.note), r.note);
});
test("status: singular wording for a single set", () => {
  assert.ok(/add 1 set\b/.test(E.volumeStatus(7, { mev: 8, mav: 16, mrv: 22 }).note));
});

// --------------------------------------------------- weekly volume ----
test("volume: counts working sets in the window", () => {
  const h = { a: session(daysAgo(2), ["chest"], 4) };
  assert.strictEqual(E.weeklyVolumeByMuscle(h, 7, NOW).chest, 4);
});
test("volume: ignores sessions outside the window", () => {
  const h = { a: session(daysAgo(20), ["chest"], 4) };
  assert.strictEqual(E.weeklyVolumeByMuscle(h, 7, NOW).chest, undefined);
});
test("volume: sums across multiple sessions", () => {
  const h = { a: session(daysAgo(1), ["chest"], 3), b: session(daysAgo(4), ["chest"], 5) };
  assert.strictEqual(E.weeklyVolumeByMuscle(h, 7, NOW).chest, 8);
});
test("volume: one exercise credits every muscle it targets", () => {
  const v = E.weeklyVolumeByMuscle({ a: session(daysAgo(1), ["chest", "triceps"], 3) }, 7, NOW);
  assert.strictEqual(v.chest, 3);
  assert.strictEqual(v.triceps, 3);
});
test("volume: warm-up sets are NOT counted", () => {
  const h = { a: session(daysAgo(1), ["chest"], 5, "warmup") };
  assert.strictEqual(E.weeklyVolumeByMuscle(h, 7, NOW).chest, undefined);
});
test("volume: drop sets are NOT counted", () => {
  const h = { a: session(daysAgo(1), ["chest"], 5, "dropset") };
  assert.strictEqual(E.weeklyVolumeByMuscle(h, 7, NOW).chest, undefined);
});
test("volume: mixed session counts only the working sets", () => {
  const h = { a: { timestamp: daysAgo(1), exercises: [{
    name: "Bench", targetKeys: ["chest"], sets: [
      { done: true, type: "warmup" }, { done: true, type: "warmup" },
      { done: true, type: "normal" }, { done: true, type: "normal" }, { done: true, type: "normal" },
      { done: true, type: "dropset" }
    ]}]}};
  assert.strictEqual(E.weeklyVolumeByMuscle(h, 7, NOW).chest, 3);
});
test("volume: incomplete sets are not counted", () => {
  const h = { a: { timestamp: daysAgo(1), exercises: [{
    name: "Bench", targetKeys: ["chest"], sets: [{ done: false, type: "normal" }]}]}};
  assert.strictEqual(E.weeklyVolumeByMuscle(h, 7, NOW).chest, undefined);
});
test("volume: empty/garbage history is safe", () => {
  assert.deepStrictEqual(E.weeklyVolumeByMuscle({}, 7, NOW), {});
  assert.deepStrictEqual(E.weeklyVolumeByMuscle(null, 7, NOW), {});
});

// -------------------------------------------------------- report ------
test("report: variants of one muscle appear as a single row", () => {
  const h = { a: session(daysAgo(1), ["triceps", "triceps_back"], 4) };
  const tri = E.volumeReport(h, 7, NOW).filter(r => r.label === "Triceps");
  assert.strictEqual(tri.length, 1, "Triceps appears " + tri.length + " times");
});
test("report: an exercise listing both triceps keys counts its sets ONCE", () => {
  // Most pressing movements list triceps and triceps_back together. Summing
  // the keys would report double the sets actually performed.
  const h = { a: session(daysAgo(1), ["triceps", "triceps_back"], 4) };
  const tri = E.volumeReport(h, 7, NOW).find(r => r.label === "Triceps");
  assert.strictEqual(tri.sets, 4, "double counted: got " + tri.sets);
});
test("report: two different exercises hitting the same muscle DO add up", () => {
  const h = {
    a: session(daysAgo(1), ["triceps", "triceps_back"], 4),
    b: session(daysAgo(2), ["triceps"], 3)
  };
  const tri = E.volumeReport(h, 7, NOW).find(r => r.label === "Triceps");
  assert.strictEqual(tri.sets, 7);
});
test("report: an exercise crediting two DIFFERENT muscles counts for both", () => {
  const h = { a: session(daysAgo(1), ["chest", "triceps"], 5) };
  const rows = E.volumeReport(h, 7, NOW);
  assert.strictEqual(rows.find(r => r.label === "Chest").sets, 5);
  assert.strictEqual(rows.find(r => r.label === "Triceps").sets, 5);
});
test("report: sorts problems above healthy muscles", () => {
  const h = {
    over:  session(daysAgo(1), ["chest"], 30),
    fine:  session(daysAgo(2), ["quadriceps"], 12)
  };
  const rows = E.volumeReport(h, 7, NOW);
  const iOver = rows.findIndex(r => r.label === "Chest");
  const iFine = rows.findIndex(r => r.label === "Quads");
  assert.ok(iOver < iFine, "over-volume muscle should rank first");
});
test("report: untrained muscles still appear", () => {
  const rows = E.volumeReport({}, 7, NOW);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.sets === 0));
});

// ---------------------------------------------------------- rest ------
const S = { restDefault: 90 };
test("rest: a normal set gets the configured default", () => {
  assert.strictEqual(E.restForSet({}, { type: "normal" }, [], S).seconds, 90);
});
test("rest: a drop set gets 15s", () => {
  assert.strictEqual(E.restForSet({}, { type: "dropset" }, [], S).seconds, 15);
});
test("rest: a warm-up gets a short rest, never the full default", () => {
  const r = E.restForSet({}, { type: "warmup" }, [], S);
  assert.ok(r.seconds > 0 && r.seconds < 90, "got " + r.seconds);
});
test("rest: mid-superset means no rest, and names the next lift", () => {
  const a = { name: "Curl", supersetGroup: "A" };
  const b = { name: "Pushdown", supersetGroup: "A" };
  const r = E.restForSet(a, { type: "normal" }, [a, b], S);
  assert.strictEqual(r.seconds, 0);
  assert.strictEqual(r.nextExercise, "Pushdown");
});
test("rest: the last lift of a superset gets full rest", () => {
  const a = { name: "Curl", supersetGroup: "A" };
  const b = { name: "Pushdown", supersetGroup: "A" };
  assert.strictEqual(E.restForSet(b, { type: "normal" }, [a, b], S).seconds, 90);
});
test("rest: a lone exercise tagged into a group is not a superset", () => {
  const a = { name: "Curl", supersetGroup: "A" };
  assert.strictEqual(E.restForSet(a, { type: "normal" }, [a], S).seconds, 90);
});
test("rest: different groups do not pair with each other", () => {
  const a = { name: "Curl", supersetGroup: "A" };
  const b = { name: "Row", supersetGroup: "B" };
  assert.strictEqual(E.restForSet(a, { type: "normal" }, [a, b], S).seconds, 90);
});
test("rest: a drop set inside a superset still gets its 15s", () => {
  const a = { name: "Curl", supersetGroup: "A" };
  const b = { name: "Pushdown", supersetGroup: "A" };
  assert.strictEqual(E.restForSet(a, { type: "dropset" }, [a, b], S).seconds, 15);
});
test("rest: missing settings fall back to a sane default", () => {
  assert.ok(E.restForSet({}, { type: "normal" }, [], undefined).seconds > 0);
});

// -------------------------------------------------- substitutions -----
const DB = [
  { name: "Barbell Row",         targetKeys: ["upper_back", "lower_back"], isAxial: true,  subTarget: "Lats" },
  { name: "Chest-Supported Row", targetKeys: ["upper_back"],               isAxial: false, subTarget: "Lats" },
  { name: "Lat Pulldown",        targetKeys: ["upper_back"],               isAxial: false, subTarget: "Lats" },
  { name: "Leg Press",           targetKeys: ["quadriceps"],               isAxial: false, subTarget: "Quads" }
];
test("swap: suggests fresher lifts that hit the same muscle", () => {
  const out = E.suggestAlternatives(DB[0], DB, { upper_back: 30, lower_back: 30, quadriceps: 95 });
  assert.ok(out.length > 0);
  assert.ok(out.every(o => o.name !== "Barbell Row"));
  assert.ok(!out.some(o => o.name === "Leg Press"), "unrelated muscle should not be suggested");
});
test("swap: an equally-tired lift that spares a fatigued secondary IS offered", () => {
  // Lats are just as tired either way, but a chest-supported row spares the
  // fried lower back — that is still worth suggesting.
  const out = E.suggestAlternatives(DB[0], DB, { upper_back: 30, lower_back: 30 });
  assert.ok(out.some(o => o.name === "Chest-Supported Row"), "got: " + out.map(o => o.name).join(", "));
});
test("swap: nothing offered when an alternative improves nothing", () => {
  // Identical target keys and identical readiness - no angle to gain.
  const twin = [
    { name: "Row A", targetKeys: ["upper_back"], isAxial: false },
    { name: "Row B", targetKeys: ["upper_back"], isAxial: false }
  ];
  assert.strictEqual(E.suggestAlternatives(twin[0], twin, { upper_back: 30 }).length, 0);
});
test("swap: prefers the freshest option first", () => {
  const out = E.suggestAlternatives(DB[0], DB, { upper_back: 90, lower_back: 20 });
  assert.ok(out.length > 0);
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i - 1].readiness >= out[i].readiness, "not sorted by readiness");
  }
});
test("swap: respects the result limit", () => {
  assert.ok(E.suggestAlternatives(DB[0], DB, { upper_back: 90, lower_back: 20 }, 1).length <= 1);
});
test("swap: flags whether the alternative is still axially loaded", () => {
  const out = E.suggestAlternatives(DB[0], DB, { upper_back: 90, lower_back: 20 });
  out.forEach(o => assert.ok(typeof o.isAxial === "boolean" && o.note.length));
});
test("swap: degrades safely on junk input", () => {
  assert.deepStrictEqual(E.suggestAlternatives(null, DB, {}), []);
  assert.deepStrictEqual(E.suggestAlternatives(DB[0], null, {}), []);
});

// ------------------------------------------------ subjective state ----
test("readiness: no input returns null rather than a fake score", () => {
  assert.strictEqual(E.computeSubjectiveReadiness({}), null);
});
test("readiness: a great night scores high", () => {
  const r = E.computeSubjectiveReadiness({ sleepHours: 8.5, sleepQuality: 5, soreness: 1, stress: 1 });
  assert.ok(r >= 90, "got " + r);
});
test("readiness: a terrible night scores low", () => {
  const r = E.computeSubjectiveReadiness({ sleepHours: 4, sleepQuality: 1, soreness: 5, stress: 5 });
  assert.ok(r <= 15, "got " + r);
});
test("readiness: more sleep never lowers the score", () => {
  const a = E.computeSubjectiveReadiness({ sleepHours: 5 });
  const b = E.computeSubjectiveReadiness({ sleepHours: 8 });
  assert.ok(b > a, a + " -> " + b);
});
test("readiness: more soreness never raises the score", () => {
  const a = E.computeSubjectiveReadiness({ soreness: 1 });
  const b = E.computeSubjectiveReadiness({ soreness: 5 });
  assert.ok(b < a, a + " -> " + b);
});
test("readiness: works from a single field", () => {
  assert.ok(typeof E.computeSubjectiveReadiness({ sleepHours: 7 }) === "number");
});
test("readiness: always lands inside 0-100", () => {
  [[-5, 1, 9, 9], [99, 5, -3, 0]].forEach(([h, q, so, st]) => {
    const r = E.computeSubjectiveReadiness({ sleepHours: h, sleepQuality: q, soreness: so, stress: st });
    assert.ok(r >= 0 && r <= 100, "out of range: " + r);
  });
});

// ------------------------------------------------------- blending -----
test("blend: feeling fine leaves muscle readiness untouched", () => {
  assert.strictEqual(E.blendReadiness(80, 85), 80);
});
test("blend: feeling wrecked pulls muscle readiness down", () => {
  assert.ok(E.blendReadiness(80, 20) < 80);
});
test("blend: feeling great never inflates an unrecovered muscle", () => {
  assert.strictEqual(E.blendReadiness(30, 100), 30);
});
test("blend: never returns below a 10 floor", () => {
  assert.ok(E.blendReadiness(12, 0) >= 10);
});
test("blend: missing either side degrades gracefully", () => {
  assert.strictEqual(E.blendReadiness(null, 60), 60);
  assert.strictEqual(E.blendReadiness(60, null), 60);
  assert.strictEqual(E.blendReadiness(null, null), null);
});

// ------------------------------- warm-ups excluded from history maths --
test("warm-up: excluded from the 1RM trend line", () => {
  const h = { "2026-01-01": { timestamp: 1, exercises: [{
    name: "Squat", sets: [
      { weight: 200, reps: 5, done: true, type: "warmup" },
      { weight: 100, reps: 5, done: true, type: "normal" }
    ]}]}};
  const t = E.computeVolumeTrend(h, "Squat");
  assert.ok(t.points[0].est1RM < E.calculate1RM(200, 5), "warm-up leaked into the trend");
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
