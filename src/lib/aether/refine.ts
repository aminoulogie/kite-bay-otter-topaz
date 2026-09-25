/**
 * Re-placing the sweep's own frames by shape, then fusing them again.
 *
 * The phone fuses the front and head-move frames onto the cylinder using
 * ARKit's face pose, which wobbles by about a millimetre and a degree frame
 * to frame — so the same patch of skin lands in slightly different places
 * and the surface is smeared. Each frame is now matched to the first-pass
 * surface (point-to-plane ICP, starting from ARKit's pose) and fused again
 * at its corrected pose.
 *
 * The result is only kept if it is measurably better: its A/B noise must be
 * lower than the phone's. Otherwise the phone's surface stands.
 */

import { cellNoiseMm, faceWindow, mergeCyl, type Cylinder } from "./cylmap.ts";
import { modelPoints, SideCylinder, type RawSideFrame } from "./fullscan.ts";
import { apply, decodeCloud, fromArkit, icp, WARM, type Mat4 } from "./register.ts";

export interface RefineStats {
  frames: number;
  placed: number;
  /** A/B surface noise before and after, mm. */
  noiseBeforeMm: number | null;
  noiseAfterMm: number | null;
  used: boolean;
}

/** Head points only, placed by `T` (the frame's own pose), so shoulders cannot pull the fit. */
function headOnly(pts: Float32Array, T: Mat4, axisZ: number): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < pts.length / 3; i++) {
    const [x, y, z] = apply(T, pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
    const dz = z - axisZ;
    if (y > -140 && y < 110 && x * x + dz * dz < 130 * 130) out.push(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
  }
  return Float32Array.from(out);
}

export function refineSweep(
  c: Cylinder,
  axisZ: number,
  eyeYMm: number | null,
  frames: { pts: Float32Array; pose: Mat4 }[],
): { cyl: Cylinder; stats: RefineStats } {
  const w = faceWindow(eyeYMm);
  const before = cellNoiseMm(c, w);
  const model = modelPoints(mergeCyl(c), c, axisZ);
  const a = new SideCylinder(c, axisZ);
  const b = new SideCylinder(c, axisZ);
  let placed = 0;
  frames.forEach((f, k) => {
    const head = headOnly(f.pts, f.pose, axisZ);
    if (head.length < 900) return;
    const r = icp(model, head, f.pose, 1500, WARM);
    // ARKit is already close: a big correction or a loose fit means the
    // match went wrong, and ARKit's pose is the safer one to trust.
    if (!(r.rms <= 2 && r.inliers >= 0.6)) return;
    (k % 2 ? b : a).add(r.T, f.pts);
    placed++;
  });
  const refined: Cylinder = { ...c, a: a.medians(), b: b.medians() };
  const after = placed >= 10 ? cellNoiseMm(refined, w) : null;
  const used = before != null && after != null && after < before;
  const stats: RefineStats = { frames: frames.length, placed, noiseBeforeMm: before, noiseAfterMm: after, used };
  if (!used) return { cyl: c, stats };
  // Keep the phone's cells wherever the refined pass has none.
  const fill = (x: Float32Array, y: Float32Array) => x.map((v, i) => (Number.isFinite(v) ? v : y[i]!));
  return { cyl: { ...c, a: fill(refined.a, c.a), b: fill(refined.b, c.b) }, stats };
}

/** The plugin's raw sweep frames, decoded; frames without a pose are skipped. */
export function decodeSweepFrames(raw: RawSideFrame[]): { pts: Float32Array; pose: Mat4 }[] {
  return raw.filter((f) => f.pose).map((f) => ({ pts: decodeCloud(f.points), pose: fromArkit(f.pose!) }));
}
