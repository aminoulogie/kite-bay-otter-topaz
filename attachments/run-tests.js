// Test suite for the pure logic in SOMA Smart Coach.
// Run with:  node test/run-tests.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const P = loadPlugin();
const { SomaIntelligenceEngine: E, migrateHistory, sessionIsEmpty,
        isDateKey, getLocalDateKey, parseLocalDateKey,
        SOMA_SCHEMA_VERSION } = P;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}
const close = (a, b, tol = 0.05) =>
  assert.ok(Math.abs(a - b) <= tol, "expected ~" + b + ", got " + a);

// ---------------------------------------------------------------- 1RM ----
test("1RM: a single rep is the weight itself", () => {
  assert.strictEqual(E.calculate1RM(100, 1), 100);
});
test("1RM: averages Epley and Brzycki", () => {
  // Epley 100*(1+5/30)=116.67 ; Brzycki 100*36/32=112.5 ; mean 114.58
  close(E.calculate1RM(100, 5), 114.6);
});
test("1RM: rises with reps at fixed load", () => {
  assert.ok(E.calculate1RM(100, 8) > E.calculate1RM(100, 5));
});
test("1RM: zero/invalid input yields 0", () => {
  assert.strictEqual(E.calculate1RM(0, 5), 0);
  assert.strictEqual(E.calculate1RM(100, 0), 0);
  assert.strictEqual(E.calculate1RM("", ""), 0);
});
test("1RM: reps >= 37 falls back to Epley (no negative divisor)", () => {
  const r = E.calculate1RM(50, 40);
  assert.ok(r > 0 && isFinite(r), "got " + r);
});

// ------------------------------------------------------------- volume ----
test("volume: weight x reps", () => {
  assert.strictEqual(E.calculateWorkVolume(80, 10), 800);
});
test("volume: bodyweight set uses 65% of bodyweight", () => {
  assert.strictEqual(E.calculateWorkVolume(0, 10, true, 75), Math.round(75 * 0.65 * 10));
});
test("volume: loaded bodyweight set uses the added load", () => {
  assert.strictEqual(E.calculateWorkVolume(20, 10, true, 75), 200);
});

// -------------------------------------------------------- plate stack ----
test("plates: 100kg on a 20kg bar = 40 per side", () => {
  const plates = E.calculatePlateStack(100, 20, "kg");
  const perSide = plates.reduce((a, p) => a + p.weight, 0);
  close(perSide, 40, 0.001);
});
test("plates: bar-only target returns no plates", () => {
  assert.deepStrictEqual(E.calculatePlateStack(20, 20, "kg"), []);
});
test("plates: sub-bar target returns no plates", () => {
  assert.deepStrictEqual(E.calculatePlateStack(15, 20, "kg"), []);
});
test("plates: no floating-point drift on 2.5 increments", () => {
  const plates = E.calculatePlateStack(62.5, 20, "kg");
  const perSide = plates.reduce((a, p) => a + p.weight, 0);
  close(perSide, 21.25, 0.001);
});
test("plates: lb bar uses lb plate set", () => {
  const plates = E.calculatePlateStack(225, 45, "lb");
  const perSide = plates.reduce((a, p) => a + p.weight, 0);
  close(perSide, 90, 0.001);
});

// -------------------------------------------------------- warmup ramp ----
test("warmup: three ascending loadable steps", () => {
  const ramp = E.calculateWarmupRamp(100, 20, "kg");
  assert.strictEqual(ramp.length, 3);
  assert.ok(ramp[0].weight <= ramp[1].weight && ramp[1].weight <= ramp[2].weight);
  ramp.forEach(s => assert.strictEqual(s.weight % 2.5, 0, s.weight + " not loadable"));
});
test("warmup: never prescribes less than the bar", () => {
  const ramp = E.calculateWarmupRamp(25, 20, "kg");
  ramp.forEach(s => assert.ok(s.weight >= 20, s.weight + " < bar"));
});

