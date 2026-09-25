import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeCyl, type Cylinder } from "./cylmap.ts";
import { SideCylinder } from "./fullscan.ts";
import { refineSweep } from "./refine.ts";
import { apply, identity, mul, type Mat4 } from "./register.ts";

const W = 321, H = 227, AXIS = -60;
const grid: Omit<Cylinder, "a" | "b"> = { width: W, height: H, thetaMinDeg: -160, thetaStepDeg: 1, yMinMm: -250, yStepMm: 1.5 };

function radius(t: number, y: number): number {
  const tr = (t * Math.PI) / 180;
  let r = 78 + 14 * Math.cos(tr) ** 2 - ((y - 10) ** 2) / 520;
  r += 13 * Math.exp(-(t * t) / 50) * Math.exp(-((y - 5) ** 2) / 260);
  r += 8 * Math.exp(-(t * t) / 150) * Math.exp(-((y + 62) ** 2) / 110);
  r += 5 * Math.exp(-(((t - 25) ** 2) + ((y - 32) ** 2)) / 60) + 5 * Math.exp(-(((t + 25) ** 2) + ((y - 32) ** 2)) / 60);
  r += 3 * Math.exp(-(((t - 40) ** 2) / 80 + ((y + 20) ** 2) / 80)); // a cheekbone
  return r;
}

function rot(yawDeg: number, pitchDeg: number, rollDeg = 0): Mat4 {
  const [a, b, g] = [yawDeg, pitchDeg, rollDeg].map((d) => (d * Math.PI) / 180) as [number, number, number];
  const ry = identity(); ry[0] = Math.cos(a); ry[2] = -Math.sin(a); ry[8] = Math.sin(a); ry[10] = Math.cos(a);
  const rx = identity(); rx[5] = Math.cos(b); rx[6] = Math.sin(b); rx[9] = -Math.sin(b); rx[10] = Math.cos(b);
  const rz = identity(); rz[0] = Math.cos(g); rz[1] = Math.sin(g); rz[4] = -Math.sin(g); rz[5] = Math.cos(g);
  return mul(ry, mul(rx, rz));
}

function invert(m: Mat4): Mat4 {
  const o = identity();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c]!;
  const [x, y, z] = apply(o, m[12]!, m[13]!, m[14]!);
  o[12] = -x; o[13] = -y; o[14] = -z;
  return o;
}

/** A camera 300 mm from the head's axis looking at it from (yaw, pitch); camera → face. */
function cameraAt(yaw: number, pitch: number): Mat4 {
  const R = rot(yaw, pitch);
  const [x, y, z] = apply(R, 0, 0, 300);
  const T = R.slice() as Mat4;
  T[12] = x; T[13] = y; T[14] = AXIS + z;
  return T;
}

function view(T: Mat4, seed: number): Float32Array {
  let s = seed;
  const n = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 0.8;
  const toCam = invert(T);
  const [cx, , cz] = apply(T, 0, 0, 0);
  const out: number[] = [];
  for (let y = -100; y <= 60; y += 2.2)
    for (let t = -90; t <= 90; t += 1.4) {
      const tr = (t * Math.PI) / 180;
      const r = radius(t, y) + n();
      const x = r * Math.sin(tr), z = AXIS + r * Math.cos(tr);
      if (x * (cx - x) + (z - AXIS) * (cz - z) <= 0) continue;
      out.push(...apply(toCam, x, y, z));
    }
  return Float32Array.from(out);
}

/** Mean |r − truth| over the face window's filled cells. */
function surfaceError(map: Float32Array): number {
  let s = 0, n = 0;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const t = -160 + i, y = -250 + j * 1.5;
      if (Math.abs(t) > 60 || y < -65 || y > 55) continue;
      const v = map[j * W + i]!;
      if (!Number.isFinite(v)) continue;
      s += Math.abs(v - radius(t, y));
      n++;
    }
  return s / n;
}

test("frames placed by shape beat ARKit's wobbling pose, and the result says so", () => {
  let s = 11;
  const jit = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const frames: { pts: Float32Array; pose: Mat4 }[] = [];
  const a = new SideCylinder({ ...grid, a: new Float32Array(0), b: new Float32Array(0) }, AXIS);
  const b = new SideCylinder({ ...grid, a: new Float32Array(0), b: new Float32Array(0) }, AXIS);
  let k = 0;
  for (const [yaw, pitch] of [[0, 0], [0, 0], [0, 0], [-15, 0], [15, 0], [0, -15], [0, 15], [-25, 0], [25, 0], [0, -22], [0, 22], [-30, 5], [30, -5], [-10, 10], [10, -10], [-20, -10], [20, 10], [5, 0], [-5, 0], [0, 5], [0, -5], [12, 12], [-12, -12], [18, -6]] as const) {
    const truth = cameraAt(yaw, pitch);
    // ARKit's error: ~1° and ~1 mm, different every frame.
    const pose = mul(rot(jit() * 1, jit() * 1, jit() * 0.7), truth);
    pose[12] = pose[12]! + jit(); pose[13] = pose[13]! + jit(); pose[14] = pose[14]! + jit();
    const pts = view(truth, k + 3);
    (k++ % 2 ? b : a).add(pose, pts);
    frames.push({ pts, pose });
  }
  const phone: Cylinder = { ...grid, a: a.medians(), b: b.medians() };
  const { cyl, stats } = refineSweep(phone, AXIS, 30, frames);
  assert.equal(stats.used, true, JSON.stringify(stats));
  assert.ok(stats.noiseAfterMm! < stats.noiseBeforeMm! * 0.8, JSON.stringify(stats));
  const errBefore = surfaceError(mergeCyl(phone));
  const errAfter = surfaceError(mergeCyl(cyl));
  if (process.env.SHOW) console.log(JSON.stringify({ ...stats, errBefore, errAfter }));
  assert.ok(errAfter < errBefore * 0.8, `surface error ${errBefore.toFixed(2)} → ${errAfter.toFixed(2)} mm`);
});
