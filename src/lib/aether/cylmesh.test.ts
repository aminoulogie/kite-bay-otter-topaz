import assert from "node:assert/strict";
import { test } from "node:test";
import type { Cylinder } from "./cylmap.ts";
import { buildMesh, heatColor } from "./cylmesh.ts";

const W = 41, H = 31;
const cyl = (): Cylinder => ({
  a: new Float32Array(W * H), b: new Float32Array(W * H), width: W, height: H,
  thetaMinDeg: -20, thetaStepDeg: 1, yMinMm: 0, yStepMm: 1.5,
});

test("a full patch becomes a closed grid of triangles, placed round the axis", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(90);
  const m = buildMesh(map, c, -60, 2);
  const cols = 21, rows = 16;
  assert.equal(m.positions.length / 3, cols * rows);
  assert.equal(m.indices.length / 3, 2 * (cols - 1) * (rows - 1));
  // θ = 0, y = 0 → straight ahead of the axis.
  const k = 10 * 3; // row 0, column 10 (θ = 0)
  assert.ok(Math.abs(m.positions[k]!) < 1e-6 && Math.abs(m.positions[k + 2]! - 30) < 1e-4);
});

test("gaps and jumps are not bridged", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(90);
  for (let j = 0; j < H; j++) map[j * W + 20] = NaN; // a missing column at θ = 0
  for (let j = 0; j < H; j++) for (let i = 30; i < W; i++) map[j * W + i] = 120; // a 30 mm cliff
  const m = buildMesh(map, c, -60, 1);
  for (let t = 0; t < m.indices.length; t += 3) {
    const xs = [0, 1, 2].map((k) => m.positions[m.indices[t + k]! * 3]!);
    const rs = [0, 1, 2].map((k) => Math.hypot(m.positions[m.indices[t + k]! * 3]!, m.positions[m.indices[t + k]! * 3 + 2]! + 60));
    assert.ok(Math.max(...rs) - Math.min(...rs) < 8, "no triangle spans the cliff");
    assert.ok(!(Math.min(...xs) < -0.5 && Math.max(...xs) > 0.5), "no triangle spans the missing column");
  }
});

test("heatmap: grey within noise, green out, red in, and the alignment is honoured", () => {
  assert.deepEqual(heatColor(0.3, 0.5), heatColor(NaN, 0.5));
  assert.ok(heatColor(3, 0.5)[1] > 0.8 && heatColor(-3, 0.5)[0] > 0.9);
  const c = cyl();
  const before = new Float32Array(W * H).fill(90);
  const now = new Float32Array(W * H).fill(90);
  now[10 * W + 20] = 93; // fuller at θ = 0, row 10
  // The newer map sits one column round: compareCyl would report di = 1.
  const shifted = new Float32Array(W * H).fill(90);
  shifted[10 * W + 21] = 93;
  const m = buildMesh(shifted, c, -60, 1, { map: before, di: 1, dj: 0, meanMm: 0, noiseMm: 0.5 });
  const v = 10 * W + 21;
  assert.ok(Math.abs(m.change[v]! - 3) < 1e-6, `${m.change[v]}`);
  assert.ok(m.colors[v * 3 + 1]! > 0.8);
});
