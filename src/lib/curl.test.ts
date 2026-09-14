import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bisector, clipToSide, cornerPoint, foldAt, grabbedCorner, matrixCss, polygonCss,
  reflection, side, type Line, type Point,
} from "./curl.ts";

const BOX = { w: 400, h: 800 };
const RECT: Point[] = [
  { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 800 }, { x: 0, y: 800 },
];

/** Shoelace, for checking that a cut-up rectangle is still a rectangle. */
function area(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const near = (got: number, want: number, slack = 0.001) =>
  assert.ok(Math.abs(got - want) < slack, `${got} is not ${want}`);

test("the crease is the same distance from both ends", () => {
  const l = bisector({ x: 0, y: 0 }, { x: 10, y: 0 })!;
  // Every point on it is 5 from each — which for these two is the line x = 5.
  near(side(l, { x: 5, y: 0 }), 0);
  near(side(l, { x: 5, y: 999 }), 0);
  assert.ok(side(l, { x: 0, y: 0 }) < 0, "the start is on one side");
  assert.ok(side(l, { x: 10, y: 0 }) > 0, "the end is on the other");
});

test("a finger that has not moved has no crease", () => {
  assert.equal(bisector({ x: 5, y: 5 }, { x: 5, y: 5 }), null);
});

test("a rectangle cut by a line is still all there", () => {
  // Nothing is lost and nothing is invented: the two pieces are the whole.
  for (const l of [
    { a: 1, b: 0, c: -150 },
    { a: 0, b: 1, c: -600 },
    { a: 1, b: 1, c: -500 },
    { a: 3, b: -1, c: -20 },
  ] as Line[]) {
    const a = area(clipToSide(RECT, l, 1));
    const b = area(clipToSide(RECT, l, -1));
    near(a + b, BOX.w * BOX.h, 0.01);
    assert.ok(a > 0 && b > 0, "both sides have something on them");
  }
});

test("a cut that misses the page leaves it whole", () => {
  const miss: Line = { a: 1, b: 0, c: -9999 };
  near(area(clipToSide(RECT, miss, -1)), BOX.w * BOX.h);
  assert.deepEqual(clipToSide(RECT, miss, 1), [], "and nothing on the other side");
});

test("a diagonal cut through a corner gives a triangle", () => {
  // The line x + y = 200 cuts the top-left corner off.
  const l: Line = { a: 1, b: 1, c: -200 };
  const corner = clipToSide(RECT, l, -1);
  assert.equal(corner.length, 3);
  near(area(corner), (200 * 200) / 2);
});

test("clipping an empty polygon stays empty", () => {
  assert.deepEqual(clipToSide([], { a: 1, b: 0, c: 0 }, 1), []);
});

/* --------------------------------------------------------------------------
   Reflection.
   -------------------------------------------------------------------------- */
const apply = (m: ReturnType<typeof reflection>, p: Point): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

test("a point on the crease does not move", () => {
  const l = bisector({ x: 400, y: 800 }, { x: 100, y: 200 })!;
  const on = { x: (400 + 100) / 2, y: (800 + 200) / 2 };
  const got = apply(reflection(l), on);
  near(got.x, on.x);
  near(got.y, on.y);
});

test("the held corner lands exactly where the finger is", () => {
  // The whole point of folding about the bisector: the corner you are holding
  // ends up under your finger. If this is out by a pixel the paper tears.
  for (const at of [{ x: 100, y: 200 }, { x: -50, y: 500 }, { x: 260, y: 40 }]) {
    const from = { x: 400, y: 800 };
    const l = bisector(from, at)!;
    const got = apply(reflection(l), from);
    near(got.x, at.x);
    near(got.y, at.y);
  }
});

test("reflecting twice puts everything back", () => {
  const l = bisector({ x: 0, y: 0 }, { x: 300, y: 120 })!;
  const m = reflection(l);
  const p = { x: 77, y: 213 };
  const back = apply(m, apply(m, p));
  near(back.x, p.x);
  near(back.y, p.y);
});

test("a degenerate line reflects nothing", () => {
  assert.deepEqual(reflection({ a: 0, b: 0, c: 0 }), [1, 0, 0, 1, 0, 0]);
});

/* --------------------------------------------------------------------------
   The fold as a whole.
   -------------------------------------------------------------------------- */
test("the flap and the flat page are the two halves of the sheet", () => {
  const fold = foldAt({ x: 120, y: 300 }, BOX, "br")!;
  near(area(fold.flat) + area(fold.flap), BOX.w * BOX.h, 0.01);
});

test("the flap is the side the held corner is on", () => {
  const fold = foldAt({ x: 120, y: 300 }, BOX, "br")!;
  const corner = cornerPoint("br", BOX);
  // The corner is inside the lifted piece, because the corner is what lifted.
  const s = side(fold.line, corner);
  assert.ok(fold.flap.some((p) => side(fold.line, p) * s >= 0));
  assert.ok(fold.flat.every((p) => side(fold.line, p) * s <= 0.001));
});

test("progress runs from nothing to the whole page", () => {
  const at = cornerPoint("br", BOX);
  assert.equal(foldAt({ x: at.x - 1, y: at.y }, BOX, "br")!.progress > 0, true);
  near(foldAt({ x: at.x - BOX.w, y: at.y }, BOX, "br")!.progress, 0.5);
  near(foldAt({ x: at.x - 2 * BOX.w, y: at.y }, BOX, "br")!.progress, 1);
  // And never past it, however far the finger is dragged.
  assert.equal(foldAt({ x: -5000, y: 0 }, BOX, "br")!.progress, 1);
});

test("a page with no size has no fold", () => {
  assert.equal(foldAt({ x: 10, y: 10 }, { w: 0, h: 0 }, "br"), null);
  assert.equal(foldAt(cornerPoint("br", BOX), BOX, "br"), null, "and neither has a still finger");
});

test("the finger picks up the corner nearest it", () => {
  assert.equal(grabbedCorner({ x: 300, y: 700 }, BOX, true), "br");
  assert.equal(grabbedCorner({ x: 300, y: 100 }, BOX, true), "tr");
  assert.equal(grabbedCorner({ x: 100, y: 700 }, BOX, false), "bl");
  assert.equal(grabbedCorner({ x: 100, y: 100 }, BOX, false), "tl");
});

test("the crease stands square to the drag", () => {
  // Pull straight left along the middle and the crease is vertical.
  const flat = foldAt({ x: 100, y: 400 }, { w: 400, h: 800 }, "tr")!;
  assert.ok(Math.abs(flat.angle) > 0, "a diagonal drag gives a diagonal crease");
  const straight = foldAt({ x: 100, y: 0 }, { w: 400, h: 800 }, "tr")!;
  near(Math.abs(straight.angle % 180), 90);
});

/* --------------------------------------------------------------------------
   What the browser is handed.
   -------------------------------------------------------------------------- */
test("a polygon comes out as CSS the browser will take", () => {
  assert.equal(
    polygonCss([{ x: 0, y: 0 }, { x: 10.005, y: 0 }, { x: 0, y: 20 }]),
    "polygon(0px 0px, 10.01px 0px, 0px 20px)",
  );
  // Fewer than three points is not a shape; hand back something that hides
  // rather than something the browser will refuse and leave unclipped.
  assert.match(polygonCss([{ x: 1, y: 1 }]), /^polygon\(0 0, 0 0, 0 0\)$/);
});

test("a matrix comes out in the order CSS reads it", () => {
  assert.equal(matrixCss([1, 2, 3, 4, 5, 6]), "matrix(1, 2, 3, 4, 5, 6)");
});

/* --------------------------------------------------------------------------
   The shape of a real turn, page by page.
   -------------------------------------------------------------------------- */
test("a forward turn folds more of the page the further it is dragged", () => {
  // The flat part shrinks and the flap grows, monotonically, all the way.
  const home = cornerPoint("br", BOX);
  let flat = Infinity;
  for (const travel of [40, 120, 300, 500, 700, 790]) {
    const f = foldAt({ x: home.x - travel, y: home.y }, BOX, "br")!;
    const now = area(f.flat);
    assert.ok(now < flat, `at ${travel}px the flat part did not shrink`);
    flat = now;
  }
});

test("the crease leans the way the corner is pulled", () => {
  const home = cornerPoint("br", BOX);
  // Pulled straight across, the crease stands upright.
  const level = foldAt({ x: home.x - 300, y: home.y }, BOX, "br")!;
  near(Math.abs(level.angle % 180), 90);
  // Pulled up and across, it leans — which is the diagonal that makes it read
  // as a corner lifting rather than a book closing.
  const lifted = foldAt({ x: home.x - 300, y: home.y - 300 }, BOX, "br")!;
  assert.ok(Math.abs(Math.abs(lifted.angle % 180) - 90) > 20, `${lifted.angle}`);
});
