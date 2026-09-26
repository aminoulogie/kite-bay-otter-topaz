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
/**
 * Neighbouring vertices further apart than this in 3D are a gap in the scan,
 * not a surface — per 2 cells of grid step. Judged on the real edge length
 * rather than the difference in radius: the sides of the nose tip and the
 * underside of the nose are steep but continuous skin, and a radius rule cut
 * them out as holes. A true break (ear off the head, chin over the neck) is
 * several times longer.
 */
const MAX_EDGE_MM = 14;

/**
 * A hole is a dropout when data ENCLOSES it — a finite cell on both sides
 * along the row AND along the column — and the tighter of those two brackets
 * is no wider than this. Enclosure is what separates the nostril or lash line
 * the depth camera lost, which has skin all round it, from the place the
 * sweep never reached, which is open to the edge of the scan however narrow
 * it looks in one direction.
 */
const FILL_SPAN_MM = 20;

/** A bracket wider than this is not evidence of anything, whichever way it runs. */
const ENCLOSE_SPAN_MM = 70;

/** A distance in mm as cells of this grid, each way. */
function cellsFor(c: Cylinder, mm: number): { cols: number; rows: number } {
  // Columns are an angle, so their width depends on the radius; a head is
  // about 100 mm from the axis, which is close enough to size a hole by.
  const colMm = (100 * c.thetaStepDeg * Math.PI) / 180;
  return { cols: Math.max(1, Math.round(mm / colMm)), rows: Math.max(1, Math.round(mm / c.yStepMm)) };
}

/**
 * Missing cells that are enclosed by data get it back, by interpolation
 * across the hole, with the tighter bracket weighted more heavily — across a
 * lash line that is the four millimetres of cheek either side of it, not the
 * forehead and the jaw thirty millimetres up and down.
 *
 * Read from the ORIGINAL map, never from what an earlier pass filled in, so
 * a region the sweep never reached cannot close a cell at a time from its
 * edges: what was not seen stays a hole rather than becoming made-up surface.
 */
function fillHoles(map: Float32Array, c: Cylinder): Float32Array {
  const W = c.width, H = c.height;
  const span = cellsFor(c, FILL_SPAN_MM);
  const reach = cellsFor(c, ENCLOSE_SPAN_MM);
  const out = map.slice();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (Number.isFinite(map[j * W + i]!)) continue;
      // The nearest data each way, and how many cells off it is.
      const walk = (di: number, dj: number, limit: number) => {
        for (let s = 1; s <= limit; s++) {
          const ii = i + di * s, jj = j + dj * s;
          if (ii < 0 || ii >= W || jj < 0 || jj >= H) return null;
          const v = map[jj * W + ii]!;
          if (Number.isFinite(v)) return { v, s };
        }
        return null;
      };
      const across = ([di, dj, limit]: readonly [number, number, number]) => {
        const lo = walk(-di, -dj, limit);
        const hi = walk(di, dj, limit);
        if (!lo || !hi) return null;
        return { v: (lo.v * hi.s + hi.v * lo.s) / (lo.s + hi.s), cells: lo.s + hi.s };
      };
      const row = across([1, 0, reach.cols] as const);
      const col = across([0, 1, reach.rows] as const);
      // Enclosed both ways, or it is the edge of the scan, not a dropout.
      if (!row || !col) continue;
      const rowMm = (row.cells * FILL_SPAN_MM) / span.cols;
      const colMm = (col.cells * FILL_SPAN_MM) / span.rows;
      if (Math.min(rowMm, colMm) > FILL_SPAN_MM) continue;
      const wr = 1 / rowMm, wc = 1 / colMm;
      out[j * W + i] = (row.v * wr + col.v * wc) / (wr + wc);
    }
  }
  return out;
}

/**
 * For DISPLAY only — the numbers are always read from the raw surface. Holes
 * the depth camera dropped are closed by `fillHoles`, then every cell is
 * averaged with the neighbours that sit within 3 mm of it, so the model reads
 * as skin rather than gravel without rounding off real edges like the jaw
 * line.
 */
export function tidy(map: Float32Array, c: Cylinder): Float32Array {
  const W = c.width, H = c.height;
  const filled = fillHoles(map, c);
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
  const maxEdge = (MAX_EDGE_MM * step) / 2;
  const near = (a: number, b: number) => {
    const p = index[a]! * 3, q = index[b]! * 3;
    return Math.hypot(pos[p]! - pos[q]!, pos[p + 1]! - pos[q + 1]!, pos[p + 2]! - pos[q + 2]!) < maxEdge;
  };
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
    indices: dropIslands(Uint32Array.from(tri), pos.length / 3),
    change: Float32Array.from(change),
  };
}

/**
 * Triangles smaller than this, all joined together, are not surface: they are
 * the speckle left where the sweep caught a few scattered cells — under the
 * chin and down the neck, mostly — and they render as a cloud of loose
 * shards hanging off the model.
 */
const MIN_ISLAND_TRIS = 40;

/**
 * Keep only the connected pieces of the surface worth drawing. Vertices are
 * joined through the triangles that share them, each piece is counted, and
 * the specks are dropped; the vertices stay where they are, so a vertex's
 * index still means the same cell.
 */
export function dropIslands(indices: Uint32Array, vertices: number): Uint32Array {
  if (!indices.length) return indices;
  const parent = new Int32Array(vertices);
  for (let i = 0; i < vertices; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r]! !== r) r = parent[r]!;
    while (parent[x]! !== r) { const up = parent[x]!; parent[x] = r; x = up; }
    return r;
  };
  const join = (x: number, y: number) => {
    const a = find(x), b = find(y);
    if (a !== b) parent[a] = b;
  };
  for (let t = 0; t < indices.length; t += 3) {
    join(indices[t]!, indices[t + 1]!);
    join(indices[t + 1]!, indices[t + 2]!);
  }
  const size = new Map<number, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const r = find(indices[t]!);
    size.set(r, (size.get(r) ?? 0) + 1);
  }
  // Nothing big enough means the whole scan is sparse; better a speckled
  // model than an empty box, so keep the largest piece there is.
  const biggest = Math.max(...size.values());
  const floor = Math.min(MIN_ISLAND_TRIS, biggest);
  const out: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    if ((size.get(find(indices[t]!)) ?? 0) < floor) continue;
    out.push(indices[t]!, indices[t + 1]!, indices[t + 2]!);
  }
  return Uint32Array.from(out);
}
