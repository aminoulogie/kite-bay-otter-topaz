import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyGuidance, summariseBody } from "./body-scan.ts";

test("on target is a steady hold tone", () => {
  const g = bodyGuidance({ ok: true, code: "hold", message: "", collected: 3, target: 60 });
  assert.equal(g.instruction, "hold");
  assert.equal(g.beepMs, 0);
});

test("the further outside the distance window, the slower the beeps", () => {
  const near = bodyGuidance({ ok: false, code: "back", message: "", collected: 0, target: 60, distance: 1.4 });
  const far = bodyGuidance({ ok: false, code: "back", message: "", collected: 0, target: 60, distance: 0.8 });
  assert.equal(near.instruction, "back");
  assert.ok(near.beepMs < far.beepMs, "closer to the window beeps faster");
});

test("turn prompts speak the native reason", () => {
  assert.match(bodyGuidance({ ok: false, code: "side", message: "", collected: 0, target: 60 }).phrase, /sideways/);
  assert.equal(bodyGuidance({ ok: false, message: "x", collected: 0, target: 60 }).instruction, "find");
});

test("a result summarises into metres → mm and metrics", () => {
  const s = summariseBody({
    mode: "front", frames: 60, estimatedScale: 1.02, distance: 2.5, lidar: true,
    skeletonNames: ["root", "neck_1_joint", "left_arm_joint", "right_arm_joint"],
    skeleton: [0, 0, 0, 0, 0.5, 0, 0.19, 0.47, 0, -0.19, 0.47, 0],
    measuredNames: [], measured: [], measuredCounts: [],
  });
  assert.equal(s.distanceMm, 2500);
  assert.equal(s.metrics.segments.shoulderWidth!.src, "model");
  assert.ok(Math.abs(s.metrics.segments.shoulderWidth!.mm - 380) < 0.01);
});
