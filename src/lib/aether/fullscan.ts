/**
 * The full scan: the front sweep's cylinder, extended with the side-on holds,
 * and the jaw, neck, profile and posture numbers read off the result.
 *
 * Face axes, mm: x = the person's LEFT, y up, z out of the face. The cylinder
 * (see cylmap.ts) is r at (θ round the head, y), θ = 0 straight ahead.
 */

import type { Cylinder } from "./cylmap.ts";
import { mergeCyl } from "./cylmap.ts";
import { apply, decodeCloud, fromArkit, PointIndex, registerSide, type Mat4, type RegFrame } from "./register.ts";

const RES = 12;
/** Readings more than this many degrees off square-on are too oblique to trust. */
const MAX_GRAZING = 60;
/** Beyond this angle the side views are square-on and the front sweep was not. */
const SIDE_WINS_DEG = 55;

const thetaOf = (c: Cylinder, i: number) => c.thetaMinDeg + i * c.thetaStepDeg;
const yOf = (c: Cylinder, j: number) => c.yMinMm + j * c.yStepMm;

/** The sweep's surface as points, the model the side frames are matched to. */
export function modelPoints(map: Float32Array, c: Cylinder, axisZ: number): PointIndex {
  const index = new PointIndex(8);
  index.axisZ = axisZ;
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const r = map[j * c.width + i]!;
      if (!Number.isFinite(r)) continue;
      const t = (thetaOf(c, i) * Math.PI) / 180;
      index.add(r * Math.sin(t), yOf(c, j), axisZ + r * Math.cos(t));
    }
  return index;
}

/** A cylinder built from placed frames: a sample of 12 readings per cell, median at the end. */
export class SideCylinder {
  private readonly samples: Float32Array;
  private readonly counts: Uint16Array;
  private seed = 12345;
  private readonly c: Cylinder;
  private readonly axisZ: number;

  constructor(c: Cylinder, axisZ: number) {
    this.c = c;
    this.axisZ = axisZ;
    this.samples = new Float32Array(c.width * c.height * RES);
    this.counts = new Uint16Array(c.width * c.height);
  }

  add(T: Mat4, pts: Float32Array): void {
    const c = this.c;
    const [camX, , camZ] = apply(T, 0, 0, 0);
    const thetaCam = (Math.atan2(camX, camZ - this.axisZ) * 180) / Math.PI;
    for (let p = 0; p < pts.length / 3; p++) {
      const [x, y, z] = apply(T, pts[p * 3]!, pts[p * 3 + 1]!, pts[p * 3 + 2]!);
      const dz = z - this.axisZ;
      const r = Math.hypot(x, dz);
      if (r < 30 || r > 150) continue;
      const t = (Math.atan2(x, dz) * 180) / Math.PI;
      if (Math.abs(t - thetaCam) > MAX_GRAZING) continue;
      const i = Math.round((t - c.thetaMinDeg) / c.thetaStepDeg);
      const j = Math.round((y - c.yMinMm) / c.yStepMm);
      if (i < 0 || i >= c.width || j < 0 || j >= c.height) continue;
      const cell = j * c.width + i;
      const n = this.counts[cell]!;
      if (n < RES) this.samples[cell * RES + n] = r;
      else {
        this.seed = (this.seed * 16807) % 2147483647;
        const slot = this.seed % (n + 1);
        if (slot < RES) this.samples[cell * RES + slot] = r;
      }
      if (n < 65535) this.counts[cell] = n + 1;
    }
  }

  medians(): Float32Array {
    const out = new Float32Array(this.counts.length).fill(NaN);
    const buf: number[] = [];
    for (let cell = 0; cell < this.counts.length; cell++) {
      const n = Math.min(this.counts[cell]!, RES);
      if (n < 3) continue;
      buf.length = 0;
      for (let k = 0; k < n; k++) buf.push(this.samples[cell * RES + k]!);
      buf.sort((a, b) => a - b);
      out[cell] = n % 2 ? buf[n >> 1]! : (buf[n / 2 - 1]! + buf[n / 2]!) / 2;
    }
    return out;
  }
}

/** Sweep where the front saw square-on; side views where they did. */
export function mergeSides(front: Float32Array, side: Float32Array, c: Cylinder): Float32Array {
  const out = new Float32Array(front.length);
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const k = j * c.width + i;
      const f = front[k]!;
      const s = side[k]!;
      const sideFirst = Math.abs(thetaOf(c, i)) > SIDE_WINS_DEG;
      out[k] = sideFirst ? (Number.isFinite(s) ? s : f) : Number.isFinite(f) ? f : s;
    }
  return out;
}