// ---------------------------------------------------------- overload ----
test("overload: no history gives a baseline", () => {
  assert.strictEqual(E.computeOverloadRecommendation(null).diffTier, "New");
});
test("overload: RPE 1 (very easy) adds load aggressively", () => {
  const r = E.computeOverloadRecommendation({ weight: 100, reps: 10, failure: 1 });
  assert.strictEqual(r.weight, 105);
});
test("overload: RPE 2 adds a moderate step", () => {
  const r = E.computeOverloadRecommendation({ weight: 100, reps: 10, failure: 2 });
  assert.strictEqual(r.weight, 102.5);
});
test("overload: RPE 3 consolidates with +1 rep at same load", () => {
  const r = E.computeOverloadRecommendation({ weight: 100, reps: 9, failure: 3 });
  assert.strictEqual(r.weight, 100);
  assert.strictEqual(r.reps, 10);
});
test("overload: RPE 3 at the 12-rep ceiling steps weight up and resets reps", () => {
  const r = E.computeOverloadRecommendation({ weight: 100, reps: 12, failure: 3 });
  assert.strictEqual(r.weight, 102.5);
  assert.strictEqual(r.reps, 8);
});
test("overload: RPE 5 (failure) holds the load", () => {
  const r = E.computeOverloadRecommendation({ weight: 100, reps: 8, failure: 5 });
  assert.strictEqual(r.weight, 100);
  assert.strictEqual(r.reps, 8);
});
test("overload: bodyweight progresses reps, never load", () => {
  const r = E.computeOverloadRecommendation({ weight: 0, reps: 10, failure: 1 }, true);
  assert.strictEqual(r.weight, 0);
  assert.strictEqual(r.reps, 12);
});
test("overload: tolerates string-typed fields from the input handlers", () => {
  const r = E.computeOverloadRecommendation({ weight: "100", reps: "10", failure: "2" });
  assert.strictEqual(r.weight, 102.5);
});

// ------------------------------------------------------------- dates ----
test("dates: local key round-trips without timezone slip", () => {
  const key = "2026-03-15";
  assert.strictEqual(getLocalDateKey(parseLocalDateKey(key)), key);
});
test("dates: key format is recognised", () => {
  assert.ok(isDateKey("2026-08-27"));
  assert.ok(!isDateKey("daily template"));
  assert.ok(!isDateKey("2026-08-27 1"));
});
test("program: projected day is stable and names a split", () => {
  const d = new Date(2026, 7, 27, 12, 0, 0);
  const a = E.getProgramProjectedDay(d, {});
  const b = E.getProgramProjectedDay(d, {});
  assert.strictEqual(a.split, b.split);
  assert.ok(P.ROTATION_SEQUENCE.includes(a.split));
});
test("program: a schedule override wins over the rotation", () => {
  const d = new Date(2026, 7, 27, 12, 0, 0);
  const r = E.getProgramProjectedDay(d, { "2026-08-27": "Rest Day" });
  assert.strictEqual(r.split, "Rest Day");
  assert.strictEqual(r.isRest, true);
});

// ---------------------------------------------------------------- PRs ----
const prHistory = {
  "2026-01-01": { timestamp: 1, exercises: [
    { name: "Bench Press", sets: [{ weight: 100, reps: 5, done: true }] }
  ]}
};
test("PR: a heavier top set is a weight PR", () => {
  const pr = E.detectPersonalRecords(prHistory, "Bench Press", 105, 5);
  assert.ok(pr && pr.isWeightPR);
});
test("PR: more reps at the same load is a rep PR", () => {
  const pr = E.detectPersonalRecords(prHistory, "Bench Press", 100, 7);
  assert.ok(pr && pr.isRepPR);
});
test("PR: a lighter, lower set is not a PR", () => {
  assert.strictEqual(E.detectPersonalRecords(prHistory, "Bench Press", 80, 3), null);
});
test("PR: exercise name match is case-insensitive", () => {
  assert.ok(E.detectPersonalRecords(prHistory, "bench press", 110, 5));
});
test("PR: an unseen exercise reports no PR (no baseline to beat)", () => {
  assert.strictEqual(E.detectPersonalRecords(prHistory, "Deadlift", 200, 5), null);
});

// --------------------------------------------------------- migration ----
const sessionKeys = (h) => Object.keys(h).filter(k => k !== "_schemaVersion");

