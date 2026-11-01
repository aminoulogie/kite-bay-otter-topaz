import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cheatFactor, cleanSetup, hasSetup, liveVariant, loggedVariants, setupCode, setupOptions,
  setupSummary, setVariant, variantLabel,
} from "./set-setup.ts";
import { isGenuineFailure } from "./set-quality.ts";
import { failureFromQuality } from "./autoregulate.ts";
import { rateSet } from "./stimulus.ts";
import { lastTimeFor } from "./last-time.ts";
import { SomaIntelligenceEngine } from "./soma/engine.ts";
import type { HistorySession, WorkoutSet } from "./types.ts";

const set = (q: Partial<WorkoutSet>): WorkoutSet =>
  ({ weight: 60, reps: 8, failure: 3, done: true, type: "normal", ...q }) as WorkoutSet;

// ------------------------------------------------------------- options --

test("a bent-over row offers straps, swing and grip, and recommends a belt", () => {
  for (const name of ["Barbell Bent-Over Row", "Barbell Bent Over Row", "T-Bar Row", "Reverse Grip Barbell Row"]) {
    const o = setupOptions({ name });
    assert.equal(o.straps, true, name);
    assert.equal(o.beltRecommended, true, name);
    assert.equal(o.momentum, true, name);
    assert.equal(o.hand, true, name);
    assert.equal(o.arch, false, name);
  }
});

test("a chest-supported row needs no belt and cannot be swung", () => {
  for (const name of ["Chest-Supported T-Bar Row", "Seal Row", "Machine Row"]) {
    const o = setupOptions({ name });
    assert.equal(o.straps, true, name);
    assert.equal(o.beltRecommended, false, name);
    assert.equal(o.momentum, false, name);
  }
});

test("bench and presses offer the arch, not straps", () => {
  for (const name of ["Flat Barbell Bench Press", "Barbell Incline Bench Press", "Smith Machine Bench Press", "Dumbbell Bench Press"]) {
    const o = setupOptions({ name });
    assert.equal(o.arch, true, name);
    assert.equal(o.straps, false, name);
    assert.equal(o.momentum, false, name);
  }
  // A barbell has a width; a pair of dumbbells only a hand position.
  assert.equal(setupOptions({ name: "Flat Barbell Bench Press" }).width, true);
  assert.equal(setupOptions({ name: "Dumbbell Bench Press" }).width, false);
  assert.equal(setupOptions({ name: "Dumbbell Bench Press" }).hand, true);
});

test("dips, push-ups and the leg press are not arched presses", () => {
  for (const name of ["Bodyweight Chest Dips", "Diamond Push-Ups", "Leg Press", "Cable Press-Around"]) {
    assert.equal(setupOptions({ name }).arch, false, name);
  }
});

test("a standing overhead press can be arched and wants a belt", () => {
  const o = setupOptions({ name: "Standing Overhead Press (OHP)" });
  assert.equal(o.arch, true);
  assert.equal(o.beltRecommended, true);
  assert.equal(setupOptions({ name: "Seated Dumbbell Shoulder Press" }).beltRecommended, false);
});

test("deadlifts get straps, mixed grip and a belt", () => {
  for (const name of ["Deadlift", "Barbell Deadlift", "Trap Bar Deadlift", "Romanian Deadlift (DB/Barbell)"]) {
    const o = setupOptions({ name });
    assert.equal(o.straps, true, name);
    assert.equal(o.mixed, true, name);
    assert.equal(o.beltRecommended, true, name);
  }
});

test("pull-ups and pulldowns get straps and swing; face pulls get no straps", () => {
  for (const name of ["Pull-Up", "Chin-Up", "Lat Pulldown", "Wide Grip Lat Pulldown"]) {
    const o = setupOptions({ name });
    assert.equal(o.straps, true, name);
    assert.equal(o.momentum, true, name);
  }
  assert.equal(setupOptions({ name: "Face Pulls" }).straps, false);
  assert.equal(setupOptions({ name: "Face Pulls" }).momentum, true);
});

test("curls and raises can be swung; preacher and concentration curls cannot", () => {
  for (const name of ["Barbell Biceps Curl", "Dumbbell Biceps Curl", "Hammer Curl", "Lateral Raise", "Front Raise"]) {
    assert.equal(setupOptions({ name }).momentum, true, name);
  }
  for (const name of ["Dumbbell Preacher Curl", "Concentration Curl", "Machine Biceps Curl", "Leg Curl"]) {
    assert.equal(setupOptions({ name }).momentum, false, name);
  }
  assert.equal(setupOptions({ name: "Barbell Biceps Curl" }).width, true);
  assert.equal(setupOptions({ name: "Dumbbell Biceps Curl" }).width, false);
});

