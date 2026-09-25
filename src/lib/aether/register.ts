/**
 * Placing side-on depth frames onto the face model.
 *
 * Past ~50° of turn ARKit loses the face, so the full scan's side frames come
 * without a pose. Each is placed by matching its shape to the model already
 * built — iterative closest point (ICP): pair every frame point with the
 * nearest model point, find the rigid move that best overlays the pairs
 * (Horn's closed-form quaternion solution), apply it, repeat with a tighter
 * pairing distance. Turn frames are chained, each starting from the last
 * one's pose and each adding its points to the model, so the model grows
 * round the head as the body turns. Hold frames, standing still side-on,
 * are the ones that get measured.
 *
 * Units: millimetres throughout. Matrices: 4×4 rigid, column-major (as ARKit).
 */

export type Mat4 = Float64Array;

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}

export function apply(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

/** From a column-major array in METRES (ARKit) to a Mat4 in millimetres. */
export function fromArkit(a: number[]): Mat4 {
  const m = Float64Array.from(a);
  m[12] = m[12]! * 1000;
  m[13] = m[13]! * 1000;
  m[14] = m[14]! * 1000;
  return m;
}

export function rotationDeg(m: Mat4): number {
  const tr = m[0]! + m[5]! + m[10]!;
  return (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
}

/** Eigenvector of the largest eigenvalue of a symmetric 4×4 (cyclic Jacobi). */
function topEigenvector(a: number[][]): number[] {
  const A = a.map((r) => [...r]);
  const V: number[][] = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += A[p]![q]! ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 4; p++)
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(A[p]![q]!) < 1e-15) continue;
        const theta = (A[q]![q]! - A[p]![p]!) / (2 * A[p]![q]!);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = A[k]![p]!;
          const akq = A[k]![q]!;
          A[k]![p] = c * akp - s * akq;
          A[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = A[p]![k]!;
          const aqk = A[q]![k]!;
          A[p]![k] = c * apk - s * aqk;
          A[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = V[k]![p]!;
          const vkq = V[k]![q]!;
          V[k]![p] = c * vkp - s * vkq;
          V[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (A[i]![i]! > A[best]![best]!) best = i;
  return [V[0]![best]!, V[1]![best]!, V[2]![best]!, V[3]![best]!];
}

/**
 * The rigid move that best carries `src` onto `dst` (least squares), by
 * Horn's quaternion method. Flat xyz arrays of equal length.
 */
export function hornFit(src: ArrayLike<number>, dst: ArrayLike<number>): Mat4 {
  const n = Math.floor(src.length / 3);
  let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
  for (let i = 0; i < n; i++) {
    px += src[i * 3]!; py += src[i * 3 + 1]!; pz += src[i * 3 + 2]!;
    qx += dst[i * 3]!; qy += dst[i * 3 + 1]!; qz += dst[i * 3 + 2]!;
  }
  px /= n; py /= n; pz /= n; qx /= n; qy /= n; qz /= n;
  let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i * 3]! - px, ay = src[i * 3 + 1]! - py, az = src[i * 3 + 2]! - pz;
    const bx = dst[i * 3]! - qx, by = dst[i * 3 + 1]! - qy, bz = dst[i * 3 + 2]! - qz;
    sxx += ax * bx; sxy += ax * by; sxz += ax * bz;
    syx += ay * bx; syy += ay * by; syz += ay * bz;
    szx += az * bx; szy += az * by; szz += az * bz;
  }
  const N = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const [w, x, y, z] = topEigenvector(N) as [number, number, number, number];
  const m = identity();
  m[0] = w * w + x * x - y * y - z * z;
  m[1] = 2 * (x * y + w * z);
  m[2] = 2 * (x * z - w * y);
  m[4] = 2 * (x * y - w * z);
  m[5] = w * w - x * x + y * y - z * z;
  m[6] = 2 * (y * z + w * x);
  m[8] = 2 * (x * z + w * y);
  m[9] = 2 * (y * z - w * x);
  m[10] = w * w - x * x - y * y + z * z;
  const [rx, ry, rz] = apply(m, px, py, pz);
  m[12] = qx - rx;
  m[13] = qy - ry;
  m[14] = qz - rz;
  return m;
}

/** Eigenvector of the smallest eigenvalue of a symmetric 3×3 (Jacobi). */
function smallestEigenvector3(a: number[][]): number[] {
  const A = a.map((r) => [...r]);
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    const off = A[0]![1]! ** 2 + A[0]![2]! ** 2 + A[1]![2]! ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++)
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(A[p]![q]!) < 1e-15) continue;
        const theta = (A[q]![q]! - A[p]![p]!) / (2 * A[p]![q]!);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = A[k]![p]!, akq = A[k]![q]!;
          A[k]![p] = c * akp - s * akq;
          A[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = A[p]![k]!, aqk = A[q]![k]!;
          A[p]![k] = c * apk - s * aqk;
          A[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = V[k]![p]!, vkq = V[k]![q]!;
          V[k]![p] = c * vkp - s * vkq;
          V[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  let best = 0;
  for (let i = 1; i < 3; i++) if (A[i]![i]! < A[best]![best]!) best = i;
  return [V[0]![best]!, V[1]![best]!, V[2]![best]!];
}

/** Solve a small dense system (Gaussian elimination, partial pivoting); null if singular. */
function solve(M: number[][], b: number[]): number[] | null {
  const n = b.length;
  const A = M.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12) return null;
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k <= n; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= A[r]![k]! * x[k]!;
    x[r] = s / A[r]![r]!;
  }
  return x;
}

