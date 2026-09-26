/**
 * The full scan: the front sweep's cylinder, extended with the side-on holds,
 * and the jaw, neck, profile and posture numbers read off the result.
 *
 * Face axes, mm: x = the person's LEFT, y up, z out of the face. The cylinder
 * (see cylmap.ts) is r at (θ round the head, y), θ = 0 straight ahead.
 */

import type { Cylinder } from "./cylmap.ts";
import { mergeCyl } from "./cylmap.ts";
import { apply, decodeCloud, fromArkit, icp, PointIndex, registerSide, type Mat4, type RegFrame } from "./register.ts";

const RES = 12;
/** Readings more than this many degrees off square-on are too oblique to trust. */
const MAX_GRAZING = 60;
/** Beyond this angle the side views are square-on and the front sweep was not. */
const SIDE_WINS_DEG = 55;

const thetaOf = (c: Cylinder, i: number) => c.thetaMinDeg + i * c.thetaStepDeg;
const yOf = (c: Cylinder, j: number) => c.yMinMm + j * c.yStepMm;

/**
 * How far from the axis a reading may sit, mm. 15 cm holds the head
 * everywhere but the nose, which reaches past it — a hard 15 cm left the nose
 * out of the model. In front of the face and above the chin nothing else can
 * be there, so the limit is 20 cm. Same rule as the phone's sweep.
 */
export function maxRadiusMm(thetaDeg: number, yMm: number): number {
  return Math.abs(thetaDeg) < 45 && yMm > -80 ? 200 : 150;
}

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
      const t = (Math.atan2(x, dz) * 180) / Math.PI;
      if (r < 30 || r > maxRadiusMm(t, y)) continue;
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
  // Only the neck, not the chest: the corner is looked for 15–70 mm below the
  // chin, and the neck line runs at most 60 mm below the corner. (The first
  // real scan reached 200 mm down and the fitted "neck" ran into the chest.)
  const below = profile.filter((p) => p.y <= chin.y && p.y >= chin.y - 130).sort((a, b) => b.y - a.y);
  if (below.length < 20) return null;
  let best: { k: number; sse: number } | null = null;
  for (let k = 6; k <= below.length - 8; k++) {
    const drop = chin.y - below[k]!.y;
    if (drop < 15 || drop > 70) continue;
    const neck = below.slice(k).filter((p) => p.y >= below[k]!.y - 60);
    if (neck.length < 8) continue;
    const sse = fitLine(below.slice(0, k + 1)).sse + fitLine(neck).sse;
    if (!best || sse < best.sse) best = { k, sse };
  }
  if (!best) return null;
  const upper = fitLine(below.slice(0, best.k + 1));
  const corner = below[best.k]!;
  const lower = fitLine(below.slice(best.k).filter((p) => p.y >= corner.y - 60));
  // Direction from the corner up towards the chin, and down the neck.
  const toChin = { y: chin.y - corner.y, r: chin.r - corner.r };
  let u = { y: upper.dy, r: upper.dr };
  if (u.y * toChin.y + u.r * toChin.r < 0) u = { y: -u.y, r: -u.r };
  let d = { y: lower.dy, r: lower.dr };
  if (d.y > 0) d = { y: -d.y, r: -d.r };
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, u.y * d.y + u.r * d.r))) * 180) / Math.PI;
  // Outside what a human neck does, the fit found something else.
  if (angleDeg < 80 || angleDeg > 150) return null;
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

/**
 * How far a placed hold's surface sits from the front scan where both saw
 * the face — the band 25–65° round the head, which the sweep saw square-on
 * enough and a side-on hold sees too. Median, mm; null if they barely overlap.
 *
 * This is the check that a hold was placed RIGHT, not just placed: a hold
 * that fits its own frame well but sits a few mm off the face will read as a
 * wider cheek or jaw (the first real full scan's 204 mm cheeks).
 */
export function overlapErrorMm(T: Mat4, pts: Float32Array, front: Float32Array, c: Cylinder, axisZ: number): number | null {
  const diffs: number[] = [];
  for (let p = 0; p < pts.length / 3; p += 2) {
    const [x, y, z] = apply(T, pts[p * 3]!, pts[p * 3 + 1]!, pts[p * 3 + 2]!);
    const dz = z - axisZ;
    const t = (Math.atan2(x, dz) * 180) / Math.PI;
    if (Math.abs(t) < 25 || Math.abs(t) > 65) continue;
    const i = Math.round((t - c.thetaMinDeg) / c.thetaStepDeg);
    const j = Math.round((y - c.yMinMm) / c.yStepMm);
    if (i < 0 || i >= c.width || j < 0 || j >= c.height) continue;
    const f = front[j * c.width + i]!;
    if (Number.isFinite(f)) diffs.push(Math.abs(Math.hypot(x, dz) - f));
  }
  if (diffs.length < 150) return null;
  diffs.sort((a, b) => a - b);
  return diffs[diffs.length >> 1]!;
}

