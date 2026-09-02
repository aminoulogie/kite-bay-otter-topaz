// Phase 5: training consistency and the strength series.
// Run with:  node test/test-consistency.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const E = loadPlugin().SomaIntelligenceEngine;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

// A Wednesday, so week boundaries are exercised rather than aligned.
const NOW = new Date(2026, 8, 2, 12, 0, 0).getTime();
const dayMs = 86400000;

function sess(daysBack, name = "Squat", sets = [{ weight: 100, reps: 5, done: true, type: "normal" }]) {
  const ts = NOW - daysBack * dayMs;
  return { timestamp: ts, exercises: [{ name, sets }] };
}
// Builds `count` sessions INSIDE one week, placed Monday onward, so a
// week's worth of sessions never spills across a week boundary.
function weekOf(weeksBack, count, base = NOW) {
  const out = {};
  const now = new Date(base);
  const dow = (now.getDay() + 6) % 7;                 // Mon = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - weeksBack * 7);
  for (let i = 0; i < count && i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    d.setHours(12, 0, 0, 0);
    out["w" + weeksBack + "d" + i] = {
      timestamp: d.getTime(),
      exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5, done: true, type: "normal" }] }]
    };
  }
  return out;
}

// ------------------------------------------------------- week keys ----
test("weeks: Monday and Sunday of one week share a key", () => {
  const mon = new Date(2026, 7, 31);
  const sun = new Date(2026, 8, 6);
  assert.strictEqual(E.weekKeyOf(mon), E.weekKeyOf(sun));
});
test("weeks: Sunday and the following Monday do NOT share a key", () => {
  const sun = new Date(2026, 8, 6);
  const mon = new Date(2026, 8, 7);
  assert.notStrictEqual(E.weekKeyOf(sun), E.weekKeyOf(mon));
});
test("weeks: the key is always the Monday of that week", () => {
  assert.strictEqual(new Date(E.weekKeyOf(new Date(2026, 8, 4)) + "T12:00:00").getDay(), 1);
});

// ----------------------------------------------------- consistency ----
test("consistency: counts this week's sessions", () => {
  const r = E.computeConsistency(weekOf(0, 3), { sessionsPerWeek: 4, now: NOW });
  assert.strictEqual(r.thisWeek, 3);
});
test("consistency: an empty history is all zeroes, not a crash", () => {
  const r = E.computeConsistency({}, { now: NOW });
  assert.strictEqual(r.currentStreak, 0);
  assert.strictEqual(r.totalSessions, 0);
  assert.strictEqual(r.adherence, 0);
});
test("consistency: null history is safe", () => {
  assert.strictEqual(E.computeConsistency(null, { now: NOW }).currentStreak, 0);
});
test("consistency: consecutive full weeks build a streak", () => {
  const h = { ...weekOf(1, 4), ...weekOf(2, 4), ...weekOf(3, 4) };
  const r = E.computeConsistency(h, { sessionsPerWeek: 4, now: NOW });
  assert.ok(r.currentStreak >= 3, "got " + r.currentStreak);
});
test("consistency: a missed week breaks the streak", () => {
  const h = { ...weekOf(1, 4), ...weekOf(3, 4) };  // week 2 skipped
  const r = E.computeConsistency(h, { sessionsPerWeek: 4, now: NOW });
  assert.strictEqual(r.currentStreak, 1, "got " + r.currentStreak);
});
test("consistency: an unfinished current week does not break the streak", () => {
  // 1 session so far this week, full weeks behind it.
  const h = { ...weekOf(0, 1), ...weekOf(1, 4), ...weekOf(2, 4) };
  const r = E.computeConsistency(h, { sessionsPerWeek: 4, now: NOW });
  assert.ok(r.currentStreak >= 2, "in-progress week broke the streak: " + r.currentStreak);
});
test("consistency: best streak is remembered after it ends", () => {
  const h = { ...weekOf(3, 4), ...weekOf(4, 4), ...weekOf(5, 4) };
  const r = E.computeConsistency(h, { sessionsPerWeek: 4, weeks: 8, now: NOW });
  assert.ok(r.bestStreak >= 3, "got " + r.bestStreak);
});
test("consistency: best is never below current", () => {
  const h = { ...weekOf(1, 4), ...weekOf(2, 4) };
  const r = E.computeConsistency(h, { sessionsPerWeek: 4, now: NOW });
  assert.ok(r.bestStreak >= r.currentStreak);
});
test("consistency: adherence is a sane percentage", () => {
  const h = { ...weekOf(1, 4), ...weekOf(2, 2) };
  const r = E.computeConsistency(h, { sessionsPerWeek: 4, weeks: 8, now: NOW });
  assert.ok(r.adherence >= 0 && r.adherence <= 100, "got " + r.adherence);
});
test("consistency: extra sessions cannot push adherence past 100", () => {
  // Anchored to a Sunday so every week in the window is complete.
  const SUN = new Date(2026, 8, 6, 20, 0, 0).getTime();
  let h = {};
  for (let w = 0; w < 8; w++) h = { ...h, ...weekOf(w, 7, SUN) };
  const r = E.computeConsistency(h, { sessionsPerWeek: 4, weeks: 8, now: SUN });
  assert.strictEqual(r.adherence, 100);
});
test("consistency: returns exactly seven days for the current week", () => {
  const r = E.computeConsistency(weekOf(0, 2), { now: NOW });
  assert.strictEqual(r.weekDays.length, 7);
  assert.ok(r.weekDays.some(d => d.done));
});
test("consistency: days later this week are flagged as future", () => {
  const r = E.computeConsistency({}, { now: NOW });
  assert.ok(r.weekDays.some(d => d.future), "nothing marked future");
});
test("consistency: weeks come back oldest-first for charting", () => {
  const r = E.computeConsistency(weekOf(1, 4), { weeks: 4, now: NOW });
  for (let i = 1; i < r.weeks.length; i++) {
    assert.ok(r.weeks[i - 1].week <= r.weeks[i].week, "weeks not ascending");
  }
});