/** Rotation by the small-angle vector (a, b, c) exactly (Rodrigues), plus a translation. */
function rigidFrom(a: number, b: number, c: number, tx: number, ty: number, tz: number): Mat4 {
  const th = Math.hypot(a, b, c);
  const m = identity();
  if (th > 1e-12) {
    const kx = a / th, ky = b / th, kz = c / th;
    const co = Math.cos(th), si = Math.sin(th), v = 1 - co;
    m[0] = co + kx * kx * v; m[4] = kx * ky * v - kz * si; m[8] = kx * kz * v + ky * si;
    m[1] = ky * kx * v + kz * si; m[5] = co + ky * ky * v; m[9] = ky * kz * v - kx * si;
    m[2] = kz * kx * v - ky * si; m[6] = kz * ky * v + kx * si; m[10] = co + kz * kz * v;
  }
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

/** Nearest-neighbour lookup on a voxel hash. Points in mm. */
export class PointIndex {
  private readonly cells = new Map<number, number[]>();
  readonly xyz: number[] = [];
  private readonly cell: number;

  constructor(cell = 8) {
    this.cell = cell;
  }

  private key(ix: number, iy: number, iz: number): number {
    return ((ix + 1024) * 2048 + (iy + 1024)) * 2048 + (iz + 1024);
  }

  add(x: number, y: number, z: number): void {
    const i = this.xyz.length / 3;
    this.xyz.push(x, y, z);
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell), Math.floor(z / this.cell));
    const list = this.cells.get(k);
    if (list) list.push(i);
    else this.cells.set(k, [i]);
  }

  get size(): number {
    return this.xyz.length / 3;
  }

  private normals: (Float64Array | null)[] = [];
  /** Where "outward" points from: the head's vertical axis at this z. */
  axisZ = -60;

  /**
   * Surface normal at point i: the least-spread direction of its neighbours
   * within 7 mm (PCA), turned to face away from the head's axis. Cached.
   */
  normal(i: number): Float64Array | null {
    if (i < this.normals.length && this.normals[i] !== undefined) return this.normals[i]!;
    const x = this.xyz[i * 3]!, y = this.xyz[i * 3 + 1]!, z = this.xyz[i * 3 + 2]!;
    const R = 7;
    const r = Math.ceil(R / this.cell);
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    const nb: number[] = [];
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++) {
          const list = this.cells.get(this.key(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const j of list) {
            const ex = this.xyz[j * 3]! - x, ey = this.xyz[j * 3 + 1]! - y, ez = this.xyz[j * 3 + 2]! - z;
            if (ex * ex + ey * ey + ez * ez <= R * R) nb.push(this.xyz[j * 3]!, this.xyz[j * 3 + 1]!, this.xyz[j * 3 + 2]!);
          }
        }
    let n: Float64Array | null = null;
    if (nb.length >= 18) {
      const m = nb.length / 3;
      let mx = 0, my = 0, mz = 0;
      for (let k = 0; k < m; k++) { mx += nb[k * 3]!; my += nb[k * 3 + 1]!; mz += nb[k * 3 + 2]!; }
      mx /= m; my /= m; mz /= m;
      const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let k = 0; k < m; k++) {
        const d = [nb[k * 3]! - mx, nb[k * 3 + 1]! - my, nb[k * 3 + 2]! - mz];
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a]![b]! += d[a]! * d[b]!;
      }
      const v = smallestEigenvector3(C);
      const sign = v[0]! * x + v[2]! * (z - this.axisZ) >= 0 ? 1 : -1;
      n = Float64Array.from([v[0]! * sign, v[1]! * sign, v[2]! * sign]);
    }
    while (this.normals.length <= i) this.normals.push(undefined as unknown as null);
    this.normals[i] = n;
    return n;
  }

  /** Index of the nearest point within `maxDist`, or -1. */
  nearest(x: number, y: number, z: number, maxDist: number): number {
    const r = Math.ceil(maxDist / this.cell);
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++) {
          const list = this.cells.get(this.key(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const i of list) {
            const ex = this.xyz[i * 3]! - x, ey = this.xyz[i * 3 + 1]! - y, ez = this.xyz[i * 3 + 2]! - z;
            const d = ex * ex + ey * ey + ez * ez;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
        }
    return best;
  }
}

