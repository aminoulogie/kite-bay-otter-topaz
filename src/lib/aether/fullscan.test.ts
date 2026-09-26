import assert from "node:assert/strict";
import { test } from "node:test";
import { type Cylinder } from "./cylmap.ts";
import { chinNeck, mergeSides, neckSize, posture, reachBelowChinMm, SideCylinder } from "./fullscan.ts";
import { identity } from "./register.ts";

/** A midline profile: lips, a chin at y −60, under-chin running back to a corner at y −80, then the neck. */
function profile(cornerR = 62): { y: number; r: number }[] {
  const out: { y: number; r: number }[] = [];
  for (let y = 40; y >= -160; y -= 1.5) {
    let r: number;
    if (y > -60) r = 95 + (y > -45 ? 3 : 0); // face above the chin, behind the chin point
    else if (y >= -80) r = 100 + ((y + 60) / -20) * (cornerR - 100); // chin → corner
    else r = cornerR; // a vertical neck
    if (y === -60) r = 100;
    out.push({ y, r });
  }
  return out;
}

test("chin–neck angle from the profile", () => {
  const c = chinNeck(profile(), -10)!;
  // Under-chin runs (20 down, 38 back); the neck straight down: 180° − atan(38/20) … = 117.8°.
  const expected = (Math.acos(-20 / Math.hypot(20, 38)) * 180) / Math.PI;
  assert.ok(Math.abs(c.angleDeg - expected) < 3, `${c.angleDeg} vs ${expected}`);
  assert.ok(Math.abs(c.cornerY + 80) <= 3, `corner at ${c.cornerY}`);
  assert.ok(Math.abs(c.neckDir.dz) < 0.05 && c.neckDir.dy > 0.99, "neck line points straight up");
});

test("a fuller under-chin (corner further forward) opens the angle", () => {
  const tight = chinNeck(profile(62), -10)!;
  const soft = chinNeck(profile(80), -10)!;
  assert.ok(soft.angleDeg > tight.angleDeg + 10, `${tight.angleDeg} → ${soft.angleDeg}`);
});

const W = 321, H = 227;
const cyl = (): Cylinder => ({
  a: new Float32Array(W * H).fill(NaN), b: new Float32Array(W * H).fill(NaN), width: W, height: H,
  thetaMinDeg: -160, thetaStepDeg: 1, yMinMm: -250, yStepMm: 1.5,
});

test("neck width, depth and a tape-measure estimate at its narrowest", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(NaN);
  for (let j = 0; j < H; j++) {
    const y = -250 + j * 1.5;
    if (y > -80) continue;
    const a = 55 + (y < -120 ? (-120 - y) * 0.3 : 0); // narrowest from −90 to −120
    const b = 60;
    for (let i = 0; i < W; i++) {
      const t = ((-160 + i) * Math.PI) / 180;
      map[j * W + i] = (a * b) / Math.hypot(b * Math.sin(t), a * Math.cos(t));
    }
  }
  const n = neckSize(map, c, -80, -60)!;
  assert.ok(Math.abs(n.widthMm - 110) < 1, `width ${n.widthMm}`);
  assert.ok(n.depthMm > 100 && n.depthMm < 120, `depth ${n.depthMm}`);
  assert.equal(n.depthPartial, false);
  assert.ok(n.circumferenceMm > 330 && n.circumferenceMm < 380, `circ ${n.circumferenceMm}`);
});

test("posture against gravity: a forward-leaning neck and a tipped head", () => {
  const straight = posture([0, -1, 0], { dy: 1, dz: 0.2 });
  assert.ok(Math.abs(straight.neckLeanDeg! - 11.31) < 0.1);
  assert.ok(Math.abs(straight.headPitchDeg) < 1e-9);
  // Head tipped forward 10°: in the face's axes, true up leans back.
  const a = (10 * Math.PI) / 180;
  const tipped = posture([0, -Math.cos(a), Math.sin(a)], null);
  assert.ok(Math.abs(tipped.headPitchDeg - 10) < 1e-6, `${tipped.headPitchDeg}`);
});

test("reach below the chin", () => {
  assert.equal(reachBelowChinMm(profile(), -60), 99.5); // the last row is at −159.5
});

test("side views replace the front sweep only where they saw square-on", () => {
  const c = cyl();
  const front = new Float32Array(W * H).fill(90);
  const side = new Float32Array(W * H).fill(80);
  const m = mergeSides(front, side, c);
  assert.equal(m[100 * W + 160], 90); // θ = 0
  assert.equal(m[100 * W + 160 + 80], 80); // θ = 80
  front[100 * W + 160 + 80] = NaN;
  side[100 * W + 160] = NaN;
  assert.equal(mergeSides(front, side, c)[100 * W + 160 + 80], 80);
});

