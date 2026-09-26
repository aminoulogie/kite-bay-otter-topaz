import assert from "node:assert/strict";
import { test } from "node:test";
import { summariseCylinder, type Cylinder } from "./cylmap.ts";
import { extendWithSides, type RawSideFrame } from "./fullscan.ts";
import { apply, identity, mul, type Mat4 } from "./register.ts";

const W = 321, H = 227, AXIS = -60;
const NECK_A = 55, NECK_B = 60;

/** Radius at (θ°, y mm): a head with nose, chin, ears, jaw — and a neck (ellipse 110 × 120) below y −85. */
function radius(t: number, y: number): number {
  const tr = (t * Math.PI) / 180;
  // Shoulders and chest: at 30 cm side-on they fill most of the phone's depth frame.
  // Broad shoulders reaching well out to the side — side-on they are as
  // near the phone as the head, and outnumber its points.
  if (y < -150) return (230 * 120) / Math.hypot(120 * Math.sin(tr), 230 * Math.cos(tr));
  if (y < -85) return (NECK_A * NECK_B) / Math.hypot(NECK_B * Math.sin(tr), NECK_A * Math.cos(tr));
  let r = 78 + 14 * Math.cos(tr) ** 2 - ((y + 10) ** 2) / 500;
  r += 14 * Math.exp(-(t * t) / 60) * Math.exp(-(y * y) / 300);
  r += 9 * Math.exp(-(t * t) / 150) * Math.exp(-((y + 55) ** 2) / 120);
  for (const e of [95, -95]) r += 16 * Math.exp(-(((t - e) ** 2) / 40 + ((y + 10) ** 2) / 250));
  return r;
}

function rotY(deg: number, tx: number, ty: number, tz: number): Mat4 {
  const a = (deg * Math.PI) / 180;
  const m = identity();
  m[0] = Math.cos(a); m[2] = -Math.sin(a); m[8] = Math.sin(a); m[10] = Math.cos(a);
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

function invert(m: Mat4): Mat4 {
  const o = identity();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c]!;
  const [x, y, z] = apply(o, m[12]!, m[13]!, m[14]!);
  o[12] = -x; o[13] = -y; o[14] = -z;
  return o;
}

/** The front sweep's cylinder: only what the front saw (|θ| ≤ 60), both halves. */
function frontCylinder(): Cylinder {
  const a = new Float32Array(W * H).fill(NaN);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const t = -160 + i;
      if (Math.abs(t) <= 60) a[j * W + i] = radius(t, -250 + j * 1.5);
    }
  return { a, b: a.slice(), width: W, height: H, thetaMinDeg: -160, thetaStepDeg: 1, yMinMm: -250, yStepMm: 1.5 };
}

/** One phone depth frame of the surface from `camToFace`, encoded as the plugin sends it. */
function frame(camToFace: Mat4, stage: "turn" | "hold", tracked: boolean, swellMm = 0): RawSideFrame {
  const toCam = invert(camToFace);
  const [cx, , cz] = apply(camToFace, 0, 0, 0);
  const out: number[] = [];
  for (let y = -320; y <= 70; y += 2.5)
    for (let t = -160; t <= 160; t += 1.5) {
      // A distortion no rigid move can absorb (a uniform swell would just be
      // refined away): the surface bulges one way and hollows the other.
      const r = radius(t, y) + swellMm * Math.sin((2 * t * Math.PI) / 180);
      const tr = (t * Math.PI) / 180;
      const x = r * Math.sin(tr), z = AXIS + r * Math.cos(tr);
      if (x * (cx - x) + (z - AXIS) * (cz - z) <= 0) continue;
      const [a, b, c] = apply(toCam, x, y, z);
      out.push(Math.round(a * 10), Math.round(b * 10), Math.round(c * 10)); // 0.1 mm, as Int16
    }
  const bytes = new Uint8Array(Int16Array.from(out).buffer);
  let bin = "";
  for (const v of bytes) bin += String.fromCharCode(v);
  const f: RawSideFrame = { stage, points: btoa(bin) };
  if (tracked) {
    const m = Array.from(camToFace);
    m[12] = m[12]! / 1000; m[13] = m[13]! / 1000; m[14] = m[14]! / 1000; // ARKit sends metres
    f.pose = m;
  }
  return f;
}

