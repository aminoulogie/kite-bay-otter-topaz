// Phase 5: routine storage — merging built-ins with user edits, and the
// rules that stop a bad routine being saved.
// Run with:  node test/test-routines.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const E = loadPlugin().SomaIntelligenceEngine;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

const BUILT = {
  "Push": [{ name: "Bench" }, { name: "Fly" }],
  "Pull": [{ name: "Row" }],
  "Legs": [{ name: "Squat" }]
};

// ---------------------------------------------------------- merging ----
test("merge: with no edits you get the built-ins unchanged", () => {
  assert.deepStrictEqual(E.mergeRoutines(BUILT, {}), BUILT);
});
test("merge: a user routine is added alongside", () => {
  const r = E.mergeRoutines(BUILT, { "Arms": [{ name: "Curl" }] });
  assert.strictEqual(Object.keys(r).length, 4);
  assert.deepStrictEqual(r["Arms"], [{ name: "Curl" }]);
});
test("merge: editing a built-in overrides it", () => {
  const r = E.mergeRoutines(BUILT, { "Push": [{ name: "Incline" }] });
  assert.deepStrictEqual(r["Push"], [{ name: "Incline" }]);
});
test("merge: a deleted built-in stays deleted", () => {
  const r = E.mergeRoutines(BUILT, { _removed: ["Pull"] });
  assert.ok(!("Pull" in r));
  assert.ok("Push" in r);
});
test("merge: underscore keys are bookkeeping, never routines", () => {
  const r = E.mergeRoutines(BUILT, { _removed: ["Pull"], _other: [{ name: "x" }] });
  assert.ok(!("_removed" in r));
  assert.ok(!("_other" in r));
});
test("merge: a deleted built-in can be recreated by the user", () => {
  const r = E.mergeRoutines(BUILT, { _removed: ["Pull"], "Pull": [{ name: "New Row" }] });
  assert.deepStrictEqual(r["Pull"], [{ name: "New Row" }]);
});
test("merge: null/undefined inputs are safe", () => {
  assert.deepStrictEqual(E.mergeRoutines(null, null), {});
  assert.deepStrictEqual(E.mergeRoutines(BUILT, null), BUILT);
});
test("merge: does not mutate the built-in presets", () => {
  const snapshot = JSON.stringify(BUILT);
  E.mergeRoutines(BUILT, { "Push": [{ name: "Changed" }], _removed: ["Legs"] });
  assert.strictEqual(JSON.stringify(BUILT), snapshot, "built-ins were mutated");
});

// ------------------------------------------------------ normalizing ----
test("normalize: plain strings become {name} objects", () => {
  assert.deepStrictEqual(E.normalizeRoutine(["Squat", "Bench"]), [{ name: "Squat" }, { name: "Bench" }]);
});
test("normalize: trims whitespace", () => {
  assert.deepStrictEqual(E.normalizeRoutine(["  Squat  "]), [{ name: "Squat" }]);
});
test("normalize: drops blanks and junk entries", () => {
  assert.deepStrictEqual(E.normalizeRoutine(["", "   ", null, 42, {}, { name: "" }, { name: "Ok" }]), [{ name: "Ok" }]);
});
test("normalize: keeps order", () => {
  assert.deepStrictEqual(E.normalizeRoutine(["A", "B", "C"]).map(x => x.name), ["A", "B", "C"]);
});
test("normalize: non-array input yields an empty routine", () => {
  assert.deepStrictEqual(E.normalizeRoutine(null), []);
  assert.deepStrictEqual(E.normalizeRoutine("Squat"), []);
});
test("normalize: strips extra fields down to the name", () => {
  assert.deepStrictEqual(E.normalizeRoutine([{ name: "Squat", junk: 1 }]), [{ name: "Squat" }]);
});

// -------------------------------------------------- name validation ----
test("name: a normal name is accepted and trimmed", () => {
  const r = E.validateRoutineName("  Upper A  ", BUILT);
  assert.ok(r.ok);
  assert.strictEqual(r.name, "Upper A");
});
test("name: blank is refused", () => {
  assert.strictEqual(E.validateRoutineName("   ", BUILT).ok, false);
  assert.strictEqual(E.validateRoutineName(null, BUILT).ok, false);
});
test("name: a duplicate is refused", () => {
  const r = E.validateRoutineName("Push", BUILT);
  assert.strictEqual(r.ok, false);
  assert.ok(/already exists/.test(r.error), r.error);
});
test("name: keeping your own name while editing is allowed", () => {
  assert.ok(E.validateRoutineName("Push", BUILT, "Push").ok);
});
test("name: renaming onto another routine is still refused", () => {
  assert.strictEqual(E.validateRoutineName("Pull", BUILT, "Push").ok, false);
});
test("name: leading underscore is refused (reserved for bookkeeping)", () => {
  const r = E.validateRoutineName("_removed", BUILT);
  assert.strictEqual(r.ok, false);
  assert.ok(/underscore/.test(r.error), r.error);
});
test("name: absurdly long names are refused", () => {
  assert.strictEqual(E.validateRoutineName("x".repeat(61), BUILT).ok, false);
});
test("name: every refusal explains itself", () => {
  ["", "_x", "Push", "y".repeat(99)].forEach(n => {
    const r = E.validateRoutineName(n, BUILT);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error && r.error.length > 5, "no useful error for " + JSON.stringify(n));
  });
});

// ----------------------------------------------------- round trip -----
test("round trip: create, rename, delete leaves a consistent set", () => {
  let custom = {};
  // create
  custom["Arms"] = [{ name: "Curl" }];
  assert.ok("Arms" in E.mergeRoutines(BUILT, custom));
  // rename Arms -> Guns
  const check = E.validateRoutineName("Guns", E.mergeRoutines(BUILT, custom), "Arms");
  assert.ok(check.ok);
  custom["Guns"] = custom["Arms"]; delete custom["Arms"];
  let merged = E.mergeRoutines(BUILT, custom);
  assert.ok("Guns" in merged && !("Arms" in merged));
  // delete a built-in
  delete custom["Push"];
  custom._removed = ["Push"];
  merged = E.mergeRoutines(BUILT, custom);
  assert.ok(!("Push" in merged));
  assert.ok("Guns" in merged && "Pull" in merged && "Legs" in merged);
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
