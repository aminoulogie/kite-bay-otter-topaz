/**
 * Symmetry from the RAW TrueDepth depth, not the fitted mesh.
 *
 * The native scan averages every depth pixel from many frames onto a grid in
 * the face's own axes (x to the viewer's right = the person's LEFT, y up), so
 * each cell holds how far forward the real surface is there, in mm. Comparing
 * each cell with its mirror across the midline measures true left/right
 * difference — which the fitted mesh may not be able to show.
 *
 * Two alignment errors would otherwise read as asymmetry, so both are removed:
 *
 * - The midline: searched over ±6 mm rather than taken as x = 0.
 * - A residual head turn: a face turned slightly relative to ARKit's estimate
 *   makes one side read uniformly further forward in proportion to distance
 *   from the midline (d ≈ a·x). That linear term is fitted and subtracted;
 *   what remains is shape.
 */

export interface DepthGrid {
  z: Float32Array;
  width: number;
  height: number;
  cellMm: number;
  /** x, y of the grid's lower-left corner, mm. */
  originMm: [number, number];
}

export interface DepthSymmetry {
  /** RMS of how far each side departs from the mirrored other side, mm. */
  rmsMm: number;
  p95Mm: number;
  /** Per third of the face (by height). */
  byThird: { upper: number; middle: number; lower: number };
  /**
   * Person's left minus right, mean mm per third: positive means the left
   * side of the face sits further forward there.
   */
  leftMinusRightMm: { upper: number; middle: number; lower: number };
  midlineMm: number;
  /** Degrees of residual head turn that was removed. */
  residualYawDeg: number;
  pairs: number;
}

const MIN_PAIRS = 300;
/** Beyond this the pair is an edge artefact (hair, ear, silhouette), not face. */
const OUTLIER_MM = 12;
/** Cells this close to the midline pair with themselves and say nothing. */
const CENTRE_GAP_MM = 3;

interface Pair {
  dx: number; // distance from midline, mm (> 0)
  y: number;
  d: number; // z(left side) − z(right side)
}

function pairsFor(g: DepthGrid, midline: number): Pair[] {
  const { z, width: W, height: H, cellMm: c, originMm: [x0, y0] } = g;
  const out: Pair[] = [];
  for (let j = 0; j < H; j++) {
    const y = y0 + (j + 0.5) * c;
    for (let i = 0; i < W; i++) {
      const a = z[j * W + i]!;
      if (!Number.isFinite(a)) continue;
      const x = x0 + (i + 0.5) * c;
      const dx = x - midline;
      if (dx < CENTRE_GAP_MM) continue;
      const mi = Math.round((midline - dx - x0) / c - 0.5);
      if (mi < 0 || mi >= W) continue;
      const b = z[j * W + mi]!;
      if (!Number.isFinite(b)) continue;
      out.push({ dx, y, d: a - b });
    }
  }
  return out;
}

/** Fit d ≈ k·dx and return the residuals with outliers dropped. */
function detilt(pairs: Pair[]): { k: number; kept: (Pair & { r: number })[] } {
  let k = 0;
  let kept = pairs.map((p) => ({ ...p, r: p.d }));
  for (let pass = 0; pass < 2; pass++) {
    let num = 0;
    let den = 0;
    for (const p of kept) {
      num += p.d * p.dx;
      den += p.dx * p.dx;
    }
    k = den ? num / den : 0;
    kept = pairs.map((p) => ({ ...p, r: p.d - k * p.dx })).filter((p) => Math.abs(p.r) <= OUTLIER_MM);
  }
  return { k, kept };
}

export function depthSymmetry(g: DepthGrid): DepthSymmetry | null {
  let best: { m: number; k: number; kept: (Pair & { r: number })[]; score: number } | null = null;
  for (let m = -6; m <= 6.0001; m += 0.5) {
    const pairs = pairsFor(g, m);
    if (pairs.length < MIN_PAIRS) continue;
    const { k, kept } = detilt(pairs);
    if (kept.length < MIN_PAIRS) continue;
    const score = kept.reduce((s, p) => s + p.r * p.r, 0) / kept.length;
    if (!best || score < best.score) best = { m, k, kept, score };
  }
  if (!best) return null;

  const kept = best.kept;
  // Each side departs from the other's mirror by half the difference.
  const dev = kept.map((p) => Math.abs(p.r) / 2).sort((a, b) => a - b);
  const rms = Math.sqrt(kept.reduce((s, p) => s + (p.r / 2) ** 2, 0) / kept.length);

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of kept) {
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
  }
  const span = yMax - yMin || 1;
  const band = (p: Pair) => {
    const t = (p.y - yMin) / span;
    return t > 2 / 3 ? "upper" : t > 1 / 3 ? "middle" : "lower";
  };
  const acc = { upper: [0, 0, 0], middle: [0, 0, 0], lower: [0, 0, 0] } as Record<string, [number, number, number]>;
  for (const p of kept) {
    const a = acc[band(p)]!;
    a[0] += (p.r / 2) ** 2;
    a[1] += p.r; // x > midline is the person's LEFT, so r = left − right
    a[2] += 1;
  }
  const rmsOf = (k: string) => (acc[k]![2] ? Math.sqrt(acc[k]![0] / acc[k]![2]) : 0);
  const meanOf = (k: string) => (acc[k]![2] ? acc[k]![1] / acc[k]![2] : 0);

  return {
    rmsMm: rms,
    p95Mm: dev[Math.floor(0.95 * (dev.length - 1))]!,
    byThird: { upper: rmsOf("upper"), middle: rmsOf("middle"), lower: rmsOf("lower") },
    leftMinusRightMm: { upper: meanOf("upper"), middle: meanOf("middle"), lower: meanOf("lower") },
    midlineMm: best.m,
    // d = k·dx comes from a turn θ with d ≈ 2·dx·tanθ.
    residualYawDeg: (Math.atan(best.k / 2) * 180) / Math.PI,
    pairs: kept.length,
  };
}
