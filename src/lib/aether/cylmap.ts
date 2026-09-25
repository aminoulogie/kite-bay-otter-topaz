/**
 * Measurements from the TrueDepth SWEEP (FaceDepthPlugin.swift, mode "sweep").
 *
 * The sweep fuses every depth pixel of a slow head circle onto a cylinder
 * round the head's vertical axis: each cell is the median radius r (mm) at an
 * angle θ round the head and a height y, in the face's own axes. θ > 0 is the
 * person's LEFT (ARKit's +x is the face's own left).
 *
 * The frames are split alternately into two independent cylinders, A and B.
 * Everything here is measured on A, on B and on their mean: A-vs-B is the
 * scan's own noise, so every figure comes with an honest ± and a change
 * smaller than that is not a change.
 *
 * Why this is steadier than a single front burst: the numbers are read from a
 * 3D model in the face's own frame, so how the head happened to be held
 * matters far less; the median per cell ignores frames with a slipped pose;
 * and a fixed window (not "wherever depth landed this time") is compared.
 */

export interface Cylinder {
  a: Float32Array;
  b: Float32Array;
  width: number;
  height: number;
  thetaMinDeg: number;
  thetaStepDeg: number;
  yMinMm: number;
  yStepMm: number;
}

/** Rows (by y, mm) and angles (|θ|, degrees) that are face, not hair, ears or neck. */
export interface FaceWindow {
  yLoMm: number;
  yHiMm: number;
  maxThetaDeg: number;
}

/** Brow-ish to chin-ish, from the eye height the mesh gives. */
export function faceWindow(eyeYMm: number | null): FaceWindow {
  const eye = eyeYMm ?? 30;
  return { yLoMm: eye - 95, yHiMm: eye + 30, maxThetaDeg: 75 };
}

const theta = (c: Cylinder, i: number) => c.thetaMinDeg + i * c.thetaStepDeg;
const yOf = (c: Cylinder, j: number) => c.yMinMm + j * c.yStepMm;

/** Mean of A and B where both have data, else whichever does. */
export function mergeCyl(c: Cylinder): Float32Array {
  const out = new Float32Array(c.a.length).fill(NaN);
  for (let k = 0; k < out.length; k++) {
    const a = c.a[k]!;
    const b = c.b[k]!;
    const fa = Number.isFinite(a);
    const fb = Number.isFinite(b);
    out[k] = fa && fb ? (a + b) / 2 : fa ? a : fb ? b : NaN;
  }
  return out;
}

function inWindow(c: Cylinder, w: FaceWindow, i: number, j: number): boolean {
  const y = yOf(c, j);
  return y >= w.yLoMm && y <= w.yHiMm && Math.abs(theta(c, i)) <= w.maxThetaDeg;
}

/** Per-cell noise of the MERGED map: half the RMS of A − B inside the window. */
export function cellNoiseMm(c: Cylinder, w: FaceWindow): number | null {
  let s = 0;
  let n = 0;
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      if (!inWindow(c, w, i, j)) continue;
      const k = j * c.width + i;
      const d = c.a[k]! - c.b[k]!;
      if (!Number.isFinite(d) || Math.abs(d) > 8) continue;
      s += d * d;
      n++;
    }
  }
  return n >= 200 ? Math.sqrt(s / n) / 2 : null;
}

/** Share of the window's cells with data. */
export function coverage(map: Float32Array, c: Cylinder, w: FaceWindow): number {
  let have = 0;
  let all = 0;
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      if (!inWindow(c, w, i, j)) continue;
      all++;
      if (Number.isFinite(map[j * c.width + i]!)) have++;
    }
  }
  return all ? have / all : 0;
}

export interface CylSymmetry {
  /** RMS of how far each side departs from the mirrored other, mm, with the noise's share removed. */
  rmsMm: number;
  p95Mm: number;
  byThird: { upper: number; middle: number; lower: number };
  /** Person's left minus right, mean mm per third: + = left side sits further out. */
  leftMinusRightMm: { upper: number; middle: number; lower: number };
  midlineDeg: number;
  pairs: number;
}

const OUTLIER_MM = 8;
const CENTRE_GAP_DEG = 3;
const MIN_PAIRS = 300;

/**
 * Mirror symmetry across the best midline. Two alignment errors would read
 * as asymmetry and are removed: the midline angle (searched in half-degree
 * steps), and an axis sitting slightly off-centre, which makes one side read
 * further out by ≈ 2·δx·sin θ — fitted and subtracted like a head turn.
 * `noiseMm` (per cell) is taken out of the RMS in quadrature: noise alone
 * would otherwise read as asymmetry, and more so on a noisier scan.
 */