test("squats want a belt unless the back is supported or it is a split squat", () => {
  for (const name of ["Barbell Back Squat", "Weighted Squat", "Safety Bar Squat", "Smith Machine Squat"]) {
    assert.equal(setupOptions({ name }).beltRecommended, true, name);
  }
  for (const name of ["Bulgarian Split Squat", "Hack Squat", "Pendulum Squat"]) {
    assert.equal(setupOptions({ name }).beltRecommended, false, name);
    assert.equal(setupOptions({ name }).belt, true, name);
  }
});

test("a leg extension has nothing to set up", () => {
  assert.equal(hasSetup(setupOptions({ name: "Leg Extension" })), false);
  assert.equal(hasSetup(setupOptions({ name: "Seated Calf Raise Machine" })), false);
});

// ------------------------------------------------------------- records --

test("straps and cheats split records; grip and belt do not", () => {
  assert.equal(setVariant({}), "");
  assert.equal(setVariant(undefined), "");
  assert.equal(setVariant({ grip: { width: "wide", orientation: "pronated" }, aids: ["belt"] }), "");
  assert.equal(setVariant({ aids: ["straps", "belt"] }), "straps");
  assert.equal(setVariant({ cheats: ["arch"] }), "arch");
  assert.equal(setVariant({ aids: ["straps"], cheats: ["momentum"] }), "momentum+straps");
  assert.equal(setVariant({ cheats: ["momentum"], aids: ["straps"] }), setVariant({ aids: ["straps"], cheats: ["momentum"] }));
});

test("records read as words", () => {
  assert.equal(variantLabel(""), "Strict");
  assert.equal(variantLabel("straps"), "Straps");
  assert.equal(variantLabel("arch"), "Arched");
  assert.equal(variantLabel("momentum+straps"), "Swung + straps");
});

test("the record a live exercise aims at is its latest set with a setup", () => {
  assert.equal(liveVariant([]), "");
  assert.equal(liveVariant([{ aids: ["straps"] }, {}]), "straps");
  assert.equal(liveVariant([{ aids: ["straps"] }, { grip: { width: "wide" } }]), "");
  assert.equal(liveVariant([{}, { cheats: ["arch"] }, {}]), "arch");
});

test("logged records list strict first, then most used", () => {
  const sets = [{ aids: ["straps" as const] }, {}, { aids: ["straps" as const] }, { cheats: ["momentum" as const] }];
  assert.deepEqual(loggedVariants(sets), ["", "straps", "momentum"]);
});

test("last time can be asked for one record", () => {
  const history: Record<string, HistorySession> = {
    "2026-10-20": { exercises: [{ name: "T-Bar Row", sets: [set({ weight: 60, aids: ["straps"] })] }] } as unknown as HistorySession,
    "2026-10-27": { exercises: [{ name: "T-Bar Row", sets: [set({ weight: 50 })] }] } as unknown as HistorySession,
  };
  assert.equal(lastTimeFor(history, "T-Bar Row")?.date, "2026-10-27");
  assert.equal(lastTimeFor(history, "T-Bar Row", undefined, "straps")?.date, "2026-10-20");
  assert.equal(lastTimeFor(history, "T-Bar Row", undefined, "")?.sets[0]?.weight, 50);
  assert.equal(lastTimeFor(history, "T-Bar Row", undefined, "arch"), null);
});

test("a strapped set is a PR only against strapped sets", () => {
  const history = {
    a: { timestamp: 1, exercises: [{ name: "Deadlift", sets: [set({ weight: 140, reps: 5, aids: ["straps"] })] }] },
    b: { timestamp: 2, exercises: [{ name: "Deadlift", sets: [set({ weight: 120, reps: 5 }), set({ weight: 110, reps: 5 })] }] },
  };
  // 130 bare-handed beats the bare-hands best of 120, though the straps best is 140.
  assert.ok(SomaIntelligenceEngine.detectPersonalRecords(history, "Deadlift", 130, 5, ""));
  assert.equal(SomaIntelligenceEngine.detectPersonalRecords(history, "Deadlift", 130, 5, "straps"), null);
  // Left out, every set counts, as before.
  assert.equal(SomaIntelligenceEngine.detectPersonalRecords(history, "Deadlift", 130, 5), null);
});

