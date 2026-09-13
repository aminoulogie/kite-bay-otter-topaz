/**
 * How big a stored copy of an image should be.
 *
 * This exists because the answer used to be "a square", and for a book cover
 * that is three separate losses stacked on top of each other:
 *
 *   1. A 500x800 cover was centre-cropped to 500x500 — the top and bottom of
 *      the artwork thrown away before anything else happened.
 *   2. That 500px square was UPSCALED to 1080x1080, inventing 4x the pixels
 *      and none of the detail.
 *   3. The shelf then drew it into a 1:1.6 box, cropping the sides back off.
 *
 * What reached the screen came from roughly 312x500 of the original, resampled
 * twice with an upscale in the middle. Hence "blurry and pixelated".
 *
 * The rule instead: keep the shape, fit the LONG edge to the budget, and never
 * scale up. Never scaling up is the half that matters — enlarging a small
 * source cannot add detail, and it costs bytes and a resample to not add it.
 * Cropping is left to CSS, which does it at draw time against the box the
 * image is actually in, and can be changed later without the pixels having
 * already been destroyed.
 */

export interface Size {
  width: number;
  height: number;
}

/** The size to store at, given a source and a long-edge budget. */
export function fitWithin(source: Size, budget: number): Size {
  const w = Math.floor(Number(source?.width) || 0);
  const h = Math.floor(Number(source?.height) || 0);
  const cap = Math.floor(Number(budget) || 0);
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  if (cap <= 0) return { width: w, height: h };

  const longest = Math.max(w, h);
  // Never above 1: a source smaller than the budget is stored as it is.
  const scale = Math.min(1, cap / longest);
  return {
    // At least one pixel each way, or a very wide, very short image rounds to
    // a zero-height canvas and throws rather than storing something small.
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Whether a stored image is square, within a tolerance. */
export function isSquarish(size: Size, tolerance = 0.04): boolean {
  const w = Number(size?.width) || 0;
  const h = Number(size?.height) || 0;
  if (w <= 0 || h <= 0) return false;
  return Math.abs(w / h - 1) <= tolerance;
}
