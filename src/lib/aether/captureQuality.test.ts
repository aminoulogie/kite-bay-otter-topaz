import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION, faceBox, framingFromLandmarks, proxyPose, scoreCapture } from "./captureQuality.ts";
import { FACE } from "./landmarks.ts";
import type { Pt } from "./geometry.ts";

/**
 * A face at a given yaw, with the foreshortening a real turn produces.
 *
 * `turn` runs 0 (front) to 1 (full profile). Horizontal distances collapse by
 * cos of the angle, which is exactly what broke the old proxy: it divided by
 * one of those collapsing distances.
 */
function faceAt(turn: number): Pt[] {
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const put = (k: keyof typeof FACE, x: number, y: number) => { pts[FACE[k]] = { x, y }; };
  const c = Math.cos((turn * Math.PI) / 2);
  // Turning right slides the visible features left and squashes them.
  const px = (offset: number) => 0.5 + offset * c + turn * 0.12;
  put("glabella", px(0), 0.28);
  put("nasion", px(0), 0.34);
  put("noseTip", px(0) - turn * 0.10, 0.48);
  put("subnasale", px(0) - turn * 0.06, 0.52);
  put("upperLip", px(0) - turn * 0.05, 0.58);
  put("chin", px(0) - turn * 0.04, 0.74);
  put("leftInner", px(-0.03), 0.40); put("rightInner", px(0.03), 0.40);
  put("leftOuter", px(-0.10), 0.40); put("rightOuter", px(0.10), 0.40);
  put("leftMouth", px(-0.05), 0.58); put("rightMouth", px(0.05), 0.58);
  put("leftTragus", px(-0.17), 0.44); put("rightTragus", px(0.17), 0.44);
  return pts;
}

test("yaw stays inside the physical range at every angle", () => {
  // The bug: dividing by the inter-eye gap, which foreshortens, let yaw run
  // past 100° well before the head reached profile.
  for (const turn of [0, 0.25, 0.5, 0.75, 1]) {
    const { yawDeg } = proxyPose(faceAt(turn));
    assert.ok(Math.abs(yawDeg) <= 90.001, `turn ${turn} gave yaw ${yawDeg}`);
  }
});

test("yaw rises monotonically as the head turns", () => {
  const yaws = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => Math.abs(proxyPose(faceAt(t)).yawDeg));
  for (let i = 1; i < yaws.length; i++) {
    assert.ok(yaws[i]! >= yaws[i - 1]!, `yaw fell between step ${i - 1} and ${i}: ${yaws}`);
  }
  assert.ok(yaws[0]! < 5, "a front face reads near zero");
  assert.ok(yaws[yaws.length - 1]! > 45, "a profile reads high");
});

test("the 45 degree step is reachable, which it was not before", () => {
  // Some intermediate turn has to land inside the oblique window, or the step
  // can never go green no matter how the user moves.
  const step = SESSION.find((s) => s.kind === "face_oblique")!;
  const reachable = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7].some((t) => {
    const y = Math.abs(proxyPose(faceAt(t)).yawDeg);
    return y >= step.yawAbs[0] && y <= step.yawAbs[1];
  });
  assert.ok(reachable, "no turn produces a yaw inside the 45° window");
});

test("the profile step is reachable too", () => {
  const step = SESSION.find((s) => s.kind === "face_side")!;
  const reachable = [0.75, 0.8, 0.85, 0.9, 0.95, 1].some((t) => {
    const y = Math.abs(proxyPose(faceAt(t)).yawDeg);
    return y >= step.yawAbs[0] && y <= step.yawAbs[1];
  });
  assert.ok(reachable, "no turn produces a yaw inside the profile window");
});

test("the lighting box never collapses to a sliver at profile", () => {
  // It used to be built from the two tragus points, which nearly coincide when
  // the head is turned — so lighting was read from a few pixels by the ear.
  for (const turn of [0, 0.5, 0.9, 1]) {
    const box = faceBox(faceAt(turn));
    assert.ok(box.w > 0.1, `turn ${turn} gave a box ${box.w.toFixed(3)} wide`);
    assert.ok(box.h > 0.2);
  }
});

test("the lighting box stays centred on the face as it widens", () => {
  const box = faceBox(faceAt(1));
  const pts = faceAt(1);
  const nose = pts[FACE.noseTip]!;
  assert.ok(
    nose.x > box.x && nose.x < box.x + box.w,
    "the nose has to be inside the box the light is sampled from",
  );
});

test("roll is unaffected by turning, since it is a different axis", () => {
  for (const turn of [0, 0.5, 1]) {
    assert.ok(Math.abs(proxyPose(faceAt(turn)).rollDeg) < 1, "a level head reads level at any yaw");
  }
});

test("a tilted head reads as rolled", () => {
  const pts = faceAt(0);
  pts[FACE.leftInner] = { x: 0.47, y: 0.42 };
  pts[FACE.rightInner] = { x: 0.53, y: 0.38 };
  assert.ok(Math.abs(proxyPose(pts).rollDeg) > 15);
});

test("no face means nothing is ready", () => {
  const q = scoreCapture({
    kind: "face_front_true", yawDeg: 0, rollDeg: 0, pitchDeg: 0,
    lighting: { grade: "unknown", mean: 0, contrast: 0, leftRightDelta: 0, highlightPct: 0, shadowPct: 0, notes: [] },
    framing: { faceHeightFrac: 0, eyesY: 0.4, centerX: 0.5, notes: [] },
    smile: 0, hasFace: false,
  });
  assert.equal(q.ready, false);
  assert.equal(q.overall, 0);
});

test("a good front frame goes green", () => {
  const q = scoreCapture({
    kind: "face_front_true", yawDeg: 1.5, rollDeg: 0.5, pitchDeg: 2,
    lighting: { grade: "good", mean: 140, contrast: 30, leftRightDelta: 8, highlightPct: 0.01, shadowPct: 0.01, notes: [] },
    framing: { faceHeightFrac: 0.46, eyesY: 0.38, centerX: 0.5, notes: [] },
    smile: 0.1, hasFace: true,
  });
  assert.equal(q.ready, true, `overall ${q.overall} align ${q.alignment}`);
});

test("a good profile frame goes green at profile yaw, not at front yaw", () => {
  const at = (yawDeg: number) =>
    scoreCapture({
      kind: "face_side", yawDeg, rollDeg: 1, pitchDeg: 2,
      lighting: { grade: "good", mean: 140, contrast: 30, leftRightDelta: 10, highlightPct: 0.01, shadowPct: 0.01, notes: [] },
      framing: { faceHeightFrac: 0.46, eyesY: 0.38, centerX: 0.42, notes: [] },
      smile: 0.1, hasFace: true,
    });
  assert.equal(at(80).ready, true, "80° is a profile");
  assert.equal(at(5).ready, false, "facing the lens is not a profile");
});

test("framing complains about the right thing", () => {
  const tooFar = framingFromLandmarks(
    (() => { const p = faceAt(0); p[FACE.chin] = { x: 0.5, y: 0.40 }; return p; })(),
  );
  assert.match(tooFar.notes.join(" "), /closer/i);
});