// -------------------------------------------------- strength series ---
test("strength: one point per session, in date order", () => {
  const h = { a: sess(20), b: sess(10), c: sess(2) };
  const s = E.strengthSeries(h, "Squat");
  assert.strictEqual(s.length, 3);
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].timestamp <= s[i].timestamp);
});
test("strength: takes the best set of each session", () => {
  const h = { a: sess(2, "Squat", [
    { weight: 80,  reps: 5, done: true, type: "normal" },
    { weight: 120, reps: 5, done: true, type: "normal" }
  ])};
  assert.strictEqual(E.strengthSeries(h, "Squat")[0].weight, 120);
});
test("strength: warm-ups and drop sets are excluded", () => {
  const h = { a: sess(2, "Squat", [
    { weight: 300, reps: 5, done: true, type: "warmup" },
    { weight: 250, reps: 5, done: true, type: "dropset" },
    { weight: 100, reps: 5, done: true, type: "normal" }
  ])};
  assert.strictEqual(E.strengthSeries(h, "Squat")[0].weight, 100);
});
test("strength: incomplete sets are ignored", () => {
  const h = { a: sess(2, "Squat", [{ weight: 500, reps: 5, done: false, type: "normal" }]) };
  assert.strictEqual(E.strengthSeries(h, "Squat").length, 0);
});
test("strength: bar weight is included", () => {
  const h = { a: { timestamp: NOW, exercises: [{
    name: "Squat", usesBar: true, barWeight: 20,
    sets: [{ weight: 100, reps: 1, done: true, type: "normal" }]
  }]}};
  assert.strictEqual(E.strengthSeries(h, "Squat")[0].est1RM, 120);
});
test("strength: PRs are flagged, and only when a record is beaten", () => {
  const h = {
    a: sess(30, "Squat", [{ weight: 100, reps: 5, done: true, type: "normal" }]),
    b: sess(20, "Squat", [{ weight: 90,  reps: 5, done: true, type: "normal" }]),
    c: sess(10, "Squat", [{ weight: 110, reps: 5, done: true, type: "normal" }])
  };
  const s = E.strengthSeries(h, "Squat");
  assert.strictEqual(s[0].isPR, true,  "first session should set the record");
  assert.strictEqual(s[1].isPR, false, "a lighter session is not a PR");
  assert.strictEqual(s[2].isPR, true,  "beating the record is a PR");
});
test("strength: name matching is case-insensitive", () => {
  assert.strictEqual(E.strengthSeries({ a: sess(2, "Squat") }, "squat").length, 1);
});
test("strength: unknown exercise and junk input are safe", () => {
  assert.deepStrictEqual(E.strengthSeries({ a: sess(2) }, "Bench"), []);
  assert.deepStrictEqual(E.strengthSeries(null, "Squat"), []);
});

// ------------------------------------------------------ name list ----
test("names: lists exercises that have real working sets", () => {
  const h = { a: sess(2, "Squat"), b: sess(1, "Bench") };
  const names = E.loggedExerciseNames(h);
  assert.ok(names.includes("Squat") && names.includes("Bench"));
});
test("names: most recently trained comes first", () => {
  const h = { a: sess(30, "Old Lift"), b: sess(1, "New Lift") };
  assert.strictEqual(E.loggedExerciseNames(h)[0], "New Lift");
});
test("names: a warm-up-only exercise is not listed", () => {
  const h = { a: sess(2, "Squat", [{ weight: 60, reps: 5, done: true, type: "warmup" }]) };
  assert.strictEqual(E.loggedExerciseNames(h).length, 0);
});
test("names: no duplicates", () => {
  const h = { a: sess(5, "Squat"), b: sess(2, "Squat") };
  assert.strictEqual(E.loggedExerciseNames(h).length, 1);
});

// --------------------------------------------- bodyweight fallback ----
test("strength: an unloaded bodyweight lift charts reps, not an empty 1RM", () => {
  const h = { a: { timestamp: NOW, exercises: [{
    name: "Dips", isBW: true,
    sets: [{ weight: 0, reps: 12, done: true, type: "normal" }]
  }]}};
  const s = E.strengthSeries(h, "Dips");
  assert.strictEqual(s.length, 1, "bodyweight lift produced no point");
  assert.strictEqual(s[0].metric, "reps");
  assert.strictEqual(s[0].est1RM, 12);
});
test("strength: a loaded lift still reports est1RM", () => {
  const h = { a: sess(2, "Squat", [{ weight: 100, reps: 5, done: true, type: "normal" }]) };
  assert.strictEqual(E.strengthSeries(h, "Squat")[0].metric, "est1RM");
});
test("strength: everything in the picker can actually be charted", () => {
  const h = {
    a: { timestamp: NOW, exercises: [{ name: "Dips", sets: [{ weight: 0, reps: 10, done: true, type: "normal" }] }] },
    b: sess(3, "Squat")
  };
  E.loggedExerciseNames(h).forEach(n =>
    assert.ok(E.strengthSeries(h, n).length > 0, n + " is listed but charts nothing")
  );
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
