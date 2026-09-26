/**
 * Head pose, in degrees, from MediaPipe's facial transformation matrix.
 *
 * ## The bug this replaces
 *
 * The first version decomposed the matrix as Z-Y-X (aircraft order) and named
 * the angles as if Z were vertical:
 *
 *   yaw = atan2(r10, r00)   ← rotation about Z
 *   pitch = asin(-r20)      ← rotation about Y
 *   roll = atan2(r21, r22)  ← rotation about X
 *
 * MediaPipe's metric space has Y pointing UP, not Z. So a head turned 45° —
 * a rotation about the vertical axis — came out as "pitch 45°, yaw 0°", and a
 * head tilted ear-to-shoulder came out as yaw. Every step graded against the
 * wrong number: the 45° and profile steps waited forever for a yaw that never
 * arrived while telling you to move your chin, and a slightly turned head
 * could pass the front gate and get a symmetry score. Only the mirrored
 * fallback, which ignores the matrix, behaved.
 *
 * ## What it is now
 *
 * The rotation is read as R = Ry(yaw) · Rx(pitch) · Rz(roll): turn, then nod,
 * then tilt — the order a head actually moves in, and the one that keeps yaw
 * exact at large turns (which is the whole point of the 45° and profile
 * steps). For that order:
 *
 *   pitch = asin(-r12)
 *   yaw   = atan2(r02, r22)
 *   roll  = atan2(r10, r11)
 *
 * Signs, in MediaPipe's space (X right, Y up, Z toward the camera):
 *   yaw   > 0 — face turned toward image right
 *   pitch > 0 — face tilted down (chin down), matching the landmark proxy
 *   roll  > 0 — rotation from +X toward +Y
 *
 * The capture gates use magnitudes for yaw and roll, so those signs only
 * matter for labelling; pitch's sign drives the "chin up / chin down" coach.
 */

export interface HeadAngles {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

const DEG = 180 / Math.PI;

/** Column-major 4x4 (as MediaPipe emits it) → element at row i, column j. */
function at(m: number[], i: number, j: number) {
  return m[j * 4 + i];
}

export function eulerFromMatrix4(m?: number[]): HeadAngles | null {
  if (!m || m.length < 16) return null;

  // Strip any scale so only rotation is decomposed. The matrix is documented
  // as rigid, but a stray scale would silently bend every angle below.
  const cols = [0, 1, 2].map((j) => Math.hypot(at(m, 0, j), at(m, 1, j), at(m, 2, j)));
  if (cols.some((c) => !Number.isFinite(c) || c < 1e-9)) return null;
  const r = (i: number, j: number) => at(m, i, j) / cols[j];

  const s = Math.max(-1, Math.min(1, -r(1, 2)));
  const pitchDeg = Math.asin(s) * DEG;
  const yawDeg = Math.atan2(r(0, 2), r(2, 2)) * DEG;
  const rollDeg = Math.atan2(r(1, 0), r(1, 1)) * DEG;

  if (![yawDeg, pitchDeg, rollDeg].every(Number.isFinite)) return null;
  return { yawDeg, pitchDeg, rollDeg };
}
