import assert from "node:assert/strict";
import { test } from "node:test";
import type { Cylinder } from "./cylmap.ts";
import { buildMesh, heatColor, tidy } from "./cylmesh.ts";

const W = 41, H = 31;
const cyl = (): Cylinder => ({
  a: new Float32Array(W * H), b: new Float32Array(W * H), width: W, height: H,
  thetaMinDeg: -20, thetaStepDeg: 1, yMinMm: 0, yStepMm: 1.5,
});

test("a full patch becomes a closed grid of triangles, placed round the axis", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(90);
  const m = buildMesh(map, c, -60, 2, undefined, -1000);
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
  for (let j = 0; j < H; j++) for (let i = 17; i <= 23; i++) map[j * W + i] = NaN; // a 7° gap round θ = 0
  for (let j = 0; j < H; j++) for (let i = 30; i < W; i++) map[j * W + i] = 120; // a 30 mm cliff
  const m = buildMesh(map, c, -60, 1, undefined, -1000);
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
  const m = buildMesh(shifted, c, -60, 1, { map: before, di: 1, dj: 0, meanMm: 0, noiseMm: 0.5 }, -1000);
  const v = 10 * W + 21;
  assert.ok(Math.abs(m.change[v]! - 3) < 1e-6, `${m.change[v]}`);
  assert.ok(m.colors[v * 3 + 1]! > 0.8);
});

test("tidy fills pinholes, keeps big gaps and real edges", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(90);
  map[15 * W + 10] = NaN; // a pinhole
  for (let j = 0; j < H; j++) for (let i = 30; i < 38; i++) map[j * W + i] = NaN; // a real gap
  for (let j = 0; j < H; j++) map[j * W + 5] = 96; // a 6 mm step (an edge)
  const t = tidy(map, c);
  assert.ok(Math.abs(t[15 * W + 10]! - 90) < 1e-6, "pinhole filled");
  assert.ok(Number.isNaN(t[15 * W + 34]!), "big gap left open");
  assert.equal(t[10 * W + 5], 96, "edge not smeared");
});

test("unreliable cells stay grey in the heatmap", () => {
  const c = cyl();
  const before = new Float32Array(W * H).fill(90);
  const now = new Float32Array(W * H).fill(94);
  const m = buildMesh(now, c, -60, 1, { map: before, di: 0, dj: 0, meanMm: 0, noiseMm: 0.5, reliable: (k) => k % 2 === 0 }, -1000);
  assert.ok(Number.isNaN(m.change[1]!) && Math.abs(m.change[0]! - 4) < 1e-6);
});

test("the nose is meshed whole: steep sides, the drop under the tip, a nostril dropout", () => {
  // A head of radius 100 with a 25 mm nose that falls sharply to the lip —
  // the radius-jump rule used to leave the tip's sides and underside open.
  const NW = 101, NH = 101;
  const c: Cylinder = {
    a: new Float32Array(NW * NH), b: new Float32Array(NW * NH), width: NW, height: NH,
    thetaMinDeg: -50, thetaStepDeg: 1, yMinMm: -75, yStepMm: 1.5,
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const map = new Float32Array(NW * NH);
  for (let j = 0; j < NH; j++)
    for (let i = 0; i < NW; i++) {
      const x = 100 * Math.sin(((-50 + i) * Math.PI) / 180);
      const y = -75 + j * 1.5;
      let h = 0;
      if (y <= 20 && y >= -25) {
        const f = (20 - y) / 45;
        h = Math.max(0, (6 + 19 * f) * (1 - (Math.abs(x) / (6 + 10 * f)) ** 1.5));
      } else if (y < -25 && y > -29) {
        h = Math.max(0, 25 * (1 - (y + 25) / -4) * (1 - (Math.abs(x) / 16) ** 1.5));
      }
      map[j * NW + i] = 100 + h + (rnd() - 0.5) * 1.6;
    }
  for (let j = 30; j < 38; j++) for (let i = 45; i < 49; i++) map[j * NW + i] = NaN;
  const m = buildMesh(tidy(map, c), c, -60, 2, undefined, -1000);
  const full = 2 * 50 * 50;
  assert.ok(m.indices.length / 3 >= full - 4, `${m.indices.length / 3} of ${full} triangles`);
});

test("tidy closes a hole the shape the camera really drops, and leaves the edge of the scan open", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(90);
  // A lash line: four cells wide, six tall — the sort of dropout that was
  // showing as a black slot beside the eye.
  for (let j = 12; j < 18; j++) for (let i = 14; i < 18; i++) map[j * W + i] = NaN;
  // Past column 33 the sweep never reached: open on one side only.
  for (let j = 0; j < H; j++) for (let i = 33; i < W; i++) map[j * W + i] = NaN;
  const t = tidy(map, c);
  for (let j = 12; j < 18; j++)
    for (let i = 14; i < 18; i++) assert.ok(Number.isFinite(t[j * W + i]!), `lash cell ${i},${j} filled`);
  assert.ok(Number.isNaN(t[15 * W + 36]!), "the unreached edge stays open");
});

test("a hole against the edge of the scan is not invented back", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(90);
  for (let j = 0; j < 3; j++) for (let i = 0; i < W; i++) map[j * W + i] = NaN; // above the forehead
  for (let j = 3; j < 6; j++) for (let i = 20; i < 24; i++) map[j * W + i] = NaN; // a notch touching it
  const t = tidy(map, c);
  // Nothing encloses the notch from above, so filling it would be inventing
  // where the head ends, not restoring skin.
  assert.ok(Number.isNaN(t[4 * W + 21]!), "the outline stays where the data stops");
});

test("loose shards are dropped, the surface is kept", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(NaN);
  // A solid patch of head...
  for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) map[j * W + i] = 90;
  // ...and a speckle of neck cells far below it, too sparse to be surface.
  for (let j = 26; j < 30; j++) for (let i = 30; i < 34; i++) map[j * W + i] = 70;
  const m = buildMesh(map, c, -60, 1, undefined, -1000);
  const ys = [...m.indices].map((v) => m.positions[v * 3 + 1]!);
  assert.ok(m.indices.length > 300, `surface kept (${m.indices.length / 3} triangles)`);
  assert.ok(Math.max(...ys) <= 19 * 1.5 + 1e-6, "no shard from the speckle");
});

test("a scan that is all speckle still shows its biggest piece", () => {
  const c = cyl();
  const map = new Float32Array(W * H).fill(NaN);
  for (let j = 4; j < 8; j++) for (let i = 4; i < 8; i++) map[j * W + i] = 90;
  const m = buildMesh(map, c, -60, 1, undefined, -1000);
  assert.ok(m.indices.length > 0, "not an empty box");
});