test("migration: drops sessions with no exercises", () => {
  const { history } = migrateHistory({ "daily template": { timestamp: 1, exercises: [] } });
  assert.deepStrictEqual(sessionKeys(history), []);
});
test("migration: drops sessions whose exercises have no sets", () => {
  const { history } = migrateHistory({
    "2026-01-01": { timestamp: 1, exercises: [{ name: "Squat", sets: [] }] }
  });
  assert.deepStrictEqual(sessionKeys(history), []);
});
test("migration: keeps real sessions", () => {
  const { history } = migrateHistory({
    "2026-01-01": { timestamp: 1, exercises: [{ name: "Squat", sets: [{ weight: "100", reps: "5", done: true }] }] }
  });
  assert.ok(history["2026-01-01"]);
});
test("migration: coerces string weight/reps/failure to numbers", () => {
  const { history } = migrateHistory({
    "2026-01-01": { timestamp: 1, exercises: [
      { name: "Squat", sets: [{ weight: "100", reps: "5", failure: "3", done: true }] }
    ]}
  });
  const s = history["2026-01-01"].exercises[0].sets[0];
  assert.strictEqual(typeof s.weight, "number");
  assert.strictEqual(typeof s.reps, "number");
  assert.strictEqual(typeof s.failure, "number");
});
test("migration: backfills set type as normal", () => {
  const { history } = migrateHistory({
    "2026-01-01": { timestamp: 1, exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, done: true }] }] }
  });
  assert.strictEqual(history["2026-01-01"].exercises[0].sets[0].type, "normal");
});
test("migration: preserves an existing dropset marker", () => {
  const { history } = migrateHistory({
    "2026-01-01": { timestamp: 1, exercises: [
      { name: "Squat", sets: [{ weight: 80, reps: 8, done: true, type: "dropset" }] }
    ]}
  });
  assert.strictEqual(history["2026-01-01"].exercises[0].sets[0].type, "dropset");
});
test("migration: backfills supersetGroup", () => {
  const { history } = migrateHistory({
    "2026-01-01": { timestamp: 1, exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, done: true }] }] }
  });
  assert.strictEqual(history["2026-01-01"].exercises[0].supersetGroup, "");
});
test("migration: clamps an out-of-range RPE into 1-5", () => {
  const { history } = migrateHistory({
    "2026-01-01": { timestamp: 1, exercises: [
      { name: "Squat", sets: [{ weight: 100, reps: 5, failure: 99, done: true }] }
    ]}
  });
  assert.strictEqual(history["2026-01-01"].exercises[0].sets[0].failure, 5);
});
test("migration: re-keys a title-keyed session by its timestamp", () => {
  const ts = new Date(2026, 0, 2, 10, 0, 0).getTime();
  const { history } = migrateHistory({
    "some note title": { timestamp: ts, exercises: [
      { name: "Squat", sets: [{ weight: 100, reps: 5, done: true }] }
    ]}
  });
  assert.ok(history["2026-01-02"], "keys: " + sessionKeys(history));
});
test("migration: a recovered key never clobbers a real dated session", () => {
  const ts = new Date(2026, 0, 2, 10, 0, 0).getTime();
  const mk = (w) => ({ timestamp: ts, exercises: [{ name: "Squat", sets: [{ weight: w, reps: 5, done: true }] }] });
  const { history } = migrateHistory({ "2026-01-02": mk(100), "some note": mk(200) });
  assert.strictEqual(sessionKeys(history).length, 2, "keys: " + sessionKeys(history));
  assert.strictEqual(history["2026-01-02"].exercises[0].sets[0].weight, 100);
});
test("migration: stamps the schema version", () => {
  const { history } = migrateHistory({});
  assert.strictEqual(history._schemaVersion, SOMA_SCHEMA_VERSION);
});
test("migration: is idempotent", () => {
  const raw = {
    "2026-01-01": { timestamp: 1, exercises: [
      { name: "Squat", sets: [{ weight: "100", reps: "5", failure: "3", done: true }] }
    ]}
  };
  const first = migrateHistory(raw).history;
  const second = migrateHistory(first);
  assert.strictEqual(second.changed, false, "second pass should report no change");
  assert.deepStrictEqual(second.history, first);
});
test("migration: survives null and garbage input", () => {
  assert.deepStrictEqual(migrateHistory(null).history, {});
  assert.deepStrictEqual(migrateHistory("nope").history, {});
});
test("migration: reports which keys it dropped", () => {
  const { report } = migrateHistory({ "daily template": { timestamp: 1, exercises: [] } });
  assert.deepStrictEqual(report.dropped, ["daily template"]);
});

// -------------------------------------------------------------- guard ----
test("sessionIsEmpty: true for null, empty, and set-less sessions", () => {
  assert.ok(sessionIsEmpty(null));
  assert.ok(sessionIsEmpty({ exercises: [] }));
  assert.ok(sessionIsEmpty({ exercises: [{ name: "Squat", sets: [] }] }));
});
test("sessionIsEmpty: false once any set exists", () => {
  assert.ok(!sessionIsEmpty({ exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5 }] }] }));
});

// -------------------------------------------------------------- report ---
console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