export interface IcpResult {
  T: Mat4;
  /** RMS distance of the final pairs, mm. */
  rms: number;
  /** Share of sampled points that found a partner at the final distance. */
  inliers: number;
}

/** Pairing distances, mm, loosest first: wide for a cold start, tight once close. */
export const COLD = [20, 20, 14, 14, 10, 10, 7, 7, 5, 5, 4, 4];
export const WARM = [10, 7, 5, 4, 4];

/** Align `pts` (flat xyz, mm, in their own frame) onto the model, from `init`. */
export function icp(
  model: PointIndex,
  pts: ArrayLike<number>,
  init: Mat4,
  maxSamples = 1500,
  schedule: number[] = COLD,
): IcpResult {
  const n = Math.floor(pts.length / 3);
  const step = Math.max(1, Math.floor(n / maxSamples));
  let T = init;
  let rms = Infinity;
  let inliers = 0;
  let sampled = 0;
  // The schedule, then more rounds at the final distance until the moves
  // stop: point-to-point matching creeps slowly along the directions a
  // roundish head barely constrains, and stopping early leaves it short.
  const rounds = [...schedule, ...Array<number>(40).fill(schedule[schedule.length - 1]!)];
  for (let round = 0; round < rounds.length; round++) {
    const maxDist = rounds[round]!;
    // Point-to-plane: each point is pulled onto the model's SURFACE (along its
    // normal), not onto the nearest stored point — so the spacing of the
    // model's points cannot hold the fit a grid step away from the truth, and
    // sliding along the surface costs nothing, as it should.
    const AtA = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
    const Atb = new Array<number>(6).fill(0);
    let sq = 0;
    let pairs = 0;
    sampled = 0;
    for (let i = 0; i < n; i += step) {
      sampled++;
      const [x, y, z] = apply(T, pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
      const j = model.nearest(x, y, z, maxDist);
      if (j < 0) continue;
      const nrm = model.normal(j);
      if (!nrm) continue;
      const nx = nrm[0]!, ny = nrm[1]!, nz = nrm[2]!;
      const d = (model.xyz[j * 3]! - x) * nx + (model.xyz[j * 3 + 1]! - y) * ny + (model.xyz[j * 3 + 2]! - z) * nz;
      const row = [y * nz - z * ny, z * nx - x * nz, x * ny - y * nx, nx, ny, nz];
      for (let a = 0; a < 6; a++) {
        Atb[a]! += row[a]! * d;
        for (let b = 0; b < 6; b++) AtA[a]![b]! += row[a]! * row[b]!;
      }
      sq += d * d;
      pairs++;
    }
    if (pairs < 40) return { T, rms: Infinity, inliers: 0 };
    rms = Math.sqrt(sq / pairs);
    inliers = pairs / sampled;
    // A touch of damping keeps an unconstrained direction (a round head
    // turning about its axis) from being thrown about by noise.
    for (let a = 0; a < 6; a++) AtA[a]![a]! += 1e-3 * pairs;
    const x6 = solve(AtA, Atb);
    if (!x6) break;
    const delta = rigidFrom(x6[0]!, x6[1]!, x6[2]!, x6[3]!, x6[4]!, x6[5]!);
    T = mul(delta, T);
    if (round >= schedule.length && rotationDeg(delta) < 0.005 && Math.hypot(delta[12]!, delta[13]!, delta[14]!) < 0.01) break;
  }
  return { T, rms, inliers };
}

export interface RegFrame {
  stage: "turn" | "hold" | "posture";
  /** Flat xyz, mm, camera axes. */
  pts: Float32Array;
  /** Camera → face from ARKit, when it still tracked; mm. */
  pose: Mat4 | null;
}

export interface RegResult {
  /** Hold frames, placed: camera → face, and the frame. */
  holds: { T: Mat4; pts: Float32Array; rms: number; inliers: number }[];
  /** Posture frames (a step back, side-on), placed the same way. */
  posture: { T: Mat4; pts: Float32Array; rms: number; inliers: number }[];
  aligned: number;
  lost: number;
  meanRmsMm: number | null;
}

export function invertRigid(m: Mat4): Mat4 {
  const o = identity();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c]!;
  const [x, y, z] = apply(o, m[12]!, m[13]!, m[14]!);
  o[12] = -x;
  o[13] = -y;
  o[14] = -z;
  return o;
}