test("the strength chart can show one record", () => {
  const history = {
    a: { timestamp: 1, exercises: [{ name: "Bench", sets: [set({ weight: 100, reps: 5, cheats: ["arch"] }), set({ weight: 90, reps: 5 })] }] },
  };
  assert.equal(SomaIntelligenceEngine.strengthSeries(history, "Bench", "").at(-1)?.weight, 90);
  assert.equal(SomaIntelligenceEngine.strengthSeries(history, "Bench", "arch").at(-1)?.weight, 100);
  assert.equal(SomaIntelligenceEngine.strengthSeries(history, "Bench").at(-1)?.weight, 100);
  assert.deepEqual(SomaIntelligenceEngine.strengthVariants(history, "Bench"), ["", "arch"]);
});

// ------------------------------------------------------- failure level --

test("a cheated set to failure is not a true failure of the target", () => {
  const q = { limiter: "target" as const, closeness: "nothing" as const, burn: 3 as const };
  assert.equal(isGenuineFailure(q), true);
  assert.equal(isGenuineFailure({ ...q, cheats: ["arch"] }), false);
  assert.equal(isGenuineFailure({ ...q, cheats: ["momentum"] }), false);
  // Straps are not a cheat: a strapped back failure is a back failure.
  assert.equal(isGenuineFailure({ ...q, aids: ["straps"] }), true);
});

test("a cheat caps the failure number the ladder reads, like form broke", () => {
  assert.equal(failureFromQuality({ closeness: "forced", limiter: "target" }), 5);
  assert.equal(failureFromQuality({ closeness: "forced", limiter: "target", cheats: ["arch"] }), 3);
  assert.equal(failureFromQuality({ closeness: "nothing", limiter: "target", cheats: ["momentum"] }), 3);
  // Below the cap nothing changes: an easy set stays an easy set.
  assert.equal(failureFromQuality({ closeness: "reps_left", cheats: ["arch"] }), 1);
});

// ------------------------------------------------------------- score --

test("a cheat lowers the Technique part of the set score; straps do not", () => {
  const base = set({ limiter: "target", closeness: "nothing", form: 3, burn: 3 } as Partial<WorkoutSet>);
  const strict = rateSet(base);
  const strapped = rateSet({ ...base, aids: ["straps"] });
  const arched = rateSet({ ...base, cheats: ["arch"] });
  const swung = rateSet({ ...base, cheats: ["momentum"] });
  assert.equal(strict.score, 100);
  assert.equal(strapped.score, 100);
  assert.ok(arched.score! < strict.score!);
  assert.ok(swung.score! < arched.score!, "a swing costs more than an arch");
  assert.equal(arched.parts.form, 0.85);
});

test("a cheat stands in for Technique when Technique was not rated", () => {
  const r = rateSet(set({ closeness: "nothing", cheats: ["momentum"] } as Partial<WorkoutSet>));
  assert.equal(r.parts.form, 0.7);
  assert.equal(r.parts.proximity, 1);
  // Only closeness and the swing answered: 0.4·1 + 0.2·0.7 over 0.6.
  assert.equal(r.score, Math.round(((0.4 + 0.14) / 0.6) * 100));
});

test("a set with only its setup recorded is not scored yet", () => {
  assert.equal(rateSet(set({ cheats: ["arch"] })).score, null);
});

test("two cheats multiply", () => {
  assert.equal(cheatFactor(["arch", "momentum"]), 0.85 * 0.7);
  assert.equal(cheatFactor(["arch", "arch"]), 0.85);
  assert.equal(cheatFactor(undefined), 1);
});

// ------------------------------------------------------------- display --

test("the Setup button shows grip on one line and gear and cheats on the next", () => {
  assert.deepEqual(
    setupCode({ grip: { width: "wide", orientation: "pronated" }, aids: ["straps"], cheats: ["arch"] }),
    { grip: "W·Ov", flags: "Str·Arch" },
  );
  assert.deepEqual(setupCode({}), { grip: "", flags: "" });
  assert.equal(
    setupSummary({ grip: { width: "medium", orientation: "neutral" }, aids: ["belt"] }),
    "Medium · neutral · belt",
  );
});

test("clearing a setup leaves nothing recorded rather than empty lists", () => {
  assert.deepEqual(cleanSetup({ grip: { width: undefined }, aids: [], cheats: [] }), {
    grip: undefined, aids: undefined, cheats: undefined,
  });
  assert.deepEqual(cleanSetup({ grip: { width: "wide" }, aids: ["straps", "straps"] }), {
    grip: { width: "wide" }, aids: ["straps"], cheats: undefined,
  });
});
