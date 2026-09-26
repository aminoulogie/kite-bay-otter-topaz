import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EYE_LINE_Y, FACE_HEIGHT_FRAC, IDENTITY, angleOf, apply, autoPlacement, cssMatrix, fitPlacement, gesture, scaleOf,
} from "./align.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("auto placement levels the eyes and puts them on the guides", () => {
  // A face tilted 10°, anywhere in a big photo.
  const t = (10 * Math.PI) / 180;
  const c = { x: 1500, y: 900 };
  const rot = (dx: number, dy: number) => ({
    x: c.x + dx * Math.cos(t) - dy * Math.sin(t),
    y: c.y + dx * Math.sin(t) + dy * Math.cos(t),
  });
  const l = rot(-60, 0), r = rot(60, 0), brow = rot(0, -40), chin = rot(0, 220);
  const p = autoPlacement(r, l, brow, chin, 1080, 1440)!; // eyes given in the wrong order on purpose
  const L = apply(p, l), R = apply(p, r), B = apply(p, brow), C = apply(p, chin);
  near(L.y, R.y);
  near((L.x + R.x) / 2, 540);
  near(L.y, EYE_LINE_Y * 1440);
  near(Math.hypot(C.x - B.x, C.y - B.y), FACE_HEIGHT_FRAC * 1440);
});

test("fit centres the whole photo inside the frame", () => {
  const p = fitPlacement(4000, 3000, 1080, 1440);
  const tl = apply(p, { x: 0, y: 0 }), br = apply(p, { x: 4000, y: 3000 });
  near(tl.x, 0);
  near(br.x, 1080);
  near((tl.y + br.y) / 2, 720);
});

test("a pinch grows and turns the photo about the point between the fingers", () => {
  const pivot = { x: 300, y: 400 };
  const q = { x: 300, y: 400 }; // an image point sitting under the pivot
  const p = gesture(IDENTITY, pivot, 0, 0, 2, Math.PI / 6);
  const under = apply(p, q);
  near(under.x, 300);
  near(under.y, 400);
  near(scaleOf(p), 2);
  near(angleOf(p), Math.PI / 6);
});

test("a drag just moves", () => {
  const p = gesture(IDENTITY, { x: 0, y: 0 }, 25, -10);
  const m = apply(p, { x: 5, y: 5 });
  near(m.x, 30);
  near(m.y, -5);
});

test("degenerate input gives no placement", () => {
  assert.equal(autoPlacement({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 }, 1080, 1440), null);
});

test("css matrix scales everything by the display factor", () => {
  assert.equal(cssMatrix({ a: 1, b: 0, tx: 10, ty: 20 }, 0.5), "matrix(0.5, 0, 0, 0.5, 5, 10)");
});
