/**
 * Placing an imported photo on the capture guides.
 *
 * A camera-roll photo was taken wherever, at whatever size and tilt. Before it
 * is measured it is laid onto the same frame the live capture uses — eyes
 * level, at the height the guides expect, the face the size a good capture
 * fills — so an imported scan is framed like one taken in the app. First
 * automatically from the landmarks, then by hand.
 *
 * A placement is a similarity transform from image pixels to frame pixels:
 *
 *   frame = [a -b; b a] · image + [tx, ty]      where a = s·cosθ, b = s·sinθ
 *
 * which is exactly canvas setTransform(a, b, -b, a, tx, ty).
 */

export interface Pt2 {
  x: number;
  y: number;
}

export interface Placement {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/** Where a good capture puts the eyes and how much of the height the face takes. */
export const EYE_LINE_Y = 0.4;
export const FACE_HEIGHT_FRAC = 0.46;

export const IDENTITY: Placement = { a: 1, b: 0, tx: 0, ty: 0 };

export function apply(p: Placement, q: Pt2): Pt2 {
  return { x: p.a * q.x - p.b * q.y + p.tx, y: p.b * q.x + p.a * q.y + p.ty };
}

export function scaleOf(p: Placement): number {
  return Math.hypot(p.a, p.b);
}

export function angleOf(p: Placement): number {
  return Math.atan2(p.b, p.a);
}

/**
 * The image fitted inside the frame, centred — the starting point when no
 * face can be found to align on.
 */
export function fitPlacement(imgW: number, imgH: number, boxW: number, boxH: number): Placement {
  const s = Math.min(boxW / imgW, boxH / imgH);
  return { a: s, b: 0, tx: (boxW - imgW * s) / 2, ty: (boxH - imgH * s) / 2 };
}

/**
 * Eyes level, their midpoint on the centre line at the guides' eye height,
 * and the face (brow to chin) filling the height a good capture does.
 *
 * All points in image pixels. The two eyes may come in either order.
 */
export function autoPlacement(
  eyeA: Pt2,
  eyeB: Pt2,
  brow: Pt2,
  chin: Pt2,
  boxW: number,
  boxH: number,
): Placement | null {
  const [l, r] = eyeA.x <= eyeB.x ? [eyeA, eyeB] : [eyeB, eyeA];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y);
  if (!(faceH > 0) || !(boxW > 0) || !(boxH > 0)) return null;
  const tilt = Math.atan2(r.y - l.y, r.x - l.x);
  const s = (FACE_HEIGHT_FRAC * boxH) / faceH;
  const theta = -tilt;
  const a = s * Math.cos(theta);
  const b = s * Math.sin(theta);
  const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
  const rotated = { x: a * mid.x - b * mid.y, y: b * mid.x + a * mid.y };
  return { a, b, tx: boxW / 2 - rotated.x, ty: EYE_LINE_Y * boxH - rotated.y };
}

/**
 * A gesture step, applied about a pivot in FRAME coordinates: move by
 * (dx, dy), then scale by `ds` and turn by `dTheta` around the pivot — the
 * point between the two fingers, so the photo grows and turns under them
 * rather than around its corner.
 */
export function gesture(
  p: Placement,
  pivot: Pt2,
  dx: number,
  dy: number,
  ds = 1,
  dTheta = 0,
): Placement {
  const ca = ds * Math.cos(dTheta);
  const cb = ds * Math.sin(dTheta);
  // New = T(pivot + d) · R·S · T(-pivot) · Old
  const a = ca * p.a - cb * p.b;
  const b = cb * p.a + ca * p.b;
  const ox = p.tx - pivot.x;
  const oy = p.ty - pivot.y;
  return {
    a,
    b,
    tx: ca * ox - cb * oy + pivot.x + dx,
    ty: cb * ox + ca * oy + pivot.y + dy,
  };
}

/** CSS matrix() for showing the placement at `k` screen pixels per frame pixel. */
export function cssMatrix(p: Placement, k: number): string {
  return `matrix(${p.a * k}, ${p.b * k}, ${-p.b * k}, ${p.a * k}, ${p.tx * k}, ${p.ty * k})`;
}
