/**
 * A viewable 3D model from a sweep's cylinder: every other cell becomes a
 * vertex, neighbouring cells are joined into triangles where the surface is
 * continuous, and each vertex can be coloured by how far it moved since an
 * earlier scan — green fuller, red less, grey within the scan's noise.
 *
 * Face axes, mm: x = the person's LEFT, y up, z out of the face.
 */

import type { Cylinder } from "./cylmap.ts";

export interface MeshData {
  positions: Float32Array;
  /** RGB 0–1 per vertex: skin grey, or the heatmap. */
  colors: Float32Array;
  indices: Uint32Array;
  /** Per-vertex change in mm (NaN where there is no earlier scan to compare). */
  change: Float32Array;
}

const BASE: [number, number, number] = [0.72, 0.74, 0.78];
/** Neighbouring cells further apart than this are a gap in the scan, not a surface. */
const MAX_JUMP_MM = 8;

/**
 * For DISPLAY only — the numbers are always read from the raw surface. Small
 * holes (a cell missing with most of its 5×5 neighbours present) are filled
 * with their mean, then every cell is averaged with the neighbours that sit
 * within 3 mm of it, so the model reads as skin rather than gravel without
 * rounding off real edges like the jaw line.
 */
export function tidy(map: Float32Array, c: Cylinder): Float32Array {
  const W = c.width, H = c.height;
  const filled = map.slice();
  for (let j = 2; j < H - 2; j++)
    for (let i = 2; i < W - 2; i++) {
      if (Number.isFinite(map[j * W + i]!)) continue;
      let s = 0, n = 0;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const v = map[(j + dj) * W + i + di]!;
          if (Number.isFinite(v)) { s += v; n++; }
        }
      if (n >= 14) filled[j * W + i] = s / n;
    }
  const out = filled.slice();
  for (let j = 1; j < H - 1; j++)
    for (let i = 1; i < W - 1; i++) {
      const v = filled[j * W + i]!;
      if (!Number.isFinite(v)) continue;
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const u = filled[(j + dj) * W + i + di]!;
          if (Number.isFinite(u) && Math.abs(u - v) < 3) { s += u; n++; }
        }
      out[j * W + i] = s / n;
    }
  return out;
}

/** Colour for a change: grey within noise, then towards green (out) or red (in) by 3 mm. */
export function heatColor(changeMm: number, noiseMm: number): [number, number, number] {
  if (!Number.isFinite(changeMm) || Math.abs(changeMm) <= noiseMm) return BASE;
  const k = Math.min(1, (Math.abs(changeMm) - noiseMm) / 3);
  const to: [number, number, number] = changeMm > 0 ? [0.2, 0.85, 0.35] : [0.95, 0.25, 0.25];
  return [BASE[0] + (to[0] - BASE[0]) * k, BASE[1] + (to[1] - BASE[1]) * k, BASE[2] + (to[2] - BASE[2]) * k];
}

/**
 * @param step   Take every `step`-th cell each way (2 → 2° × 3 mm): plenty for a phone.
 * @param before Earlier merged map, already the same grid, with the alignment
 *               compareCyl found; colours the heatmap.
 */
export function buildMesh(
  map: Float32Array,
  c: Cylinder,
  axisZ: number,
  step = 2,
  before?: {
    map: Float32Array;
    di: number;
    dj: number;
    meanMm: number;
    noiseMm: number;
    /** Cells trusted enough to colour (e.g. both halves of the scan agree); others stay grey. */
    reliable?: (cell: number) => boolean;
  },
  /** Rows below this are chest and shoulders: not what the model is for. */
  minYMm = -185,
): MeshData {
  const cols = Math.floor((c.width - 1) / step) + 1;
  const rows = Math.floor((c.height - 1) / step) + 1;
  const index = new Int32Array(cols * rows).fill(-1);
  const radius = new Float32Array(cols * rows).fill(NaN);
  const pos: number[] = [];
  const col: number[] = [];
  const change: number[] = [];
  for (let jj = 0; jj < rows; jj++) {
    for (let ii = 0; ii < cols; ii++) {
      const i = ii * step;
      const j = jj * step;
      const r = map[j * c.width + i]!;
      if (!Number.isFinite(r) || c.yMinMm + j * c.yStepMm < minYMm) continue;
      const t = ((c.thetaMinDeg + i * c.thetaStepDeg) * Math.PI) / 180;
      index[jj * cols + ii] = pos.length / 3;
      radius[jj * cols + ii] = r;
      pos.push(r * Math.sin(t), c.yMinMm + j * c.yStepMm, axisZ + r * Math.cos(t));
      let d = NaN;
      if (before) {
        // compareCyl slid the NEWER map by (di, dj) to meet the older one.
        const pi = i - before.di;
        const pj = j - before.dj;
        if (pi >= 0 && pi < c.width && pj >= 0 && pj < c.height) {
          const old = before.map[pj * c.width + pi]!;
          if (Number.isFinite(old) && (before.reliable?.(j * c.width + i) ?? true)) d = r - old - before.meanMm;
        }
      }
      change.push(d);
      col.push(...(before ? heatColor(d, before.noiseMm) : BASE));
    }
  }
  const tri: number[] = [];
  const near = (a: number, b: number) => Math.abs(radius[a]! - radius[b]!) < MAX_JUMP_MM;
  for (let jj = 0; jj < rows - 1; jj++) {
    for (let ii = 0; ii < cols - 1; ii++) {
      const a = jj * cols + ii, b = a + 1, d = a + cols, e = d + 1;
      const ia = index[a]!, ib = index[b]!, id = index[d]!, ie = index[e]!;
      // Outward-facing winding (θ grows towards the person's left, y up).
      if (ia >= 0 && ib >= 0 && ie >= 0 && near(a, b) && near(b, e) && near(a, e)) tri.push(ia, ie, ib);
      if (ia >= 0 && ie >= 0 && id >= 0 && near(a, e) && near(e, d) && near(a, d)) tri.push(ia, id, ie);
    }
  }
  return {
    positions: Float32Array.from(pos),
    colors: Float32Array.from(col),
    indices: Uint32Array.from(tri),
    change: Float32Array.from(change),
  };
}
