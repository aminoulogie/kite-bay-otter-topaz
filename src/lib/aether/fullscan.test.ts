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
