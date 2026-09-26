/**
 * Lining two scans up before comparing them — on the parts of the face that
 * do not change.
 *
 * A second scan never holds the head exactly as the first did: a degree of
 * nod or a millimetre of shift shows up everywhere as "change". The old
 * comparison only slid one map over the other round the head and up/down,
 * which cannot undo a nod. Here the newer surface is moved in full 3D
 * (point-to-plane ICP) until its FOREHEAD and NOSE BRIDGE sit on the older
 * one's — bone under thin skin, unmoved by fat, water or expression — and is
 * then re-sampled onto the older scan's grid. Cheeks, jaw, chin and neck are
 * compared only after that, so what differs there is them.
 *
 * Face axes, mm; cylinder as in cylmap.ts.
 */

import type { Cylinder } from "./cylmap.ts";
import { apply, icp, identity, PointIndex, type Mat4 } from "./register.ts";

const thetaOf = (c: Cylinder, i: number) => c.thetaMinDeg + i * c.thetaStepDeg;
const yOf = (c: Cylinder, j: number) => c.yMinMm + j * c.yStepMm;

/** Forehead (above the brows, ±40° round) and nose bridge (between the eyes, ±12°). */
export function isAnchor(t: number, y: number, eyeYMm: number): boolean {
  if (y >= eyeYMm + 8 && y <= eyeYMm + 30 && Math.abs(t) <= 40) return true;
  return y >= eyeYMm - 20 && y < eyeYMm + 8 && Math.abs(t) <= 12;
}

function toXYZ(c: Cylinder, i: number, j: number, r: number, axisZ: number): [number, number, number] {
  const t = (thetaOf(c, i) * Math.PI) / 180;
  return [r * Math.sin(t), yOf(c, j), axisZ + r * Math.cos(t)];
}

export interface Aligned {
  /** The newer map, moved onto the older one and re-sampled on its grid. */
  map: Float32Array;
  /** Newer → older, face axes, mm. */
  T: Mat4;
  /** RMS fit on the anchor, mm: how well the unchanging parts agree. */
  anchorRmsMm: number;
}

/**
 * Move `cur` onto `prev` by their anchors. Null when the anchors are too
 * thin to trust (fewer than ~300 cells), in which case compare unaligned.
 */
export function alignOnAnchors(prev: Float32Array, cur: Float32Array, c: Cylinder, axisZ: number, eyeYMm: number): Aligned | null {
  const model = new PointIndex(6);
  model.axisZ = axisZ;
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const r = prev[j * c.width + i]!;
      if (!Number.isFinite(r)) continue;
      // The model includes a margin round the anchor so pairs near its edge find partners.
      if (!isAnchor(thetaOf(c, i), yOf(c, j), eyeYMm) && !isAnchor(thetaOf(c, i), yOf(c, j) - 6, eyeYMm) && !isAnchor(thetaOf(c, i), yOf(c, j) + 6, eyeYMm)) continue;
      model.add(...toXYZ(c, i, j, r, axisZ));
    }
  const src: number[] = [];
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const r = cur[j * c.width + i]!;
      if (Number.isFinite(r) && isAnchor(thetaOf(c, i), yOf(c, j), eyeYMm)) src.push(...toXYZ(c, i, j, r, axisZ));
    }
  if (model.size < 300 || src.length / 3 < 300) return null;
  const fit = icp(model, Float32Array.from(src), identity(), 2000, [8, 6, 4, 3, 2.5, 2]);
  if (!Number.isFinite(fit.rms) || fit.inliers < 0.6) return null;

  // Re-sample the whole moved surface onto the older grid (median per cell).
  const buckets = new Map<number, number[]>();
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const r = cur[j * c.width + i]!;
      if (!Number.isFinite(r)) continue;
      const [x, y, z] = apply(fit.T, ...toXYZ(c, i, j, r, axisZ));
      const dz = z - axisZ;
      const ii = Math.round(((Math.atan2(x, dz) * 180) / Math.PI - c.thetaMinDeg) / c.thetaStepDeg);
      const jj = Math.round((y - c.yMinMm) / c.yStepMm);
      if (ii < 0 || ii >= c.width || jj < 0 || jj >= c.height) continue;
      const k = jj * c.width + ii;
      const list = buckets.get(k);
      const rr = Math.hypot(x, dz);
      if (list) list.push(rr);
      else buckets.set(k, [rr]);
    }
  const map = new Float32Array(cur.length).fill(NaN);
  for (const [k, list] of buckets) {
    list.sort((a, b) => a - b);
    map[k] = list[list.length >> 1]!;
  }
  return { map, T: fit.T, anchorRmsMm: fit.rms };
}