export function cylSymmetry(map: Float32Array, c: Cylinder, w: FaceWindow, noiseMm = 0): CylSymmetry | null {
  const zero = Math.round(-c.thetaMinDeg / c.thetaStepDeg);
  const span = Math.round(4 / c.thetaStepDeg);
  let best: { s: number; k: number; kept: { r: number; y: number; t: number }[]; score: number } | null = null;
  for (let s = 2 * zero - 2 * span; s <= 2 * zero + 2 * span; s++) {
    const centre = theta(c, s / 2);
    const pairs: { d: number; y: number; t: number }[] = [];
    for (let j = 0; j < c.height; j++) {
      for (let i = 0; i < c.width; i++) {
        const t = theta(c, i) - centre;
        if (t < CENTRE_GAP_DEG) continue;
        const m = s - i;
        if (m < 0 || m >= c.width || !inWindow(c, w, i, j) || !inWindow(c, w, m, j)) continue;
        const d = map[j * c.width + i]! - map[j * c.width + m]!;
        if (Number.isFinite(d)) pairs.push({ d, y: yOf(c, j), t });
      }
    }
    if (pairs.length < MIN_PAIRS) continue;
    // Fit d ≈ k·sin t twice, dropping hair and edge outliers in between.
    let k = 0;
    let kept = pairs.map((p) => ({ r: p.d, y: p.y, t: p.t }));
    for (let pass = 0; pass < 2; pass++) {
      let num = 0;
      let den = 0;
      for (const p of kept) {
        const sn = Math.sin((p.t * Math.PI) / 180);
        num += (p.r + k * sn) * sn; // p.r holds d − k_prev·sin; add it back
        den += sn * sn;
      }
      k = den ? num / den : 0;
      kept = pairs
        .map((p) => ({ r: p.d - k * Math.sin((p.t * Math.PI) / 180), y: p.y, t: p.t }))
        .filter((p) => Math.abs(p.r) <= OUTLIER_MM);
    }
    if (kept.length < MIN_PAIRS) continue;
    const score = kept.reduce((a, p) => a + p.r * p.r, 0) / kept.length;
    if (!best || score < best.score) best = { s, k, kept, score };
  }
  if (!best) return null;

  const kept = best.kept;
  // Each side departs from the other's mirror by half the difference; noise
  // in a half-difference has variance σ²/2 for per-cell noise σ.
  const debias = (ms: number) => Math.sqrt(Math.max(0, ms - (noiseMm * noiseMm) / 2));
  const dev = kept.map((p) => Math.abs(p.r) / 2).sort((a, b) => a - b);
  const ms = kept.reduce((a, p) => a + (p.r / 2) ** 2, 0) / kept.length;
  const acc: Record<string, [number, number, number]> = { upper: [0, 0, 0], middle: [0, 0, 0], lower: [0, 0, 0] };
  const spanY = w.yHiMm - w.yLoMm || 1;
  for (const p of kept) {
    const f = (p.y - w.yLoMm) / spanY;
    const a = acc[f > 2 / 3 ? "upper" : f > 1 / 3 ? "middle" : "lower"]!;
    a[0] += (p.r / 2) ** 2;
    a[1] += p.r;
    a[2] += 1;
  }
  const rmsOf = (key: string) => (acc[key]![2] ? debias(acc[key]![0] / acc[key]![2]) : 0);
  const meanOf = (key: string) => (acc[key]![2] ? acc[key]![1] / acc[key]![2] : 0);
  return {
    rmsMm: debias(ms),
    p95Mm: dev[Math.floor(0.95 * (dev.length - 1))]!,
    byThird: { upper: rmsOf("upper"), middle: rmsOf("middle"), lower: rmsOf("lower") },
    leftMinusRightMm: { upper: meanOf("upper"), middle: meanOf("middle"), lower: meanOf("lower") },
    midlineDeg: theta(c, best.s / 2),
    pairs: kept.length,
  };
}

/**
 * Widest left-to-right span in a band of heights, mm — only where the scan
 * reached round to both sides (past ±80°), or the "width" would just be how
 * far the sweep got.
 */
export function bandWidthMm(map: Float32Array, c: Cylinder, yLoMm: number, yHiMm: number): number | null {
  let best: number | null = null;
  for (let j = 0; j < c.height; j++) {
    const y = yOf(c, j);
    if (y < yLoMm || y > yHiMm) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (let i = 0; i < c.width; i++) {
      const r = map[j * c.width + i]!;
      if (!Number.isFinite(r)) continue;
      const t = theta(c, i);
      const x = r * Math.sin((t * Math.PI) / 180);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
    if (tMin > -80 || tMax < 80) continue;
    best = Math.max(best ?? 0, hi - lo);
  }
  return best;
}

/**
 * Along the midline: how far the chin sits behind the nose tip, mm. The nose
 * tip is the furthest-out point of the midline; the chin the furthest-out
 * point at least 35 mm below it.
 */
export function chinBehindNoseMm(map: Float32Array, c: Cylinder, w: FaceWindow, midlineDeg: number): number | null {
  const i = Math.round((midlineDeg - c.thetaMinDeg) / c.thetaStepDeg);
  const at = (j: number) => {
    // The median of the three columns round the midline, against a stray cell.
    const v = [i - 1, i, i + 1].map((ii) => map[j * c.width + ii]!).filter(Number.isFinite).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)]! : NaN;
  };
  let nose = -Infinity;
  let noseY = 0;
  for (let j = 0; j < c.height; j++) {
    const y = yOf(c, j);
    if (y < w.yLoMm || y > w.yHiMm) continue;
    const r = at(j);
    if (r > nose) {
      nose = r;
      noseY = y;
    }
  }
  if (!Number.isFinite(nose)) return null;
  let chin = -Infinity;
  for (let j = 0; j < c.height; j++) {
    const y = yOf(c, j);
    if (y < w.yLoMm || y > noseY - 35) continue;
    chin = Math.max(chin, at(j));
  }
  return Number.isFinite(chin) ? nose - chin : null;
}

