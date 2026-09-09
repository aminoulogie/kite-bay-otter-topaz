import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NORMS, harmonySummary, measureHarmony, mostDeviant, regionPercent, symmetryPercent,
} from "./harmony.ts";
import { FACE } from "./landmarks.ts";
import type { Pt } from "./geometry.ts";

/** A face built to hit the canons, so the maths can be checked against known answers. */
function canonFace(): Pt[] {
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const put = (k: keyof typeof FACE, x: number, y: number) => { pts[FACE[k]] = { x, y }; };
  // Eye width 0.06, inner-corner distance 0.06 → canon 1.0
  put("leftInner", 0.47, 0.40); put("rightInner", 0.53, 0.40);
  put("leftOuter", 0.41, 0.40); put("rightOuter", 0.59, 0.40);
  // Alar width 0.06 → nose ÷ icd = 1.0
  put("leftAlar", 0.47, 0.50); put("rightAlar", 0.53, 0.50);
  // Mouth width 0.09 → mouth ÷ nose = 1.5
  put("leftMouth", 0.455, 0.58); put("rightMouth", 0.545, 0.58);
  // Face width 0.30 → fifths = 5.0
  put("leftTemple", 0.35, 0.38); put("rightTemple", 0.65, 0.38);
  // Midface and lower third both 0.12 → 1.0
  put("nasion", 0.5, 0.36); put("subnasale", 0.5, 0.48); put("chin", 0.5, 0.60);
  put("glabella", 0.5, 0.33); put("upperLip", 0.5, 0.57);
  // Cheek 0.228 over brow-to-lip 0.12 → fWHR 1.9
  put("leftCheek", 0.386, 0.50); put("rightCheek", 0.614, 0.50);
  // Jaw 0.178 over cheek 0.228 → 0.78
  put("leftGonion", 0.411, 0.55); put("rightGonion", 0.589, 0.55);
  return pts;
}

const read = (pts: Pt[], id: string) => measureHarmony(pts).find((r) => r.norm.id === id)!;

test("a face built to the canons measures at the canons", () => {
  // If the arithmetic drifts, every deviation shown to a user is wrong by the
  // same amount and nothing else would catch it.
  for (const id of ["icd_pfw", "nose_icd", "mouth_nose", "fifths", "mid_lower"]) {
    const r = read(canonFace(), id);
    const norm = NORMS.find((n) => n.id === id)!;
    assert.ok(
      Math.abs(r.value! - norm.norm) < 0.02,
      `${id}: measured ${r.value}, canon ${norm.norm}`,
    );
    assert.equal(r.typical, true);
  }
});

test("fWHR uses brow to lip, not brow to chin", () => {
  // The protocol the fWHR literature follows. Using the chin instead would
  // roughly halve the figure and report every face as wildly abnormal, so the
  // test compares the two rather than pinning a number a synthetic face cannot
  // hit alongside every other canon at once.
  const pts = canonFace();
  const cheekW = Math.abs(pts[FACE.rightCheek]!.x - pts[FACE.leftCheek]!.x);
  const browToLip = Math.abs(pts[FACE.upperLip]!.y - pts[FACE.glabella]!.y);
  const browToChin = Math.abs(pts[FACE.chin]!.y - pts[FACE.glabella]!.y);

  const r = read(pts, "fwhr");
  assert.ok(Math.abs(r.value! - cheekW / browToLip) < 0.01, "measured cheek ÷ brow-to-lip");
  assert.ok(
    Math.abs(r.value! - cheekW / browToChin) > 0.05,
    "and is NOT cheek ÷ brow-to-chin, which would be a different number entirely",
  );
});

test("a wider nose reads as a positive deviation, in percent and in spreads", () => {
  const pts = canonFace();
  pts[FACE.leftAlar] = { x: 0.44, y: 0.50 };
  pts[FACE.rightAlar] = { x: 0.56, y: 0.50 };
  const r = read(pts, "nose_icd");
  assert.ok(r.value! > 1.0);
  assert.ok(r.pct! > 90, `doubling nose width should be about +100%, was ${r.pct}`);
  assert.ok(r.z! > 1, "and well outside one spread");
  assert.equal(r.typical, false);
});