test("a placed frame lands in the right cells", () => {
  const c = cyl();
  const sc = new SideCylinder(c, -60);
  // A camera at the person's left side looking at a patch 90 mm off the axis.
  const T = identity();
  T[12] = 300; T[14] = -60;
  const pts = new Float32Array([-210, 0, 0, -210, 0, 0, -210, 0, 0]);
  sc.add(T, pts);
  const med = sc.medians();
  const j = Math.round((0 + 250) / 1.5), i = 160 + 90;
  assert.ok(Math.abs(med[j * W + i]! - 90) < 1e-3, `${med[j * W + i]}`);
});

test("the neck line stops before the chest (the first real scan's 160° came from that)", () => {
  // The same profile, but 70 mm below the corner the chest comes forward sharply.
  const p = profile().map((q) => (q.y < -150 ? { y: q.y, r: 62 + (-150 - q.y) * 1.2 } : q));
  const c = chinNeck(p, -10)!;
  const expected = (Math.acos(-20 / Math.hypot(20, 38)) * 180) / Math.PI;
  assert.ok(Math.abs(c.angleDeg - expected) < 3, `${c.angleDeg} vs ${expected}`);
});

test("an angle no neck makes is not reported", () => {
  // A nearly flat profile: nothing like a chin and a neck.
  const flat = profile().map((q) => ({ y: q.y, r: q.y < -60 ? 100 - (-60 - q.y) * 0.05 : 100 }));
  assert.equal(chinNeck(flat, -10), null);
});

test("a side hold is used only if it agrees with the front scan where both overlap", async () => {
  const { judgeHold } = await import("./fullscan.ts");
  const c = cyl();
  const front = new Float32Array(W * H).fill(NaN);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (Math.abs(-160 + i) <= 65) front[j * W + i] = 90;
  // Points on that same 90 mm surface, 25–80° round, in face axes (T = identity).
  const pts: number[] = [];
  for (let y = -60; y <= 40; y += 3) for (let t = 25; t <= 80; t += 1.5) {
    const tr = (t * Math.PI) / 180;
    pts.push(90 * Math.sin(tr), y, -60 + 90 * Math.cos(tr));
  }
  const P = Float32Array.from(pts);
  const good = judgeHold({ T: identity(), pts: P, rms: 0.8, inliers: 0.9 }, front, c, -60);
  assert.equal(good.verdict, "used");
  // The same hold placed 4 mm out to the side: fits its own frame, wrong on the face.
  const off = identity();
  off[12] = 4;
  assert.equal(judgeHold({ T: off, pts: P, rms: 0.8, inliers: 0.9 }, front, c, -60).verdict, "off the face");
  assert.equal(judgeHold({ T: identity(), pts: P, rms: 3, inliers: 0.9 }, front, c, -60).verdict, "loose fit");
});

test("a hold too far off to measure from can still be near enough to draw", async () => {
  const { judgeHold, SHOW_LIMITS } = await import("./fullscan.ts");
  const c = cyl();
  const front = new Float32Array(W * H).fill(NaN);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (Math.abs(-160 + i) <= 65) front[j * W + i] = 90;
  const pts: number[] = [];
  for (let y = -60; y <= 40; y += 3) for (let t = 25; t <= 80; t += 1.5) {
    const tr = (t * Math.PI) / 180;
    pts.push(90 * Math.sin(tr), y, -60 + 90 * Math.cos(tr));
  }
  const P = Float32Array.from(pts);
  // Three millimetres out: the size of miss that left the neck off the model.
  const near = identity();
  near[12] = 3;
  const h = { T: near, pts: P, rms: 0.8, inliers: 0.9 };
  assert.equal(judgeHold(h, front, c, -60).verdict, "off the face", "not measured from");
  assert.equal(judgeHold(h, front, c, -60, SHOW_LIMITS).verdict, "used", "still drawn");
  // A centimetre out is wrong enough that drawing it would mislead.
  const far = identity();
  far[12] = 12;
  assert.equal(judgeHold({ ...h, T: far }, front, c, -60, SHOW_LIMITS).verdict, "off the face");
});

test("the nose is kept: readings past 15 cm are allowed in front of the face only", async () => {
  const { maxRadiusMm } = await import("./fullscan.ts");
  assert.equal(maxRadiusMm(0, -20), 200, "nose tip, straight ahead");
  assert.equal(maxRadiusMm(80, -20), 150, "beside the head");
  assert.equal(maxRadiusMm(0, -150), 150, "below the chin: chest, not nose");
  // A nose-tip reading 165 mm in front of the axis lands in the cylinder.
  const c = {
    a: new Float32Array(41 * 41), b: new Float32Array(41 * 41), width: 41, height: 41,
    thetaMinDeg: -20, thetaStepDeg: 1, yMinMm: -50, yStepMm: 1.5,
  };
  const s = new SideCylinder(c, -60);
  for (let k = 0; k < 3; k++) s.add(identity(), Float32Array.from([0, -20, 105]));
  const m = s.medians();
  const cell = Math.round((-20 + 50) / 1.5) * 41 + 20;
  assert.ok(Math.abs(m[cell]! - 165) < 1e-3, `${m[cell]}`);
});
