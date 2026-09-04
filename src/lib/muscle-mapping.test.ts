import assert from "node:assert/strict";
import { test } from "node:test";
import anatomy from "./bodymap/anatomy.json" with { type: "json" };
import { MUSCLE_REGIONS } from "./recovery.ts";
import { BASE_EXERCISE_DB } from "./soma/data.ts";

const MUSCLES = anatomy.MUSCLES as unknown as Record<string, { view: string }>;

/**
 * These cover the bug where a triceps session lit the front of the body and
 * left the back blank. Two separate defects caused it, so there is a test for
 * each: the view tables disagreeing, and exercises emitting only one half of a
 * muscle that is drawn on both sides.
 */

test("every region key exists in the anatomy the body map draws", () => {
  for (const r of MUSCLE_REGIONS) {
    assert.ok(MUSCLES[r.key], `MUSCLE_REGIONS has "${r.key}" but anatomy.json does not draw it`);
  }
});

test("region views match the view the muscle is actually drawn on", () => {
  // The original bug: this table said triceps was a back muscle while the SVG
  // painted it on the front, so the two halves of the UI disagreed.
  for (const r of MUSCLE_REGIONS) {
    assert.equal(
      r.view,
      MUSCLES[r.key]!.view,
      `"${r.key}" is listed as ${r.view} but drawn on ${MUSCLES[r.key]!.view}`,
    );
  }
});

// Drawn for anatomical completeness but not trainable in this app: no
// exercise targets them, so a readiness row would always read 100%.
const DECORATIVE = new Set(["neck", "tibialis"]);

test("every trainable muscle drawn on the body has a region entry", () => {
  // Without this, a muscle can be painted but never reported in the list, so
  // training it shows nothing in the readiness panel.
  const known = new Set(MUSCLE_REGIONS.map((r) => r.key));
  const missing = Object.keys(MUSCLES).filter((k) => !known.has(k) && !DECORATIVE.has(k));
  assert.deepEqual(missing, [], `drawn but unlisted: ${missing.join(", ")}`);
});

test("decorative muscles really are untrained", () => {
  // If an exercise ever starts targeting one it must gain a region entry
  // rather than silently staying off the readiness list.
  for (const ex of BASE_EXERCISE_DB) {
    for (const k of ex.targetKeys) {
      assert.ok(!DECORATIVE.has(k), `${ex.name} targets ${k}, which has no region entry`);
    }
  }
});

// Same muscle, two shapes, one per view. Training it must light both.
const MIRRORED: Record<string, string> = {
  triceps: "triceps_back",
  calves: "calves_back",
  forearm: "forearm_back",
  adductors: "adductors_back",
  trapezius: "trapezius_back",
};

test("mirrored muscles are drawn on opposite views", () => {
  for (const [front, back] of Object.entries(MIRRORED)) {
    assert.equal(MUSCLES[front]?.view, "front", `${front} should be the front shape`);
    assert.equal(MUSCLES[back]?.view, "back", `${back} should be the back shape`);
  }
});

test("no exercise targets only one half of a mirrored muscle", () => {
  // This is what left the back blank: an exercise emitting "triceps" without
  // "triceps_back" colours the front and leaves the back at full readiness.
  const offenders: string[] = [];
  for (const ex of BASE_EXERCISE_DB) {
    const keys = new Set(ex.targetKeys);
    for (const [front, back] of Object.entries(MIRRORED)) {
      if (keys.has(front) !== keys.has(back)) {
        offenders.push(`${ex.name}: has ${keys.has(front) ? front : back}, missing ${keys.has(front) ? back : front}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `half-mapped exercises:\n  ${offenders.join("\n  ")}`);
});

test("every targetKey an exercise emits is a real drawn muscle", () => {
  const bad = new Set<string>();
  for (const ex of BASE_EXERCISE_DB) {
    for (const k of ex.targetKeys) if (!MUSCLES[k]) bad.add(`${ex.name} -> ${k}`);
  }
  assert.deepEqual([...bad], [], "exercises point at muscles that are never drawn");
});