/** The points that, placed by `T`, fall on the head and neck (with a margin for a rough `T`). */
function headOnly(pts: Float32Array, T: Mat4, axisZ: number): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < pts.length / 3; i++) {
    const [x, y, z] = apply(T, pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
    const dz = z - axisZ;
    if (y > -200 && y < 130 && x * x + dz * dz < 140 * 140) out.push(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
  }
  return Float32Array.from(out);
}

/** Only head and neck go into the model; shoulders turn with the body but are not the head. */
function inRegion(x: number, y: number, z: number, axisZ: number): boolean {
  const dz = z - axisZ;
  return y > -250 && y < 120 && x * x + dz * dz < 150 * 150;
}

/** Chain the frames of one side round from the front, as described above. */
export function registerSide(model: PointIndex, frames: RegFrame[], axisZ = -60): RegResult {
  let T: Mat4 | null = null;
  // Frame-to-frame motion, for predicting the next pose: the body turns
  // smoothly, and a head is round enough that shape matching alone can let a
  // turn slide by unnoticed. Matching then only has to correct the forecast.
  let step: Mat4 | null = null;
  const holds: RegResult["holds"] = [];
  const posture: RegResult["posture"] = [];
  let aligned = 0;
  let lost = 0;
  let rmsSum = 0;
  for (const f of frames) {
    const predicted = T && step && f.stage === "turn" ? mul(step, T) : T;
    const init = f.pose ?? predicted;
    if (!init) continue;
    // ARKit's pose and the forecast both start close; only the very first
    // untracked guess needs the wide search.
    const warm = f.pose !== null || step !== null;
    // Match on the head and neck only. Side-on at 30 cm the shoulder and
    // chest can fill most of the frame; they turn with the body but are not
    // the model, and left in they would drown the head's share of matches.
    const head = headOnly(f.pts, init, axisZ);
    if (head.length < 600) {
      lost++;
      continue;
    }
    const r = icp(model, head, init, f.stage === "hold" ? 1200 : 600, warm ? WARM : COLD);
    if (!(r.inliers >= 0.35 && r.rms <= 4)) {
      lost++;
      continue;
    }
    step = T ? mul(r.T, invertRigid(T)) : null;
    T = r.T;
    aligned++;
    rmsSum += r.rms;
    if (f.stage === "posture") {
      posture.push({ T: r.T, pts: f.pts, rms: r.rms, inliers: r.inliers });
    } else if (f.stage === "hold") {
      holds.push({ T: r.T, pts: f.pts, rms: r.rms, inliers: r.inliers });
    } else {
      // Grow the model round the head so the next frame, turned further,
      // still overlaps it.
      // Only where the model has nothing yet (none within 2 mm), so it grows
      // round the head without piling up where it already is.
      for (let i = 0; i < f.pts.length / 3; i += 2) {
        const [x, y, z] = apply(r.T, f.pts[i * 3]!, f.pts[i * 3 + 1]!, f.pts[i * 3 + 2]!);
        if (inRegion(x, y, z, axisZ) && model.nearest(x, y, z, 2) < 0) model.add(x, y, z);
      }
    }
  }
  return { holds, posture, aligned, lost, meanRmsMm: aligned ? rmsSum / aligned : null };
}

/** Base64 Int16 xyz in 0.1 mm → Float32 mm. */
export function decodeCloud(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const raw = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i]! / 10;
  return out;
}
