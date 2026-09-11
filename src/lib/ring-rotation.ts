/**
 * Turning the day under your thumb.
 *
 * Rotating a ring looks like one number and is really three problems, all of
 * them about the seam at 360°:
 *
 *  1. **The delta.** A finger dragging from 359° to 1° moved two degrees
 *     forward, not 358 backwards. Subtracting raw angles gets this wrong once
 *     per revolution, and the ring kicks violently the wrong way.
 *  2. **The wrap.** The stored rotation has to stay bounded or it drifts to a
 *     number where float precision starts to show, after a few thousand
 *     flicks.
 *  3. **The release.** A ring that stops dead the instant you lift is a ring
 *     that feels stuck to the glass. It should carry on and settle.
 *
 * All three are pure arithmetic, so all three are tested here rather than
 * found later on a phone.
 */

/** Any angle, expressed once, in [0, 360). */
export function wrapAngle(deg: number): number {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

/** The angle of a point from a centre: 0° at the top, clockwise. */
export function angleFrom(cx: number, cy: number, x: number, y: number): number {
  const rad = Math.atan2(y - cy, x - cx);
  return wrapAngle((rad * 180) / Math.PI + 90);
}

/**
 * How far it turned, signed, taking the short way round.
 *
 * The whole point: 359° → 1° is +2, never −358.
 */
export function deltaAngle(from: number, to: number): number {
  let d = wrapAngle(to) - wrapAngle(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** How far from the centre, for deciding whether a touch is on the ring at all. */
export function radiusFrom(cx: number, cy: number, x: number, y: number): number {
  return Math.hypot(x - cx, y - cy);
}

/** Per-frame decay of a flick. Below FLING_STOP it has arrived. */
export const FLING_DECAY = 0.94;
export const FLING_STOP = 0.02;

/** Faster than this and the release is a flick rather than a placement. */
export const FLING_MIN = 0.12;

/**
 * One frame of settling.
 *
 * Returns the new velocity, or 0 once it is close enough to stopped that
 * another frame would only be spending battery.
 */
export function decay(velocity: number): number {
  const v = Number(velocity) || 0;
  const next = v * FLING_DECAY;
  return Math.abs(next) < FLING_STOP ? 0 : next;
}

/**
 * Degrees per millisecond from the last few samples.
 *
 * Averaged over a short window rather than taken from the final pair: the last
 * two points before a finger lifts are often a millisecond apart, and dividing
 * by that produces a velocity that flings the ring across the screen.
 */
export interface Sample {
  angle: number;
  t: number;
}

export const VELOCITY_WINDOW_MS = 80;

export function velocityFrom(samples: Sample[]): number {
  const list = samples ?? [];
  if (list.length < 2) return 0;
  const last = list[list.length - 1]!;
  let first = list[0]!;
  for (let i = list.length - 1; i >= 0; i--) {
    first = list[i]!;
    if (last.t - list[i]!.t >= VELOCITY_WINDOW_MS) break;
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return deltaAngle(first.angle, last.angle) / dt;
}

/** Which hour of the day sits at the focus mark, given the ring's rotation. */
export function hourAtTop(rotation: number, dayStart = 0): number {
  const deg = wrapAngle(-rotation);
  return (deg / 15 + (Number(dayStart) || 0)) % 24;
}

/** The rotation that would bring an hour to the focus mark. */
export function rotationForHour(hour: number, dayStart = 0): number {
  const h = (Number(hour) || 0) - (Number(dayStart) || 0);
  return wrapAngle(-h * 15);
}