/**
 * The chain round the head can drift a few mm by the time it is side-on.
 * Before a hold is judged it is fitted once more — against the FRONT scan
 * only (not the model the chain grew), on just its cheek and jaw points
 * (15–80° round), which is exactly where it must agree. If that fit is poor
 * the chained pose is kept and the check decides.
 */
export function refineOnFront(
  h: { T: Mat4; pts: Float32Array; rms: number; inliers: number },
  frontModel: PointIndex,
  axisZ: number,
): { T: Mat4; pts: Float32Array; rms: number; inliers: number } {
  const sel: number[] = [];
  for (let p = 0; p < h.pts.length / 3; p++) {
    const [x, y, z] = apply(h.T, h.pts[p * 3]!, h.pts[p * 3 + 1]!, h.pts[p * 3 + 2]!);
    const t = Math.abs((Math.atan2(x, z - axisZ) * 180) / Math.PI);
    if (t >= 15 && t <= 80 && y > -130 && y < 90) sel.push(h.pts[p * 3]!, h.pts[p * 3 + 1]!, h.pts[p * 3 + 2]!);
  }
  if (sel.length / 3 < 400) return h;
  const r = icp(frontModel, Float32Array.from(sel), h.T, 1500, [6, 4, 3, 2.5, 2]);
  return r.rms <= 2.5 && r.inliers >= 0.5 ? { ...h, T: r.T } : h;
}

/** Limits a hold must meet to be used. */
export const HOLD_LIMITS = { fitMm: 2, inliers: 0.5, overlapMm: 1.5 };

export type HoldVerdict = "used" | "loose fit" | "off the face" | "no overlap";

export function judgeHold(
  h: { T: Mat4; pts: Float32Array; rms: number; inliers: number },
  front: Float32Array,
  c: Cylinder,
  axisZ: number,
  limits: { fitMm: number; inliers: number; overlapMm: number } = HOLD_LIMITS,
): { verdict: HoldVerdict; overlapMm: number | null } {
  if (h.rms > limits.fitMm || h.inliers < limits.inliers) return { verdict: "loose fit", overlapMm: null };
  const o = overlapErrorMm(h.T, h.pts, front, c, axisZ);
  if (o == null) return { verdict: "no overlap", overlapMm: null };
  return { verdict: o <= limits.overlapMm ? "used" : "off the face", overlapMm: o };
}

/**
 * Posture frames are taken from ~55 cm, where depth is noisier: they only
 * have to be placed well enough to show head, neck, shoulders and upper back
 * in the right place — centimetre questions — not to measure the face.
 */
export const POSTURE_LIMITS = { fitMm: 3, inliers: 0.4, overlapMm: 3 };

/**
 * A hold that misses HOLD_LIMITS is not good enough to measure from, but a
 * near miss still knows where the neck is. Holds that land inside these wider
 * limits are SHOWN and never measured: they go to the point cloud only, so
 * the model has a neck to look at while every number needing that side stays
 * blank. Half a centimetre out is nothing to a picture of a neck and far too
 * much for a millimetre of asymmetry, which is the whole reason for the split.
 */
export const SHOW_LIMITS = { fitMm: 3, inliers: 0.4, overlapMm: 5 };

/** What the side views saw beyond the head: neck, shoulders, upper back — for showing, as points. */
export const CLOUD_LIMITS = { yMinMm: -520, yMaxMm: 140, reachMm: 330, voxelMm: 3 };

/**
 * Every point of the used holds and posture frames, placed on the face,
 * thinned to one per 3 mm cube. Unlike the cylinder, nothing is trimmed to
 * the head: this is what shows the whole neck, the shoulders and the upper
 * back from the side.
 */
export function sideCloud(frames: { T: Mat4; pts: Float32Array }[], axisZ: number): Float32Array {
  const L = CLOUD_LIMITS;
  const seen = new Set<number>();
  const out: number[] = [];
  for (const f of frames) {
    for (let p = 0; p < f.pts.length / 3; p++) {
      const [x, y, z] = apply(f.T, f.pts[p * 3]!, f.pts[p * 3 + 1]!, f.pts[p * 3 + 2]!);
      if (y < L.yMinMm || y > L.yMaxMm || Math.hypot(x, z - axisZ) > L.reachMm) continue;
      const k = (Math.floor(x / L.voxelMm) + 512) * 1048576 + (Math.floor(y / L.voxelMm) + 512) * 1024 + (Math.floor(z / L.voxelMm) + 512);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x, y, z);
    }
  }
  return Float32Array.from(out);
}

