/**
 * Measurements from a TrueDepth face mesh.
 *
 * Input is ARKit's fitted face mesh, averaged over a steady neutral burst, in
 * MILLIMETRES in the face's own axes: x to the viewer's right, y up, z out of
 * the face. Unlike the 2D pipeline there is no perspective to undo and no
 * scale to guess — distances here are real.
 *
 * Two things this is honest about:
 *
 * - The mesh is a MODEL fitted to depth, not a raw scan. It is very
 *   repeatable, which is what progress tracking needs, but smooths fine
 *   detail toward an average face.
 * - If ARKit fits the identity shape symmetrically, the mesh cannot show real
 *   left/right asymmetry and symmetry will read near zero. `symmetry3d`
 *   reports whatever the mesh holds; a suspiciously tiny figure on a real face
 *   is the sign that symmetry must come from the raw depth map instead.
 */

export type Vec3 = [number, number, number];

export function vertexCount(v: Float32Array): number {
  return Math.floor(v.length / 3);
}

function at(v: Float32Array, i: number): Vec3 {
  return [v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!];
}

/**
 * For each vertex, the vertex nearest its mirror image across the midline.
 *
 * The midline is found, not assumed: start at the centre of mass, pair each
 * point with the one nearest its reflection, move the plane to the mean
 * midpoint of those pairs, and pair again. ARKit's
 * face axes sit close to the midline but a fit can be off by a millimetre or
 * two, and that offset would otherwise read as asymmetry.
 */
export function mirrorPairs(v: Float32Array): { pairs: Int32Array; midlineX: number } {
  const n = vertexCount(v);
  // Start from the centre of mass: on a roughly symmetric face it sits on the
  // midline, whereas starting from x = 0 pairs the wrong points whenever the
  // fit is off-centre, and the refinement then converges on the wrong plane.
  let mid = 0;
  for (let i = 0; i < n; i++) mid += v[i * 3]!;
  mid = n ? mid / n : 0;
  let pairs = new Int32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    pairs = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const rx = 2 * mid - v[i * 3]!;
      const ry = v[i * 3 + 1]!;
      const rz = v[i * 3 + 2]!;
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < n; j++) {
        const dx = v[j * 3]! - rx;
        const dy = v[j * 3 + 1]! - ry;
        const dz = v[j * 3 + 2]! - rz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      pairs[i] = best;
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += (v[i * 3]! + v[pairs[i]! * 3]!) / 2;
    mid = n ? sum / n : 0;
  }
  return { pairs, midlineX: mid };
}

export interface Symmetry3D {
  /** Root-mean-square mismatch between each point and its mirrored partner, mm. */
  rmsMm: number;
  /** 95th percentile mismatch, mm — the worst areas, without single-point noise. */
  p95Mm: number;
  /** RMS per vertical third of the mesh (upper / middle / lower), mm. */
  byThird: { upper: number; middle: number; lower: number };
  midlineOffsetMm: number;
}

export function symmetry3d(v: Float32Array): Symmetry3D | null {
  const n = vertexCount(v);
  if (n < 10) return null;
  const { pairs, midlineX } = mirrorPairs(v);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minY = Math.min(minY, v[i * 3 + 1]!);
    maxY = Math.max(maxY, v[i * 3 + 1]!);
  }
  const span = maxY - minY || 1;
  const errs: number[] = [];
  const thirds = { upper: [] as number[], middle: [] as number[], lower: [] as number[] };
  for (let i = 0; i < n; i++) {
    const [x, y, z] = at(v, i);
    const [px, py, pz] = at(v, pairs[i]!);
    const e = Math.hypot(2 * midlineX - x - px, y - py, z - pz);
    errs.push(e);
    const t = (y - minY) / span;
    (t > 2 / 3 ? thirds.upper : t > 1 / 3 ? thirds.middle : thirds.lower).push(e);
  }
  const rms = (a: number[]) => (a.length ? Math.sqrt(a.reduce((s, e) => s + e * e, 0) / a.length) : 0);
  const sorted = [...errs].sort((a, b) => a - b);
  return {
    rmsMm: rms(errs),
    p95Mm: sorted[Math.floor(0.95 * (sorted.length - 1))]!,
    byThird: { upper: rms(thirds.upper), middle: rms(thirds.middle), lower: rms(thirds.lower) },
    midlineOffsetMm: midlineX,
  };
}

export interface Extents3D {
  /** Widest left-right span of the mesh, mm (cheekbone region on most faces). */
  faceWidthMm: number;
  /** Top of the mesh to the chin, mm. The mesh stops on the forehead, so this is not hairline to chin. */
  meshHeightMm: number;
  /** Left-right span of the lowest quarter of the mesh, mm — a jaw-width proxy. */
  lowerWidthMm: number;
  /** Lower width over face width. */
  lowerToFace: number;
}

export function extents3d(v: Float32Array): Extents3D | null {
  const n = vertexCount(v);
  if (n < 10) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = v[i * 3]!, y = v[i * 3 + 1]!;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const cut = minY + (maxY - minY) * 0.25;
  let lMin = Infinity, lMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (v[i * 3 + 1]! > cut) continue;
    lMin = Math.min(lMin, v[i * 3]!);
    lMax = Math.max(lMax, v[i * 3]!);
  }
  const faceWidthMm = maxX - minX;
  const lowerWidthMm = Number.isFinite(lMin) ? lMax - lMin : 0;
  return {
    faceWidthMm,
    meshHeightMm: maxY - minY,
    lowerWidthMm,
    lowerToFace: faceWidthMm ? lowerWidthMm / faceWidthMm : 0,
  };
}

export function distanceMm(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Base64 of little-endian Float32 values → Float32Array. */
export function decodeFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}
