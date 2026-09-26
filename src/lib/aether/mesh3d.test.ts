import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFloat32, distanceMm, extents3d, mirrorPairs, symmetry3d } from "./mesh3d.ts";

/** A symmetric "face": a grid of points on a curved surface, mirrored in x. */
function face(skewRight = 0, shift = 0): Float32Array {
  const pts: number[] = [];
  for (let yi = 0; yi < 9; yi++) {
    for (let xi = -5; xi <= 5; xi++) {
      const x = xi * 8;
      const y = yi * 12 - 50;
      const z = 40 - (x * x) / 60 - (y * y) / 120;
      // skewRight pushes the right half (x > 0) forward: a real asymmetry.
      pts.push(x + shift, y, z + (x > 0 ? skewRight : 0));
    }
  }
  return new Float32Array(pts);
}

test("a perfectly symmetric mesh reads ~0 mm", () => {
  const s = symmetry3d(face())!;
  assert.ok(s.rmsMm < 1e-4, `rms ${s.rmsMm}`);
});

test("a mesh offset from x = 0 is not called asymmetric — the midline is found", () => {
  const s = symmetry3d(face(0, 3))!;
  assert.ok(s.rmsMm < 1e-3, `rms ${s.rmsMm}`);
  assert.ok(Math.abs(s.midlineOffsetMm - 3) < 1e-3, `midline ${s.midlineOffsetMm}`);
});

test("one side pushed forward shows up in millimetres", () => {
  const s = symmetry3d(face(2))!;
  assert.ok(s.rmsMm > 1 && s.rmsMm < 2.5, `rms ${s.rmsMm}`);
  assert.ok(s.p95Mm >= s.rmsMm);
});

test("mirror pairs are mutual on a symmetric mesh", () => {
  const { pairs } = mirrorPairs(face());
  for (let i = 0; i < pairs.length; i++) assert.equal(pairs[pairs[i]!], i);
});

test("extents in real millimetres", () => {
  const e = extents3d(face())!;
  assert.equal(e.faceWidthMm, 80);
  assert.equal(e.meshHeightMm, 96);
  assert.ok(e.lowerToFace > 0 && e.lowerToFace <= 1);
});

test("distance and base64 decoding", () => {
  assert.equal(distanceMm([0, 0, 0], [3, 4, 0]), 5);
  const src = new Float32Array([1.5, -2, 30]);
  const b64 = Buffer.from(src.buffer).toString("base64");
  assert.deepEqual([...decodeFloat32(b64)], [1.5, -2, 30]);
});