export interface RawSideFrame {
  stage: "turn" | "hold" | "posture" | "front" | "sweep";
  points: string;
  pose?: number[];
}

export interface SideStats {
  /** Frames the phone sent for this side. */
  received?: number;
  /** What the phone saw: how the stage ended, depth frames, distance. */
  diag?: { outcome?: string; depthFrames?: number; turnDepthFrames?: number; distance?: number; posture?: string };
  /** Median distance of REJECTED holds from the front scan, mm: how far off they were. */
  rejectedOverlapMm?: number | null;
  /** Posture frames (right side, a step back) that were placed and used. */
  postureUsed?: number;
  /** Holds placed but not used, and the most common reason. */
  rejected?: number;
  /** Rejected holds near enough to draw: in the model's point cloud, in no number. */
  shownOnly?: number;
  rejectReason?: HoldVerdict;
  /** Median distance of used holds from the front scan where both overlap, mm. */
  overlapMm?: number | null;
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
  diag?: Record<string, SideStats["diag"]>,
): { cyl: Cylinder; stats: { right: SideStats; left: SideStats }; cloud: Float32Array } {
  const front = mergeCyl(c);
  const cloudFrames: { T: Mat4; pts: Float32Array }[] = [];
  const model = modelPoints(front, c, axisZ);
  const frontModel = modelPoints(front, c, axisZ);
  const a = new SideCylinder(c, axisZ);
  const b = new SideCylinder(c, axisZ);
  const stats = {} as { right: SideStats; left: SideStats };
  let k = 0;
  for (const side of ["right", "left"] as const) {
    const frames: RegFrame[] = sides[side]
      .filter((f) => f.stage === "turn" || f.stage === "hold" || f.stage === "posture")
      .map((f) => ({
      stage: f.stage as RegFrame["stage"],
      pts: decodeCloud(f.points),
      pose: f.pose ? fromArkit(f.pose) : null,
    }));
    const r = registerSide(model, frames, axisZ);
    // Only holds that fit well AND agree with the front scan go in: a wrong
    // side is worse than no side, because it makes numbers up.
    let used = 0;
    const reasons = new Map<HoldVerdict, number>();
    const overlaps: number[] = [];
    const missed: number[] = [];
    let shown = 0;
    for (const placed of r.holds) {
      const h = refineOnFront(placed, frontModel, axisZ);
      const j = judgeHold(h, front, c, axisZ);
      if (j.verdict === "off the face" && j.overlapMm != null) missed.push(j.overlapMm);
      if (j.verdict === "used") {
        (k++ % 2 ? b : a).add(h.T, h.pts);
        cloudFrames.push(h);
        used++;
        overlaps.push(j.overlapMm!);
        continue;
      }
      reasons.set(j.verdict, (reasons.get(j.verdict) ?? 0) + 1);
      // Too far off to measure from, close enough to draw: the cloud only.
      if (judgeHold(h, front, c, axisZ, SHOW_LIMITS).verdict === "used") {
        cloudFrames.push(h);
        shown++;
      }
    }
    let postureUsed = 0;
    for (const placed of r.posture) {
      const p = refineOnFront(placed, frontModel, axisZ);
      if (judgeHold(p, front, c, axisZ, POSTURE_LIMITS).verdict !== "used") continue;
      cloudFrames.push(p);
      postureUsed++;
    }
    const top = [...reasons.entries()].sort((x, y) => y[1] - x[1])[0];
    stats[side] = {
      received: sides[side].length,
      ...(diag?.[side] ? { diag: diag[side] } : {}),
      aligned: r.aligned,
      lost: r.lost,
      holds: used,
      ...(missed.length ? { rejectedOverlapMm: missed.sort((x, y) => x - y)[missed.length >> 1]! } : {}),
      ...(r.posture.length ? { postureUsed } : {}),
      rejected: r.holds.length - used,
      ...(shown ? { shownOnly: shown } : {}),
      ...(top ? { rejectReason: top[0] } : {}),
      overlapMm: overlaps.length ? overlaps.sort((x, y) => x - y)[overlaps.length >> 1]! : null,
      fitMm: r.meanRmsMm,
    };
  }
  return {
    cyl: { ...c, a: mergeSides(c.a, a.medians(), c), b: mergeSides(c.b, b.medians(), c) },
    stats,
    cloud: sideCloud(cloudFrames, axisZ),
  };
}