function sideFrames(sign: 1 | -1, swellMm = 0): RawSideFrame[] {
  const out: RawSideFrame[] = [];
  const angles = [...Array.from({ length: 19 }, (_, k) => k * 5), 90, 90, ...Array<number>(6).fill(90)];
  angles.forEach((deg, k) => {
    const d = sign * deg;
    const T = mul(rotY(0, 0, 0, 0), rotY(d, 300 * Math.sin((d * Math.PI) / 180), -40, AXIS + 300 * Math.cos((d * Math.PI) / 180)));
    out.push(frame(T, k >= 21 ? "hold" : "turn", deg <= 40, k >= 21 ? swellMm : 0));
  });
  return out;
}

test("end to end: side frames, as the phone sends them, extend the model and measure the neck", () => {
  const front = frontCylinder();
  const before = summariseCylinder(front, 30, 60, 1, { axisZ: AXIS, gravityFace: [0, -1, 0], sides: null });
  assert.equal(before.full?.neckWidthMm ?? null, null, "the front alone cannot see round the neck");

  const { cyl, stats } = extendWithSides(front, AXIS, { right: sideFrames(-1), left: sideFrames(1) });
  assert.ok(stats.right.holds >= 5 && stats.left.holds >= 5, JSON.stringify(stats));
  assert.ok(stats.right.fitMm! < 1 && stats.left.fitMm! < 1, JSON.stringify(stats));

  const s = summariseCylinder(cyl, 30, 60, 1, { axisZ: AXIS, gravityFace: [0, -1, 0], sides: stats });
  const f = s.full!;
  assert.ok(f.neckWidthMm != null && Math.abs(f.neckWidthMm - 2 * NECK_A) < 3, `neck width ${f.neckWidthMm}`);
  assert.ok(f.neckCircumferenceMm != null && f.neckCircumferenceMm > 300 && f.neckCircumferenceMm < 380, `circ ${f.neckCircumferenceMm}`);
  assert.ok(s.jawWidthMm != null, "jaw width now measurable round both sides");
  assert.ok(f.neckLeanDeg != null && Math.abs(f.neckLeanDeg) < 8, `lean ${f.neckLeanDeg}`);
});

test("a step back side-on adds the neck, shoulders and upper back as a cloud", () => {
  const front = frontCylinder();
  const right = sideFrames(-1);
  // Stepping back from 300 to 550 mm, still side-on, then the posture hold.
  const d = -90;
  const at = (dist: number) =>
    rotY(d, dist * Math.sin((d * Math.PI) / 180), -40, AXIS + dist * Math.cos((d * Math.PI) / 180));
  for (let dist = 320; dist <= 540; dist += 20) right.push(frame(at(dist), "turn", false));
  for (let k = 0; k < 4; k++) right.push({ ...frame(at(550), "hold", false), stage: "posture" });
  const { stats, cloud } = extendWithSides(front, AXIS, { right, left: sideFrames(1) });
  assert.ok((stats.right.postureUsed ?? 0) >= 2, JSON.stringify(stats.right));
  let low = 0;
  for (let i = 1; i < cloud.length; i += 3) if (cloud[i]! < -250) low++;
  assert.ok(low > 200, `points below the neck (shoulders): ${low}`);
});

test("holds that miss the measuring limit still give the model a neck to show", () => {
  const front = frontCylinder();
  // Holds sitting about 3 mm off the front scan: the real scan that came back
  // saying "5 holds sat 2.9 mm off the front scan (limit 1.5)" and left the
  // model with no neck at all.
  const { cyl, stats, cloud } = extendWithSides(front, AXIS, { right: sideFrames(-1, 9), left: sideFrames(1, 9) });
  assert.equal(stats.right.holds, 0, "not measured from");
  assert.ok((stats.right.shownOnly ?? 0) >= 1, `shown only: ${JSON.stringify(stats.right)}`);

  // Nothing they carry reaches a number...
  const s = summariseCylinder(cyl, 30, 60, 1, { axisZ: AXIS, gravityFace: [0, -1, 0], sides: stats });
  assert.equal(s.full?.neckWidthMm ?? null, null, "a neck width would be made up");

  // ...but the neck is there to look at.
  let neck = 0;
  for (let i = 1; i < cloud.length; i += 3) if (cloud[i]! < -90 && cloud[i]! > -200) neck++;
  assert.ok(neck > 500, `neck points in the model: ${neck}`);
});