// ---------------------------------------------------------------------------
// Profile, neck and posture

/** The midline profile: for each row, how far forward the surface is (r), mm. */
export function midlineProfile(map: Float32Array, c: Cylinder, midlineDeg: number): { y: number; r: number }[] {
  const i = Math.round((midlineDeg - c.thetaMinDeg) / c.thetaStepDeg);
  const out: { y: number; r: number }[] = [];
  for (let j = 0; j < c.height; j++) {
    const v = [i - 1, i, i + 1]
      .filter((ii) => ii >= 0 && ii < c.width)
      .map((ii) => map[j * c.width + ii]!)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (v.length) out.push({ y: yOf(c, j), r: v[Math.floor(v.length / 2)]! });
  }
  return out;
}

/** Best-fit line through 2D points (total least squares): centre and unit direction. */
function fitLine(p: { y: number; r: number }[]): { cy: number; cr: number; dy: number; dr: number; sse: number } {
  const n = p.length;
  const cy = p.reduce((s, q) => s + q.y, 0) / n;
  const cr = p.reduce((s, q) => s + q.r, 0) / n;
  let syy = 0, srr = 0, syr = 0;
  for (const q of p) {
    syy += (q.y - cy) ** 2;
    srr += (q.r - cr) ** 2;
    syr += (q.y - cy) * (q.r - cr);
  }
  const ang = 0.5 * Math.atan2(2 * syr, syy - srr);
  const dy = Math.cos(ang);
  const dr = Math.sin(ang);
  let sse = 0;
  for (const q of p) sse += (-(q.y - cy) * dr + (q.r - cr) * dy) ** 2;
  return { cy, cr, dy, dr, sse };
}

export interface ChinNeck {
  /** The chin–neck (cervicomental) angle, degrees: under-chin line against front-of-neck line. */
  angleDeg: number;
  /** Height of the chin's most forward point and of the chin–neck corner, mm. */
  chinY: number;
  cornerY: number;
  /** Chin point to the corner, mm — the under-chin length. */
  underChinMm: number;
  /** The front-of-neck line, pointing up the neck, in (y, z) face axes. */
  neckDir: { dy: number; dz: number };
}

/**
 * The chin–neck angle from the midline profile. Below the chin's most forward
 * point the profile runs back under the chin, turns at the chin–neck corner
 * and runs down the front of the neck; two straight lines are fitted with the
 * corner placed where they fit best, and the angle between them is read.
 */
export function chinNeck(profile: { y: number; r: number }[], noseY: number): ChinNeck | null {
  const chinZone = profile.filter((p) => p.y <= noseY - 35 && p.y >= noseY - 85);
  if (!chinZone.length) return null;
  const chin = chinZone.reduce((a, b) => (b.r > a.r ? b : a));
  const below = profile.filter((p) => p.y <= chin.y && p.y >= chin.y - 110).sort((a, b) => b.y - a.y);
  if (below.length < 20) return null;
  let best: { k: number; sse: number } | null = null;
  for (let k = 6; k <= below.length - 8; k++) {
    const sse = fitLine(below.slice(0, k + 1)).sse + fitLine(below.slice(k)).sse;
    if (!best || sse < best.sse) best = { k, sse };
  }
  if (!best) return null;
  const upper = fitLine(below.slice(0, best.k + 1));
  const lower = fitLine(below.slice(best.k));
  const corner = below[best.k]!;
  // Direction from the corner up towards the chin, and down the neck.
  const toChin = { y: chin.y - corner.y, r: chin.r - corner.r };
  let u = { y: upper.dy, r: upper.dr };
  if (u.y * toChin.y + u.r * toChin.r < 0) u = { y: -u.y, r: -u.r };
  let d = { y: lower.dy, r: lower.dr };
  if (d.y > 0) d = { y: -d.y, r: -d.r };
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, u.y * d.y + u.r * d.r))) * 180) / Math.PI;
  return {
    angleDeg,
    chinY: chin.y,
    cornerY: corner.y,
    underChinMm: Math.hypot(toChin.y, toChin.r),
    // At the midline z = axis + r, so dr along the profile is dz.
    neckDir: { dy: -d.y, dz: -d.r },
  };
}

export interface NeckSize {
  /** Side to side at the neck's narrowest, mm. */
  widthMm: number;
  /** Front to back at that height, mm — from the front to the furthest-back point the scan reached. */
  depthMm: number;
  /** True when the scan did not reach round to the back, so depth is short. */
  depthPartial: boolean;
  /** Ellipse perimeter from width and depth: an estimate of what a tape would read. */
  circumferenceMm: number;
  y: number;
}

