import assert from "node:assert/strict";
import { test } from "node:test";
import { fitWithin, isSquarish } from "./fit-image.ts";

test("a tall cover keeps its shape rather than becoming a square", () => {
  // The bug this file exists for: 500x800 used to be stored as 1080x1080.
  assert.deepEqual(fitWithin({ width: 500, height: 800 }, 1080), { width: 500, height: 800 });
});

test("the long edge is what meets the budget", () => {
  assert.deepEqual(fitWithin({ width: 2000, height: 3200 }, 1080), { width: 675, height: 1080 });
  assert.deepEqual(fitWithin({ width: 3200, height: 2000 }, 1080), { width: 1080, height: 675 });
});

test("a source under the budget is never scaled up", () => {
  // Enlarging cannot add detail; it only costs bytes and a resample.
  assert.deepEqual(fitWithin({ width: 300, height: 480 }, 1080), { width: 300, height: 480 });
  assert.deepEqual(fitWithin({ width: 1080, height: 1080 }, 1080), { width: 1080, height: 1080 });
});

test("a square source stays square", () => {
  assert.deepEqual(fitWithin({ width: 4000, height: 4000 }, 320), { width: 320, height: 320 });
});

test("the aspect ratio survives the rounding", () => {
  const out = fitWithin({ width: 1000, height: 1600 }, 320);
  assert.equal(out.height, 320);
  assert.equal(out.width, 200);
  assert.equal(Math.abs(out.width / out.height - 1000 / 1600) < 0.005, true);
});

test("an extreme ratio still stores at least one pixel each way", () => {
  // A 4000x3 banner at a 320 budget rounds the short edge to zero, and a
  // zero-height canvas throws rather than storing something small.
  const out = fitWithin({ width: 4000, height: 3 }, 320);
  assert.equal(out.width, 320);
  assert.ok(out.height >= 1);
});

test("a source with no size asks for no canvas rather than a broken one", () => {
  assert.deepEqual(fitWithin({ width: 0, height: 0 }, 320), { width: 0, height: 0 });
  assert.deepEqual(fitWithin({ width: Number.NaN, height: 100 }, 320), { width: 0, height: 0 });
  assert.deepEqual(fitWithin(undefined as unknown as { width: number; height: number }, 320), {
    width: 0,
    height: 0,
  });
});

test("no budget means store it as it is", () => {
  assert.deepEqual(fitWithin({ width: 900, height: 600 }, 0), { width: 900, height: 600 });
});

test("square detection has a tolerance, because JPEG sizes are not exact", () => {
  assert.equal(isSquarish({ width: 1080, height: 1080 }), true);
  assert.equal(isSquarish({ width: 1080, height: 1060 }), true);
  assert.equal(isSquarish({ width: 500, height: 800 }), false);
  assert.equal(isSquarish({ width: 0, height: 0 }), false);
});
