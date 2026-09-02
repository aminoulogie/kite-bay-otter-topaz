// Locks in the widget split: the workout widget must never grow a macro or
// habit tab, and the macros widget must never grow a workout tab.
// Run with:  node test/test-profiles.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const { WIDGET_PROFILES: P, ALL_DOCK_TABS: TABS } = loadPlugin();

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

// ------------------------------------------------------- separation ----
test("workout widget has no macro tab", () => {
  assert.ok(!P.workout.tabs.includes("pane-macros"));
});
test("workout widget has no weight tab (weight lives with macros)", () => {
  assert.ok(!P.workout.tabs.includes("pane-weight"));
});
test("workout widget has no habit tab", () => {
  assert.ok(!P.workout.tabs.includes("pane-habits"));
});
test("workout widget has no creatine tab", () => {
  assert.ok(!P.workout.tabs.includes("pane-creatine"));
});
test("macros widget has no workout tab", () => {
  assert.ok(!P.macros.tabs.includes("pane-workout"));
});
test("macros widget has no habit tab", () => {
  assert.ok(!P.macros.tabs.includes("pane-habits"));
});
test("macros widget carries no training analytics tabs", () => {
  ["pane-heatmap", "pane-prs", "pane-recovery", "pane-calendar"].forEach(t =>
    assert.ok(!P.macros.tabs.includes(t), t + " leaked into macros")
  );
});
test("habits widget carries nothing but habits and settings", () => {
  assert.deepStrictEqual(P.habits.tabs, ["pane-habits", "pane-settings"]);
});

// ------------------------------------------------------- completeness --
test("macros widget owns nutrition, weight and creatine", () => {
  ["pane-macros", "pane-weight", "pane-creatine"].forEach(t =>
    assert.ok(P.macros.tabs.includes(t), "macros missing " + t)
  );
});
test("workout widget owns every training tab", () => {
  ["pane-workout", "pane-heatmap", "pane-calendar", "pane-insights"].forEach(t =>
    assert.ok(P.workout.tabs.includes(t), "workout missing " + t)
  );
});
test("workout dock stays at five tabs", () => {
  assert.strictEqual(P.workout.tabs.length, 5, "dock is " + P.workout.tabs.join(", "));
});
test("PRs and CNS are merged, not shown separately, in the workout widget", () => {
  assert.ok(!P.workout.tabs.includes("pane-prs"));
  assert.ok(!P.workout.tabs.includes("pane-recovery"));
  assert.ok(P.workout.tabs.includes("pane-insights"));
});
test("every profile keeps a settings tab", () => {
  Object.entries(P).forEach(([name, prof]) =>
    assert.ok(prof.tabs.includes("pane-settings"), name + " has no settings")
  );
});
test("the all-in-one never duplicates a tab another widget owns", () => {
  // A daily note runs soma-coach alongside soma-macros / soma-sleep /
  // habittracker, so anything those own must not appear again here.
  const ownedElsewhere = ["macros", "sleep", "habits"]
    .flatMap(id => P[id].tabs)
    .filter(pane => pane !== "pane-settings");
  ownedElsewhere.forEach(pane =>
    assert.ok(!P.full.tabs.includes(pane), pane + " is duplicated in the all-in-one")
  );
});
test("the all-in-one keeps the training tabs nothing else owns", () => {
  ["pane-workout", "pane-heatmap", "pane-calendar", "pane-prs", "pane-recovery", "pane-settings"]
    .forEach(pane => assert.ok(P.full.tabs.includes(pane), "all-in-one missing " + pane));
});
test("the all-in-one lists PRs and CNS separately, not as Insights", () => {
  // Insights is PRs + CNS combined; including it here would duplicate them.
  assert.ok(!P.full.tabs.includes("pane-insights"));
  assert.ok(P.full.tabs.includes("pane-prs"));
  assert.ok(P.full.tabs.includes("pane-recovery"));
});
test("every tab still lives in at least one widget", () => {
  // The de-duplication must hide tabs, never lose them entirely.
  const reachable = new Set(Object.values(P).flatMap(prof => prof.tabs));
  TABS.forEach(t =>
    assert.ok(reachable.has(t.pane), t.pane + " is unreachable from every widget")
  );
});
test("macros widget owns measurements", () => {
  assert.ok(P.macros.tabs.includes("pane-measurements"));
});
test("sleep is its own widget, not a macros tab", () => {
  assert.deepStrictEqual(P.sleep.tabs, ["pane-sleep", "pane-settings"]);
  assert.ok(!P.macros.tabs.includes("pane-sleep"));
});
test("sleep never leaks into the workout widget", () => {
  assert.ok(!P.workout.tabs.includes("pane-sleep"));
  assert.ok(!P.workout.tabs.includes("pane-measurements"));
});

// ------------------------------------------------------------ sanity ---
test("every tab named by a profile actually exists", () => {
  const known = new Set(TABS.map(t => t.pane));
  Object.entries(P).forEach(([name, prof]) =>
    prof.tabs.forEach(t => assert.ok(known.has(t), name + " names unknown tab " + t))
  );
});
test("no profile lists a duplicate tab", () => {
  Object.entries(P).forEach(([name, prof]) =>
    assert.strictEqual(new Set(prof.tabs).size, prof.tabs.length, name + " has duplicates")
  );
});
test("every tab has an icon and a label", () => {
  TABS.forEach(t => {
    assert.ok(t.icon && t.icon.length, t.pane + " has no icon");
    assert.ok(t.label && t.label.length, t.pane + " has no label");
  });
});
test("each widget opens on its own subject, not a shared default", () => {
  assert.strictEqual(P.workout.tabs[0], "pane-workout");
  assert.strictEqual(P.macros.tabs[0], "pane-macros");
  assert.strictEqual(P.habits.tabs[0], "pane-habits");
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