test("being inside one spread is typical, not a defect", () => {
  const pts = canonFace();
  // Widening the inner corners moves BOTH sides of the ratio — the gap grows
  // and each eye narrows — so the nudge has to be small to stay inside one
  // spread. This is why the test computes the resulting ratio rather than
  // assuming a displacement maps onto it linearly.
  pts[FACE.leftInner] = { x: 0.469, y: 0.40 };
  pts[FACE.rightInner] = { x: 0.531, y: 0.40 };
  const r = read(pts, "icd_pfw");
  assert.ok(Math.abs(r.z!) <= 1, `z was ${r.z} for ratio ${r.value}`);
  assert.equal(r.typical, true);
});

test("an angle reports a difference in degrees, not a percentage of itself", () => {
  // Percent is meaningless for a value that can pass through zero: a tilt going
  // from 0.1° to 0.2° is "+100%" and means nothing.
  const canthal = read(canonFace(), "canthal");
  assert.equal(canthal.norm.unit, "deg");
  assert.ok(Math.abs(canthal.pct! - (canthal.value! - 5.5)) < 0.11);
});

test("a positive canthal tilt is positive on both sides", () => {
  const pts = canonFace();
  // Outer corners raised above inner ones.
  pts[FACE.leftOuter] = { x: 0.41, y: 0.385 };
  pts[FACE.rightOuter] = { x: 0.59, y: 0.385 };
  assert.ok(read(pts, "canthal").value! > 0, "raised outer corners must read positive");
});

test("landmarks that are missing report nothing rather than a guess", () => {
  const pts = canonFace();
  pts[FACE.leftAlar] = undefined as unknown as Pt;
  const r = read(pts, "nose_icd");
  assert.equal(r.value, null);
  assert.equal(r.z, null);
  assert.equal(r.typical, false);
});

test("the summary is a count out of what could be measured, not a score", () => {
  // Averaging deviations would produce exactly the single blended number this
  // module exists to avoid, and would weight a contested canon like a solid one.
  const s = harmonySummary(measureHarmony(canonFace()));
  assert.ok(s.measured >= 7);
  assert.ok(s.typical >= 6);
  assert.ok(!("score" in s), "there is no score here on purpose");
});

test("the worst deviations come back first", () => {
  const pts = canonFace();
  pts[FACE.leftAlar] = { x: 0.42, y: 0.50 };
  pts[FACE.rightAlar] = { x: 0.58, y: 0.50 };
  const worst = mostDeviant(measureHarmony(pts));
  assert.equal(worst[0]!.norm.id, "nose_icd");
  assert.ok(Math.abs(worst[0]!.z!) >= Math.abs(worst[1]!.z!));
});

test("symmetry becomes a percentage a person can read", () => {
  assert.equal(symmetryPercent(0), 100, "a perfectly even face is 100");
  // A typical human alpha lands in the 90s, not at 99.9 — a scale that reports
  // everyone as near-perfect is measuring nothing.
  const typical = symmetryPercent(0.012);
  assert.ok(typical > 90 && typical < 96, `was ${typical}`);
  assert.ok(symmetryPercent(0.05) < typical, "more asymmetry scores lower");
  assert.equal(symmetryPercent(5), 0, "clamped, never negative");
});

test("every norm ships with where it came from", () => {
  for (const n of NORMS) {
    assert.ok(n.source.length > 10, `${n.id} has no source`);
    assert.ok(n.formula.includes("÷") || n.unit === "deg", `${n.id} does not say what it divides`);
    assert.ok(n.spread > 0, `${n.id} has no spread, so a deviation would mean nothing`);
  }
});

test("nothing needing a hairline is offered, since the mesh has none", () => {
  const ids = NORMS.map((n) => n.id).join(" ");
  assert.doesNotMatch(ids, /trichion|thirds_full/);
  const midLower = NORMS.find((n) => n.id === "mid_lower")!;
  assert.match(midLower.source, /no hairline|lower two/i);
});

test("region percentages are bounded and readable", () => {
  assert.equal(regionPercent(0), 100);
  assert.ok(regionPercent(0.05) < 100 && regionPercent(0.05) > 90);
  assert.equal(regionPercent(3), 0);
});