/** Neck width and depth at its narrowest, in the band from 10 to 60 mm below the chin–neck corner. */
export function neckSize(map: Float32Array, c: Cylinder, cornerY: number, axisZ: number): NeckSize | null {
  let best: NeckSize | null = null;
  for (let j = 0; j < c.height; j++) {
    const y = yOf(c, j);
    if (y > cornerY - 10 || y < cornerY - 60) continue;
    let xl = Infinity, xr = -Infinity, zf = -Infinity, zb = Infinity, tMin = Infinity, tMax = -Infinity;
    for (let i = 0; i < c.width; i++) {
      const r = map[j * c.width + i]!;
      if (!Number.isFinite(r)) continue;
      const t = thetaOf(c, i);
      const tr = (t * Math.PI) / 180;
      const x = r * Math.sin(tr);
      const z = axisZ + r * Math.cos(tr);
      xl = Math.min(xl, x); xr = Math.max(xr, x);
      zf = Math.max(zf, z); zb = Math.min(zb, z);
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
    }
    if (tMin > -80 || tMax < 80) continue;
    const width = xr - xl;
    if (best && width >= best.widthMm) continue;
    const depth = zf - zb;
    const a = width / 2, b = depth / 2;
    best = {
      widthMm: width,
      depthMm: depth,
      depthPartial: tMin > -150 || tMax < 150,
      circumferenceMm: Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))),
      y,
    };
  }
  return best;
}

/** Angle of a (y up, z forward) direction from straight up, degrees: + = leaning forward. */
const fromVertical = (dy: number, dz: number) => (Math.atan2(dz, dy) * 180) / Math.PI;

export interface Posture {
  /** Front-of-neck line against true vertical, degrees: + = neck leaning forward. */
  neckLeanDeg: number | null;
  /** Face's own up axis against true vertical, degrees: + = head tipped forward (chin down). */
  headPitchDeg: number;
}

/** Posture against gravity, which the phone knows even fixed to a mirror. */
export function posture(gravityFace: [number, number, number], neckDir: { dy: number; dz: number } | null): Posture {
  const up = { dy: -gravityFace[1], dz: -gravityFace[2] };
  const vertical = fromVertical(up.dy, up.dz);
  return {
    neckLeanDeg: neckDir ? fromVertical(neckDir.dy, neckDir.dz) - vertical : null,
    headPitchDeg: -vertical,
  };
}

/** How far below the chin the scan reached along the midline, mm. */
export function reachBelowChinMm(profile: { y: number; r: number }[], chinY: number): number {
  const lowest = profile.reduce((m, p) => Math.min(m, p.y), Infinity);
  return Number.isFinite(lowest) ? Math.max(0, chinY - lowest) : 0;
}

export interface RawSideFrame {
  stage: "turn" | "hold";
  points: string;
  pose?: number[];
}

export interface SideStats {
  /** Frames placed on the model / lost, and hold frames used. */
  aligned: number;
  lost: number;
  holds: number;
  /** Mean fit error of placed frames, mm. */
  fitMm: number | null;
}

/**
 * Place both sides' frames on the sweep's model and fold the holds into the
 * cylinder, alternating into A and B like the sweep, so the ± still holds.
 */
export function extendWithSides(
  c: Cylinder,
  axisZ: number,
  sides: { right: RawSideFrame[]; left: RawSideFrame[] },
): { cyl: Cylinder; stats: { right: SideStats; left: SideStats } } {
  const model = modelPoints(mergeCyl(c), c, axisZ);
  const a = new SideCylinder(c, axisZ);
  const b = new SideCylinder(c, axisZ);
  const stats = {} as { right: SideStats; left: SideStats };
  let k = 0;
  for (const side of ["right", "left"] as const) {
    const frames: RegFrame[] = sides[side].map((f) => ({
      stage: f.stage,
      pts: decodeCloud(f.points),
      pose: f.pose ? fromArkit(f.pose) : null,
    }));
    const r = registerSide(model, frames, axisZ);
    for (const h of r.holds) (k++ % 2 ? b : a).add(h.T, h.pts);
    stats[side] = { aligned: r.aligned, lost: r.lost, holds: r.holds.length, fitMm: r.meanRmsMm };
  }
  return {
    cyl: { ...c, a: mergeSides(c.a, a.medians(), c), b: mergeSides(c.b, b.medians(), c) },
    stats,
  };
}
