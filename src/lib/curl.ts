/**
 * Folding a page of paper.
 *
 * The peel in Apple Books is not a picture of a curl, it is a geometric one,
 * and the geometry is short enough to write down: a sheet held at a corner and
 * pulled across itself folds about the PERPENDICULAR BISECTOR of the line from
 * where the corner was to where you have dragged it. Everything else follows.
 * The part of the page on the far side of that line is no longer lying on the
 * table — it is the flap, and what you see of it is its BACK, which is the
 * same paper reflected across the fold.
 *
 * So there are three things to compute and they are all one line each:
 *
 *   - the fold line itself,
 *   - the polygon of the page still lying flat (the page, clipped to one side
 *     of the fold),
 *   - the polygon of the flap and the reflection that puts it where it goes.
 *
 * All of it is plane geometry over a rectangle, which means it can be tested
 * against the arithmetic rather than against a screenshot — and getting it
 * wrong by a degree is the difference between paper and a shattered window.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  w: number;
  h: number;
}

/** A line as ax + by + c = 0. */
export interface Line {
  a: number;
  b: number;
  c: number;
}

/** Positive on one side of the line, negative on the other, zero on it. */
export function side(l: Line, p: Point): number {
  return l.a * p.x + l.b * p.y + l.c;
}

/**
 * The perpendicular bisector of two points.
 *
 * The fold. Every point on it is the same distance from where the corner was
 * and from where you have dragged it to — which is exactly what a crease is.
 */
export function bisector(from: Point, to: Point): Line | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return { a: dx, b: dy, c: -(dx * mx + dy * my) };
}

/**
 * A convex polygon cut down to one side of a line.
 *
 * Sutherland and Hodgman, against a single edge. Six lines of code and the
 * reason the fold can cross a corner of the page without the shape of the
 * paper having to be special-cased: clipping a rectangle by a line gives a
 * triangle, a quadrilateral or a pentagon, and this returns whichever it is.
 */
export function clipToSide(poly: readonly Point[], l: Line, keep: 1 | -1): Point[] {
  if (poly.length === 0) return [];
  const inside = (p: Point) => side(l, p) * keep >= 0;
  const out: Point[] = [];

  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn !== prevIn) {
      // The edge crosses the line: keep the crossing point.
      const sp = side(l, prev);
      const sc = side(l, cur);
      const t = sp / (sp - sc);
      out.push({ x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) });
    }
    if (curIn) out.push(cur);
  }
  return out;
}

/** CSS matrix(a, b, c, d, e, f) — the one the browser wants, in its order. */
export type Matrix = [number, number, number, number, number, number];

/**
 * The reflection across a line, as an affine matrix.
 *
 * For ax + by + c = 0 and s = a² + b², a point moves twice its signed distance
 * along the normal. Written out as a matrix because that is what `transform`
 * takes, and because doing it per-vertex in JavaScript would mean the browser
 * could not composite the flap on the GPU.
 */
export function reflection(l: Line): Matrix {
  const s = l.a * l.a + l.b * l.b;
  if (s === 0) return [1, 0, 0, 1, 0, 0];
  const m11 = 1 - (2 * l.a * l.a) / s;
  const m12 = (-2 * l.a * l.b) / s;
  const m22 = 1 - (2 * l.b * l.b) / s;
  const tx = (-2 * l.a * l.c) / s;
  const ty = (-2 * l.b * l.c) / s;
  // CSS order is column-major: m11, m12, m21, m22, tx, ty — and a reflection
  // is symmetric, so m21 is m12.
  return [m11, m12, m12, m22, tx, ty];
}

export function polygonCss(poly: readonly Point[]): string {
  if (poly.length < 3) return "polygon(0 0, 0 0, 0 0)";
  return `polygon(${poly.map((p) => `${round(p.x)}px ${round(p.y)}px`).join(", ")})`;
}

export function matrixCss(m: Matrix): string {
  return `matrix(${m.map(round).join(", ")})`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Corner = "tr" | "br" | "tl" | "bl";

export function cornerPoint(corner: Corner, box: Box): Point {
  return {
    x: corner === "tr" || corner === "br" ? box.w : 0,
    y: corner === "br" || corner === "bl" ? box.h : 0,
  };
}

/**
 * Which corner a finger on the page is holding.
 *
 * The nearest one on the edge it is turning from, top or bottom by which half
 * of the page the finger is in. This is what makes the crease diagonal: a
 * page held at its middle and pulled straight across would fold about a
 * vertical line, which is a book being closed rather than a page being turned.
 */
export function grabbedCorner(at: Point, box: Box, forward: boolean): Corner {
  const bottom = at.y > box.h / 2;
  if (forward) return bottom ? "br" : "tr";
  return bottom ? "bl" : "tl";
}

export interface Fold {
  /** The page as it still lies flat, in page coordinates. */
  flat: Point[];
  /** The lifted part, BEFORE reflection — what to clip the flap copy to. */
  flap: Point[];
  /** Puts the flap where the fold leaves it. */
  matrix: Matrix;
  /** The crease, for drawing the shadow along it. */
  line: Line;
  /** Degrees, the crease's own angle — 0 is vertical. */
  angle: number;
  /** 0 at rest, 1 when the page has been carried right across. */
  progress: number;
}

/**
 * The whole fold, from where the finger is.
 *
 * Returns null while there is nothing to draw: at rest, and in the one degenerate
 * case where the finger has not moved off the corner and there is no bisector
 * to speak of.
 */
export function foldAt(at: Point, box: Box, corner: Corner): Fold | null {
  if (!(box.w > 0) || !(box.h > 0)) return null;
  const from = cornerPoint(corner, box);
  const line = bisector(from, at);
  if (!line) return null;

  const rect: Point[] = [
    { x: 0, y: 0 },
    { x: box.w, y: 0 },
    { x: box.w, y: box.h },
    { x: 0, y: box.h },
  ];

  // The flap is the side the held corner is on: that is the half that has
  // come up off the table. The flat part is everything else.
  const cornerSide = side(line, from) >= 0 ? 1 : -1;
  const flap = clipToSide(rect, line, cornerSide as 1 | -1);
  const flat = clipToSide(rect, line, -cornerSide as 1 | -1);

  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const travel = Math.hypot(dx, dy);
  return {
    flat,
    flap,
    matrix: reflection(line),
    line,
    // The crease is perpendicular to the drag, so its angle is the drag's
    // turned a quarter.
    angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
    // Fully turned when the corner has been carried twice the page's width:
    // at that point the crease has reached the far edge and there is no page
    // left lying flat.
    progress: Math.min(1, travel / (2 * box.w)),
  };
}
