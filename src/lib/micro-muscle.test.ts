import assert from "node:assert/strict";
import { test } from "node:test";
import { microMuscleStrength, subTargetOf } from "./micro-muscle.ts";
import type { ExerciseLog } from "./training-log.ts";

const ex = (name: string, days: Record<string, [number, number][]>): ExerciseLog => ({
  name, key: null, group: "Chest",
  days: Object.fromEntries(
    Object.entries(days).map(([d, sets]) => [
      d, sets.map(([weight, reps]) => ({ weight, reps, failure: 0 })),
    ]),
  ),
});

test("incline and flat press are different micro-muscles", () => {
  // The specific pattern must win, or every press collapses into one muscle
  // and the whole feature reports a single number.
  assert.equal(subTargetOf("Barbell Incline Bench Press")?.subTarget, "Upper Pec (Clavicular)");
  assert.notEqual(
    subTargetOf("Barbell Flat Bench Press")?.subTarget,
    subTargetOf("Barbell Incline Bench Press")?.subTarget,
  );
});

test("rear delt work is not filed as shoulders generally", () => {
  assert.equal(subTargetOf("Reverse Pec Deck")?.subTarget, "Rear Delt (Posterior)");
  assert.equal(subTargetOf("Face Pulls")?.subTarget, "Rear Delt (Posterior)");
});

test("an unknown movement is skipped rather than guessed at", () => {
  assert.equal(subTargetOf("Bibouh Wobble"), null);
});

test("strength is indexed to each exercise's own start", () => {
  // 60kg to 90kg is +50%, whatever the absolute load.
  const [m] = microMuscleStrength([
    ex("Barbell Flat Bench Press", {
      "2026-01-01": [[60, 8]], "2026-02-01": [[70, 8]],
      "2026-03-01": [[80, 8]], "2026-04-01": [[90, 8]],
    }),
  ]);
  assert.ok(m);
  assert.ok(m!.latest > 145 && m!.latest < 155, `expected ~150, got ${m!.latest}`);
  assert.ok(m!.usable);
});

test("a light exercise counts as much as a heavy one", () => {
  // Absolute kilos cannot be averaged across exercises: a cable fly and a bench
  // both train the sternal pec, and summing them would make the number move
  // with exercise selection rather than with strength.
  const both = microMuscleStrength([
    ex("Barbell Flat Bench Press", { "2026-01-01": [[100, 8]], "2026-04-01": [[120, 8]] }),
    ex("Pec Deck Fly", { "2026-01-01": [[25, 12]], "2026-04-01": [[30, 12]] }),
  ]).find((m) => m.subTarget === "Mid/Lower Pec (Sternal)");
  assert.ok(both);
  // both are +20%, so the index is +20% — not dominated by the heavier lift
  assert.ok(both!.latest > 118 && both!.latest < 122, `expected ~120, got ${both!.latest}`);
});

test("training one lift does not read as the others collapsing", () => {
  // Each exercise's last known index is carried forward; without that, a day
  // that only trained the fly would report the bench as having vanished.
  const m = microMuscleStrength([
    ex("Barbell Flat Bench Press", { "2026-01-01": [[100, 8]], "2026-02-01": [[120, 8]] }),
    ex("Pec Deck Fly", { "2026-01-01": [[25, 12]], "2026-03-01": [[25, 12]] }),
  ]).find((x) => x.subTarget === "Mid/Lower Pec (Sternal)");
  const march = m!.points[m!.points.length - 1]!;
  assert.ok(march.index > 105, `bench gains must persist into March, got ${march.index}`);
  assert.equal(march.contributing, 2);
});

test("too few sessions is reported as unusable rather than plotted", () => {
  const [m] = microMuscleStrength([
    ex("Barbell Flat Bench Press", { "2026-01-01": [[60, 8]], "2026-02-01": [[70, 8]] }),
  ]);
  assert.equal(m!.usable, false, "two points is not a trend");
});