export interface CylChange {
  /** RMS surface change after the best alignment, mm. */
  rmsMm: number;
  /** Mean change by region, mm: + = the surface moved OUT (fuller). */
  byRegion: { left: number; right: number; upper: number; lower: number };
  cells: number;
}

/**
 * How the surface changed between two sweeps. The newer map is slid over
 * the older by up to ±3° round and ±4 rows up/down to line them up, and any
 * overall in/out offset is removed — what is left is shape.
 */
export function compareCyl(prev: Float32Array, cur: Float32Array, c: Cylinder, w: FaceWindow): CylChange | null {
  let best: { rms: number; di: number; dj: number; mean: number; cells: number } | null = null;
  for (let dj = -4; dj <= 4; dj++) {
    for (let di = -3; di <= 3; di++) {
      let s = 0;
      let s2 = 0;
      let n = 0;
      for (let j = 0; j < c.height; j++) {
        for (let i = 0; i < c.width; i++) {
          if (!inWindow(c, w, i, j)) continue;
          const jj = j + dj;
          const ii = i + di;
          if (jj < 0 || jj >= c.height || ii < 0 || ii >= c.width) continue;
          const d = cur[jj * c.width + ii]! - prev[j * c.width + i]!;
          if (!Number.isFinite(d) || Math.abs(d) > 10) continue;
          s += d;
          s2 += d * d;
          n++;
        }
      }
      if (n < 500) continue;
      const mean = s / n;
      const rms = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      if (!best || rms < best.rms) best = { rms, di, dj, mean, cells: n };
    }
  }
  if (!best) return null;
  const reg = { left: [0, 0], right: [0, 0], upper: [0, 0], lower: [0, 0] } as Record<string, [number, number]>;
  const mid = (w.yLoMm + w.yHiMm) / 2;
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      if (!inWindow(c, w, i, j)) continue;
      const jj = j + best.dj;
      const ii = i + best.di;
      if (jj < 0 || jj >= c.height || ii < 0 || ii >= c.width) continue;
      const d = cur[jj * c.width + ii]! - prev[j * c.width + i]! - best.mean;
      if (!Number.isFinite(d) || Math.abs(d) > 10) continue;
      const t = theta(c, i);
      const add = (key: string) => {
        reg[key]![0] += d;
        reg[key]![1] += 1;
      };
      if (t > 10) add("left");
      if (t < -10) add("right");
      add(yOf(c, j) > mid ? "upper" : "lower");
    }
  }
  const m = (k: string) => (reg[k]![1] ? reg[k]![0] / reg[k]![1] : 0);
  return { rmsMm: best.rms, byRegion: { left: m("left"), right: m("right"), upper: m("upper"), lower: m("lower") }, cells: best.cells };
}

export interface SweepSummary {
  frames: number;
  /** Share of the ring's directions covered. */
  sweepCoverage: number;
  /** Share of the face window with data. */
  coverage: number;
  /** Per-cell noise of the fused surface, mm. */
  cellNoiseMm: number | null;
  symmetry: CylSymmetry | null;
  /** ± on the symmetry RMS, from the two halves of the scan. */
  symmetryNoiseMm: number | null;
  cheekWidthMm: number | null;
  jawWidthMm: number | null;
  chinBehindNoseMm: number | null;
}

/** Everything the app stores about a sweep. */
export function summariseCylinder(c: Cylinder, eyeYMm: number | null, frames: number, sweepCoverage: number): SweepSummary {
  const w = faceWindow(eyeYMm);
  const merged = mergeCyl(c);
  const noise = cellNoiseMm(c, w);
  // Each half is twice as noisy per cell as the merged map (√2 in σ).
  const halfNoise = noise == null ? 0 : noise * Math.SQRT2;
  const sym = cylSymmetry(merged, c, w, noise ?? 0);
  const symA = cylSymmetry(c.a, c, w, halfNoise);
  const symB = cylSymmetry(c.b, c, w, halfNoise);
  const eye = eyeYMm ?? 30;
  return {
    frames,
    sweepCoverage,
    coverage: coverage(merged, c, w),
    cellNoiseMm: noise,
    symmetry: sym,
    symmetryNoiseMm: symA && symB ? Math.abs(symA.rmsMm - symB.rmsMm) / 2 : null,
    cheekWidthMm: bandWidthMm(merged, c, eye - 40, eye - 10),
    jawWidthMm: bandWidthMm(merged, c, eye - 90, eye - 65),
    chinBehindNoseMm: sym ? chinBehindNoseMm(merged, c, w, sym.midlineDeg) : null,
  };
}
