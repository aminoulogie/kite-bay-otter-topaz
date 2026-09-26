import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, hornFit, icp, identity, mul, PointIndex, registerSide, rotationDeg, type Mat4 } from "./register.ts";

/** Rotation about y by `deg`, then translation. */
function pose(deg: number, tx: number, ty: number, tz: number, pitchDeg = 0): Mat4 {
  const a = (deg * Math.PI) / 180, b = (pitchDeg * Math.PI) / 180;
  const ry = identity();
  ry[0] = Math.cos(a); ry[2] = -Math.sin(a); ry[8] = Math.sin(a); ry[10] = Math.cos(a);
  const rx = identity();
  rx[5] = Math.cos(b); rx[6] = Math.sin(b); rx[9] = -Math.sin(b); rx[10] = Math.cos(b);
  const m = mul(ry, rx);
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

/** A head: ellipsoid-ish with a nose and chin, as points in face axes (mm). */
function headPoints(ears = true): number[] {
  const out: number[] = [];
  for (let y = -110; y <= 80; y += 3)
    for (let t = -160; t <= 160; t += 2) {
      const tr = (t * Math.PI) / 180;
      let r = 80 + 14 * Math.cos(tr) ** 2 - ((y + 20) ** 2) / 500;
      r += 14 * Math.exp(-(t * t) / 60) * Math.exp(-(y * y) / 300);
      r += 9 * Math.exp(-(t * t) / 150) * Math.exp(-((y + 55) ** 2) / 120);
      r += 4 * Math.exp(-(((t - 70) ** 2) / 300 + ((y + 60) ** 2) / 200)); // jaw corner
      // Ears: the strongest 3D feature a head has side-on.
      if (ears) for (const e of [95, -95]) r += 16 * Math.exp(-(((t - e) ** 2) / 40 + ((y + 10) ** 2) / 250));
      out.push(r * Math.sin(tr), y, -60 + r * Math.cos(tr));
    }
  return out;
}

/** What a camera at `camToFace` sees of the head (points facing it), in camera axes, with noise. */
function view(head: number[], camToFace: Mat4, noise = 0.3, seed = 3): Float32Array {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  const faceToCam = invert(camToFace);
  const [cx, , cz] = apply(camToFace, 0, 0, 0);
  const out: number[] = [];
  for (let i = 0; i < head.length; i += 3) {
    const x = head[i]!, y = head[i + 1]!, z = head[i + 2]!;
    // Facing the camera: outward normal (roughly radial) against the view direction.
    const nx = x, nz = z + 60;
    if (nx * (cx - x) + nz * (cz - z) <= 0) continue;
    const [a, b, c] = apply(faceToCam, x + rnd(), y + rnd(), z + rnd());
    out.push(a, b, c);
  }
  return Float32Array.from(out);
}

test("Horn recovers a known rigid move exactly", () => {
  const src = headPoints().slice(0, 900);
  const M = pose(23, 10, -5, 40, 7);
  const dst: number[] = [];
  for (let i = 0; i < src.length; i += 3) dst.push(...apply(M, src[i]!, src[i + 1]!, src[i + 2]!));
  const fit = hornFit(src, dst);
  for (let k = 0; k < 16; k++) assert.ok(Math.abs(fit[k]! - M[k]!) < 1e-6, `entry ${k}`);
});

test("ICP pulls a side view onto the model from a rough start", () => {
  const head = headPoints();
  const model = new PointIndex(8);
  for (let i = 0; i < head.length; i += 3) model.add(head[i]!, head[i + 1]!, head[i + 2]!);
  // A camera 300 mm off the person's left side, looking at the head.
  const truth = pose(90, 300, 0, -60);
  const frame = view(head, truth);
  const start = mul(pose(6, 8, -6, 5), truth);
  const r = icp(model, frame, start);
  const err = mul(invert(truth), r.T);
  assert.ok(rotationDeg(err) < 0.5, `rotation off by ${rotationDeg(err)}°`);
  assert.ok(Math.hypot(err[12]!, err[13]!, err[14]!) < 1.5, "translation off");
  assert.ok(r.rms < 1 && r.inliers > 0.8);
});

for (const [name, ears, maxRot] of [
  ["a turn is chained round from the front, and holds come back placed", true, 1],
  // Worst case — a head with no ears is nearly round, the one shape matching
  // cannot feel turning. The motion forecast must still carry it round.
  ["even a featureless round head is carried round by the forecast", false, 3],
] as const)
test(name, () => {
  const head = headPoints(ears);
  // The model the front sweep gives: only the front ±60°.
  const model = new PointIndex(8);
  for (let i = 0; i < head.length; i += 3) {
    const t = (Math.atan2(head[i]!, head[i + 2]! + 60) * 180) / Math.PI;
    if (Math.abs(t) <= 60) model.add(head[i]!, head[i + 1]!, head[i + 2]!);
  }
  const frames: { stage: "turn" | "hold"; pts: Float32Array; pose: Mat4 | null; truth: Mat4 }[] = [];
  // The turn, then — as on the phone — a few still frames before the hold
  // starts (the hold begins only once standing still is detected).
  const angles = [...Array.from({ length: 19 }, (_, k) => k * 5), 90, 90, 90];
  angles.forEach((deg, k) => {
    const T = pose(deg, 300 * Math.sin((deg * Math.PI) / 180), 0, -60 + 300 * Math.cos((deg * Math.PI) / 180));
    frames.push({ stage: k === angles.length - 1 ? ("hold" as const) : ("turn" as const), pts: view(head, T, 0.3, k + 1), pose: deg <= 40 ? T : null, truth: T });
  });
  const r = registerSide(model, frames);
  assert.equal(r.holds.length, 1);
  const err = mul(invert(frames.at(-1)!.truth), r.holds[0]!.T);
  // What the measurements see: each placed point's radius from the head's
  // axis and its height, against where it truly is. A slide round a round
  // head's own axis changes neither, so this holds even when the pose does not.
  const hold = r.holds[0]!;
  const truth = frames.at(-1)!.truth;
  let surf = 0;
  const count = hold.pts.length / 3;
  for (let i = 0; i < count; i++) {
    const [x, y, z] = apply(hold.T, hold.pts[i * 3]!, hold.pts[i * 3 + 1]!, hold.pts[i * 3 + 2]!);
    const [tx, ty, tz] = apply(truth, hold.pts[i * 3]!, hold.pts[i * 3 + 1]!, hold.pts[i * 3 + 2]!);
    surf += Math.abs(Math.hypot(x, z + 60) - Math.hypot(tx, tz + 60)) + Math.abs(y - ty);
  }
  assert.ok(surf / count < 0.6, `placed surface off by ${(surf / count).toFixed(2)} mm`);
  assert.ok(rotationDeg(err) < maxRot, `side-on rotation off by ${rotationDeg(err)}°`);
  if (ears) {
    const moved = Math.hypot(err[12]!, err[13]!, err[14]!);
    assert.ok(moved < 2, `side-on translation off by ${moved.toFixed(2)} mm`);
  }
});

test("a hold survives an ARKit pose that is well out, by falling back on the chain", () => {
  const head = headPoints();
  const model = new PointIndex(8);
  for (let i = 0; i < head.length; i += 3) {
    const t = (Math.atan2(head[i]!, head[i + 2]! + 60) * 180) / Math.PI;
    if (Math.abs(t) <= 60) model.add(head[i]!, head[i + 1]!, head[i + 2]!);
  }
  const at = (deg: number) => pose(deg, 300 * Math.sin((deg * Math.PI) / 180), 0, -60 + 300 * Math.cos((deg * Math.PI) / 180));
  const frames: { stage: "turn" | "hold"; pts: Float32Array; pose: Mat4 | null }[] = [];
  const angles = [...Array.from({ length: 19 }, (_, k) => k * 5), 90, 90, 90];
  angles.forEach((deg, k) => {
    const truth = at(deg);
    const hold = k >= angles.length - 3;
    // Side-on, ARKit still reports a pose, and it can be badly out: it is
    // fitting a face it can hardly see. Far enough out and the frame's points
    // land outside the head window and are thrown away before matching even
    // runs — the scan that came back saying none placed.
    const reported = hold ? mul(pose(65, 320, 180, 260), truth) : deg <= 40 ? truth : null;
    frames.push({ stage: hold ? "hold" : "turn", pts: view(head, truth, 0.3, k + 1), pose: reported });
  });
  const r = registerSide(model, frames);
  assert.ok(r.holds.length >= 1, `holds placed (${r.holds.length}), lost ${r.lost}`);
  // And placed properly, not merely accepted: on the surface, where measuring from.
  const hold = r.holds[0]!;
  const truth = at(90);
  let surf = 0;
  const count = hold.pts.length / 3;
  for (let i = 0; i < count; i++) {
    const [x, y, z] = apply(hold.T, hold.pts[i * 3]!, hold.pts[i * 3 + 1]!, hold.pts[i * 3 + 2]!);
    const [tx, ty, tz] = apply(truth, hold.pts[i * 3]!, hold.pts[i * 3 + 1]!, hold.pts[i * 3 + 2]!);
    surf += Math.abs(Math.hypot(x, z + 60) - Math.hypot(tx, tz + 60)) + Math.abs(y - ty);
  }
  assert.ok(surf / count < 1.5, `placed surface off by ${(surf / count).toFixed(2)} mm`);
});
