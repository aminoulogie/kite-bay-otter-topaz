import assert from "node:assert/strict";
import { test } from "node:test";
import { alignOnAnchors } from "./align3d.ts";
import { compareCyl, faceWindow, type Cylinder } from "./cylmap.ts";

const W = 321, H = 227, AXIS = -60, EYE = 30;
const grid = (): Omit<Cylinder, "a" | "b"> => ({ width: W, height: H, thetaMinDeg: -160, thetaStepDeg: 1, yMinMm: -250, yStepMm: 1.5 });

/** Head surface radius at (θ°, y). A fuller left cheek optional. */
function radius(t: number, y: number, cheek = 0): number {
  const tr = (t * Math.PI) / 180;
  let r = 78 + 14 * Math.cos(tr) ** 2 - ((y - 10) ** 2) / 520;
  r += 13 * Math.exp(-(t * t) / 50) * Math.exp(-((y - 5) ** 2) / 260); // nose
  r += 8 * Math.exp(-(t * t) / 150) * Math.exp(-((y + 62) ** 2) / 110); // chin
  r += 5 * Math.exp(-(((t - 25) ** 2) + ((y - 32) ** 2)) / 60) + 5 * Math.exp(-(((t + 25) ** 2) + ((y - 32) ** 2)) / 60); // brow ridges
  if (cheek && t > 0) r += cheek * Math.exp(-(((t - 45) ** 2) / 150 + ((y + 20) ** 2) / 150));
  return r;
}

/** Sample the surface, moved by a nod of `pitchDeg` and a shift, into a cylinder map (median per cell). */
function scan(pitchDeg: number, dy: number, cheek = 0): Float32Array {
  const p = (pitchDeg * Math.PI) / 180;
  const buckets = new Map<number, number[]>();
  for (let y = -110; y <= 70; y += 0.75)
    for (let t = -90; t <= 90; t += 0.5) {
      const tr = (t * Math.PI) / 180;
      const r = radius(t, y, cheek);
      const x = r * Math.sin(tr);
      const z0 = AXIS + r * Math.cos(tr);
      // Nod about the x axis through the head's middle.
      const yy = y * Math.cos(p) - (z0 - AXIS) * Math.sin(p) + dy;
      const zz = AXIS + y * Math.sin(p) + (z0 - AXIS) * Math.cos(p);
      const dz = zz - AXIS;
      const i = Math.round((Math.atan2(x, dz) * 180) / Math.PI + 160);
      const j = Math.round((yy + 250) / 1.5);
      if (i < 0 || i >= W || j < 0 || j >= H) continue;
      const k = j * W + i;
      (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(Math.hypot(x, dz));
    }
  const m = new Float32Array(W * H).fill(NaN);
  for (const [k, l] of buckets) m[k] = l.sort((a, b) => a - b)[l.length >> 1]!;
  return m;
}

test("a nod and a shift between scans is taken out on the forehead and nose, not read as change", () => {
  const c = { ...grid(), a: new Float32Array(0), b: new Float32Array(0) } as Cylinder;
  const first = scan(0, 0);
  const second = scan(3, 1.5);
  const w = faceWindow(EYE);
  const slideOnly = compareCyl(first, second, c, w)!;
  const aligned = alignOnAnchors(first, second, c, AXIS, EYE)!;
  const after = compareCyl(first, aligned.map, c, w)!;
  assert.ok(aligned.anchorRmsMm < 0.5, `anchor fit ${aligned.anchorRmsMm}`);
  assert.ok(after.rmsMm < slideOnly.rmsMm / 2, `slide-only ${slideOnly.rmsMm.toFixed(2)} → aligned ${after.rmsMm.toFixed(2)}`);
  assert.ok(after.rmsMm < 0.4, `aligned ${after.rmsMm}`);
});

test("real change away from the anchors survives the alignment", () => {
  const c = { ...grid(), a: new Float32Array(0), b: new Float32Array(0) } as Cylinder;
  const first = scan(0, 0);
  const aligned = alignOnAnchors(first, scan(3, 1.5, 3), c, AXIS, EYE)!;
  // At the fuller cheek's centre (θ 45°, y −20) and its mirror on the right.
  const at = (t: number, y: number) => {
    const k = Math.round((y + 250) / 1.5) * W + (t + 160);
    return aligned.map[k]! - first[k]!;
  };
  assert.ok(Math.abs(at(45, -20) - 3) < 0.5, `left cheek ${at(45, -20)}`);
  assert.ok(Math.abs(at(-45, -20)) < 0.4, `right cheek ${at(-45, -20)}`);
});
