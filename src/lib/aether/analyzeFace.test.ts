import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeFaceLandmarks } from "./analyzeFace.ts";
import { FACE } from "./landmarks.ts";
import type { Pt } from "./geometry.ts";

/**
 * A synthetic face, perfectly even about x = 0.5.
 *
 * Built by index so it exercises the same lookup the real 478-point mesh does.
 * Every left/right pair is placed at mirrored x with identical y.
 */
function evenFace(): Pt[] {
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const put = (key: keyof typeof FACE, x: number, y: number, z = 0) => {
    pts[FACE[key]] = { x, y, z };
  };
  // Midline, top to bottom.
  put("glabella", 0.5, 0.30);
  put("nasion", 0.5, 0.34);
  put("noseTip", 0.5, 0.48);
  put("subnasale", 0.5, 0.52);
  put("upperLip", 0.5, 0.58);
  put("lowerLip", 0.5, 0.61);
  put("chin", 0.5, 0.74);
  // Mirrored pairs.
  const pair = (l: keyof typeof FACE, r: keyof typeof FACE, dx: number, y: number) => {
    put(l, 0.5 - dx, y);
    put(r, 0.5 + dx, y);
  };
  pair("leftInner", "rightInner", 0.04, 0.40);
  pair("leftOuter", "rightOuter", 0.12, 0.40);
  pair("leftIris", "rightIris", 0.08, 0.40);
  pair("leftBrowInner", "rightBrowInner", 0.04, 0.35);
  pair("leftBrowOuter", "rightBrowOuter", 0.13, 0.35);
  pair("leftAlar", "rightAlar", 0.035, 0.50);
  pair("leftCheek", "rightCheek", 0.15, 0.52);
  pair("leftMouth", "rightMouth", 0.06, 0.59);
  pair("leftGonion", "rightGonion", 0.16, 0.66);
  pair("leftJaw", "rightJaw", 0.11, 0.71);
  pair("leftTragus", "rightTragus", 0.20, 0.45);
  pair("leftTemple", "rightTemple", 0.19, 0.36);
  return pts;
}

test("a perfectly even face measures as even", () => {
  // If this drifts, every evenness figure the app shows is wrong by the same
  // amount and nothing else would catch it.
  const a = analyzeFaceLandmarks(evenFace());
  assert.ok(a.alpha < 0.01, `alpha was ${a.alpha}`);
  for (const e of a.edma) {
    assert.ok(Math.abs(e.ratio - 1) < 0.01, `${e.name} was ${e.ratio}`);
  }
});

test("a nudged jaw shows up in the mandible, not the orbits", () => {
  // Regional split earns its place only if a change stays in its own region.
  const pts = evenFace();
  pts[FACE.leftGonion] = { x: 0.30, y: 0.68, z: 0 };
  const a = analyzeFaceLandmarks(pts);
  const even = analyzeFaceLandmarks(evenFace());
  assert.ok(a.regional.mandible > even.regional.mandible + 0.05);
  assert.ok(Math.abs(a.regional.orbits - even.regional.orbits) < 0.01);
});

test("EDMA reports the worst ratio first, above 1", () => {
  const pts = evenFace();
  // Make the left palpebral fissure clearly wider than the right.
  pts[FACE.leftOuter] = { x: 0.32, y: 0.40, z: 0 };
  const a = analyzeFaceLandmarks(pts);
  assert.ok(a.edma.length > 0);
  assert.ok(a.edma[0]!.ratio >= a.edma[a.edma.length - 1]!.ratio, "sorted worst first");
  assert.ok(a.edma.every((e) => e.ratio >= 1), "always max over min, never below 1");
});

test("a rolled head is gated rather than measured", () => {
  // The gate that stops a tilted selfie producing a confident asymmetry number.
  const a = analyzeFaceLandmarks(evenFace(), { rollDeg: 6 });
  assert.equal(a.gates.ok, false);
  assert.match(a.gates.reasons.join(" "), /roll/i);
});

test("a turned head is gated for front metrics", () => {
  const pts = evenFace();
  pts[FACE.noseTip] = { x: 0.58, y: 0.48, z: 0 };
  const a = analyzeFaceLandmarks(pts, { yawDeg: 22 });
  assert.equal(a.gates.ok, false);
  assert.match(a.gates.reasons.join(" "), /turned|yaw/i);
});

test("a smile is gated, because it is not a rest face", () => {
  const a = analyzeFaceLandmarks(evenFace(), { smileBlend: 0.9 });
  assert.equal(a.gates.ok, false);
  assert.match(a.gates.reasons.join(" "), /smile/i);
});

test("confidence falls as the pose gets worse", () => {
  const clean = analyzeFaceLandmarks(evenFace());
  const bad = analyzeFaceLandmarks(evenFace(), { yawDeg: 30, rollDeg: 8, pitchDeg: 20 });
  assert.ok(bad.confidence < clean.confidence);
  assert.ok(bad.confidence >= 0.05, "never zero, so a reading is never claimed impossible");
});

test("the honesty notes travel with every analysis", () => {
  // These are the claims the app must never make. They ship attached to the
  // result rather than living in a screen that could be redesigned away.
  const notes = analyzeFaceLandmarks(evenFace()).notes.join(" ");
  assert.match(notes, /not fluctuating asymmetry|not skeletal|no trichion|not iPhone TrueDepth/i);
  assert.match(notes, /trichion/i, "facial thirds from the hairline are disclaimed");
  assert.match(notes, /TrueDepth|Face ID/i, "the mesh is not claimed to be Face ID");
});

test("the pose source is reported, so a proxy is never passed off as a matrix", () => {
  assert.equal(analyzeFaceLandmarks(evenFace()).poseSource, "proxy");
  assert.equal(
    analyzeFaceLandmarks(evenFace(), { poseSource: "matrix", yawDeg: 1 }).poseSource,
    "matrix",
  );
});
