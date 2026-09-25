/**
 * Capture assist: turning "where is my head" into sound you can follow
 * without seeing the screen.
 *
 * The profile shot and the back camera both put the screen out of view — you
 * cannot watch a coach line while your face is turned away from it, or while
 * the phone is stuck to a wall behind you. So every frame is reduced to one
 * instruction and one error size, and the audio engine plays that:
 *
 *   - beep RATE   — how far off you are (parking sensor: faster = closer)
 *   - stereo PAN  — which way to turn (sound comes from the side to turn to)
 *   - PITCH       — up or down (higher = lift the chin, lower = drop it)
 *   - a steady HOLD tone once the frame is on target
 *
 * Everything here is pure, so the mapping is tested without a camera.
 */

import type { CaptureKind, Quality } from "./captureQuality.ts";
import { SESSION } from "./captureQuality.ts";

export type Instruction =
  | "find"      // no face in frame
  | "turn"      // rotate further toward `side`
  | "ease"      // rotated too far — come back toward `side`
  | "chinUp"
  | "chinDown"
  | "level"     // head tilted ear-to-shoulder
  | "closer"
  | "back"
  | "light"    // too dark
  | "smile"    // relax the mouth
  | "hold";    // on target

export interface Guidance {
  instruction: Instruction;
  /** The user's own left/right, for "turn" and "ease". */
  side: "left" | "right" | null;
  /** 0 = on target, 1 = far off. */
  error: number;
  /** -1 = sound from the left ear, +1 = from the right. */
  pan: number;
  /** Milliseconds between beeps. 0 = steady hold tone. */
  beepMs: number;
  /** Beep frequency. */
  pitchHz: number;
  /** What the voice would say. */
  phrase: string;
}

export interface AssistInput {
  kind: CaptureKind;
  hasFace: boolean;
  /** |yaw|, pitch, roll in degrees (pitch > 0 = chin down). */
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /**
   * Which way the user is ALREADY turned, from the landmarks, in their own
   * frame of reference. Null when the face is square to the camera.
   */
  turned: "left" | "right" | null;
  quality: Pick<Quality, "ready" | "lighting" | "reasons">;
  faceHeightFrac: number;
  smile: number;
  /** Profile steps: the side this step wants, in the user's left/right. */
  targetSide?: "left" | "right";
  /** Against the first matching scan; when present it replaces the generic framing check. */
  distance?: "closer" | "back" | "ok" | null;
}

const BASE_HZ = 660;
const UP_HZ = 880;
const DOWN_HZ = 440;

/** Fastest and slowest beep spacing. */
const MIN_BEEP = 140;
const MAX_BEEP = 950;

/**
 * Which way the user has turned, in THEIR left/right.
 *
 * Camera frames are not mirrored: whether front or back, the camera sees you
 * the way another person facing you would, so your right side is on the
 * image's LEFT. A nose tip left of the eye midpoint therefore means you have
 * turned to your right. Deliberately taken from landmarks rather than from the
 * matrix's yaw sign, which depends on axis conventions and is dropped entirely
 * on mirrored-fallback frames.
 */
export function turnedSide(
  noseTipX: number | undefined,
  leftEyeX: number | undefined,
  rightEyeX: number | undefined,
  deadZone = 0.012,
): "left" | "right" | null {
  if (noseTipX == null || leftEyeX == null || rightEyeX == null) return null;
  const off = noseTipX - (leftEyeX + rightEyeX) / 2;
  if (Math.abs(off) < deadZone) return null;
  return off < 0 ? "right" : "left";
}

const opposite = (s: "left" | "right") => (s === "left" ? "right" : "left");
const panFor = (s: "left" | "right" | null) => (s === "left" ? -1 : s === "right" ? 1 : 0);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function beepInterval(error: number): number {
  return Math.round(MIN_BEEP + clamp01(error) * (MAX_BEEP - MIN_BEEP));
}

/** The single most important correction for this frame, in priority order. */
export function guide(input: AssistInput): Guidance {
  const step = SESSION.find((s) => s.kind === input.kind) ?? SESSION[0]!;
  const out = (
    instruction: Instruction,
    error: number,
    phrase: string,
    extra: Partial<Guidance> = {},
  ): Guidance => ({
    instruction,
    side: null,
    error: clamp01(error),
    pan: 0,
    beepMs: instruction === "hold" ? 0 : beepInterval(error),
    pitchHz: BASE_HZ,
    phrase,
    ...extra,
  });

  if (!input.hasFace) {
    return out("find", 1, "I can't see your face. Move into the frame.");
  }
  if (input.quality.ready) return out("hold", 0, "Hold still.");

  // Too dark beats pose: nothing downstream means anything in a dark frame.
  if (input.quality.lighting < 0.5) {
    return out("light", 0.8, "Too dark. Turn on the flash or face a light.");
  }

  // Matching the first scan's distance beats the generic framing band: the
  // point is that this photo and that one were taken from the same place.
  if (input.distance === "closer") return out("closer", 0.35, "A little closer, to match your first scan.");
  if (input.distance === "back") return out("back", 0.35, "A little further back, to match your first scan.");

  // Framing: distance first — pose cannot be judged on a face the size of a coin.
  if (input.distance == null && input.faceHeightFrac > 0 && input.faceHeightFrac < 0.28) {
    return out("closer", clamp01((0.28 - input.faceHeightFrac) / 0.2 + 0.2), "Come a little closer.");
  }
  if (input.distance == null && input.faceHeightFrac > 0.72) {
    return out("back", clamp01((input.faceHeightFrac - 0.72) / 0.2 + 0.2), "Move back a little.");
  }

  // Yaw — the whole point of the 45° and profile steps.
  const yaw = Math.abs(input.yawDeg);
  const [lo, hi] = step.yawAbs;

  // A profile step for one side, and the head is clearly turned the other
  // way: that is not "turn more", it is "wrong side". Only once the turn is
  // unmistakable, so a head drifting through square is not told off.
  if (input.targetSide && input.turned && input.turned !== input.targetSide && yaw > 15) {
    return out("ease", clamp01(yaw / 60), `Other side. Turn your head ${input.targetSide}.`, {
      side: input.targetSide,
      pan: panFor(input.targetSide),
    });
  }
  if (yaw < lo) {
    // Keep going the way you already are; from square, the guides are drawn
    // for a turn to your right.
    // A step that names its side always sends you that way; otherwise keep
    // going the way you already are.
    const side = input.targetSide ?? input.turned ?? "right";
    const err = (lo - yaw) / Math.max(lo, 25);
    const phrase =
      step.kind === "face_front_true" ? "Hold still." : `Turn your head ${side}.`;
    if (step.kind !== "face_front_true") {
      return out("turn", err, phrase, { side, pan: panFor(side) });
    }
  }
  if (yaw > hi) {
    const back = input.turned ? opposite(input.turned) : null;
    const err = (yaw - hi) / 25;
    const phrase =
      step.kind === "face_front_true"
        ? "Face the camera."
        : back
          ? `Too far. Turn back ${back} a little.`
          : "Too far. Turn back a little.";
    return out("ease", err, phrase, { side: back, pan: panFor(back) });
  }

  // Pitch: positive = chin down.
  if (Math.abs(input.pitchDeg) > step.pitchMax) {
    const err = (Math.abs(input.pitchDeg) - step.pitchMax) / (step.pitchMax * 1.5);
    return input.pitchDeg > 0
      ? out("chinUp", err, "Chin up a little.", { pitchHz: UP_HZ })
      : out("chinDown", err, "Chin down a little.", { pitchHz: DOWN_HZ });
  }

  if (Math.abs(input.rollDeg) > step.rollMax) {
    return out("level", (Math.abs(input.rollDeg) - step.rollMax) / (step.rollMax * 2), "Level your head.");
  }

  if (input.smile > 0.65) return out("smile", 0.4, "Relax your mouth.");

  // Everything is inside its gate but the frame is not yet green (usually a
  // lighting or framing score just under the line): close, keep still.
  return out("hold", 0.15, "Almost. Keep still.", { beepMs: beepInterval(0.15) });
}

// ---------------------------------------------------------------------------
// Zoom

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The centre crop a digital zoom takes from a frame.
 *
 * Digital zoom does not remove lens distortion by itself — distortion comes
 * from being CLOSE. What it buys is the ability to stand further back and
 * still fill the frame with a face, and standing back is what flattens the
 * big-nose, narrow-jaw look of an arm's-length selfie.
 */
export function cropForZoom(width: number, height: number, zoom: number): CropRect {
  const z = Math.max(1, zoom || 1);
  const sw = Math.round(width / z);
  const sh = Math.round(height / z);
  return { sx: Math.round((width - sw) / 2), sy: Math.round((height - sh) / 2), sw, sh };
}

// ---------------------------------------------------------------------------
// Burst: sharpness and merge

/**
 * Focus measure: variance of the Laplacian over a luminance image.
 *
 * A blurred frame has soft edges, so its second derivative is small and flat;
 * a sharp one has large, varied second derivatives. The standard cheap
 * measure, and plenty to rank eight frames of the same face.
 */
export function laplacianVariance(rgba: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = 0.2126 * rgba[p]! + 0.7152 * rgba[p + 1]! + 0.0722 * rgba[p + 2]!;
  }
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = lum[i - width]! + lum[i + width]! + lum[i - 1]! + lum[i + 1]! - 4 * lum[i]!;
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

export function median(values: number[]): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

export interface RankedFrame {
  overall: number;
  sharpness: number;
}

/**
 * Order burst frames best-first: pose and light quality mostly, sharpness as
 * the tie-breaker that decides between frames the gates rate alike.
 */
export function rankFrames<T extends RankedFrame>(frames: T[]): T[] {
  const top = Math.max(1e-9, ...frames.map((f) => f.sharpness));
  const score = (f: T) => f.overall * 0.7 + (f.sharpness / top) * 0.3;
  return [...frames].sort((a, b) => score(b) - score(a));
}

/**
 * Merge a burst's symmetry readings: the median across the frames that passed
 * their gates, so one frame caught mid-blink or mid-turn cannot set the number.
 * Falls back to every frame when none passed. Null for an empty burst.
 */
export function mergeSymmetry(
  frames: { alpha: number; regional: Record<string, number>; gatesOk: boolean }[],
): { alpha: number; regional: Record<string, number>; used: number } | null {
  if (!frames.length) return null;
  const pool = frames.some((f) => f.gatesOk) ? frames.filter((f) => f.gatesOk) : frames;
  const alpha = median(pool.map((f) => f.alpha));
  if (alpha == null) return null;
  const regional: Record<string, number> = {};
  for (const key of Object.keys(pool[0]!.regional)) {
    const m = median(pool.map((f) => f.regional[key]!).filter((v) => v != null));
    if (m != null) regional[key] = m;
  }
  return { alpha, regional, used: pool.length };
}

// ---------------------------------------------------------------------------
// Distance: iris size, and matching the first scan

/** The four points round each iris in MediaPipe's 478-point mesh. */
const IRIS_RINGS = [
  [469, 470, 471, 472],
  [474, 475, 476, 477],
] as const;

/**
 * How big the iris looks, as a fraction of the frame's HEIGHT.
 *
 * The visible iris is about 11.7mm across in almost every adult, which makes
 * it a ruler that comes with the face: bigger in frame means closer to the
 * lens. Two details keep it honest:
 *
 * - The largest distance across the ring is used, not the horizontal one. A
 *   turned head squashes the iris sideways but not vertically, so the longest
 *   chord stays close to the true diameter from front to profile.
 * - x is rescaled by the frame's aspect before measuring, so the answer is in
 *   one unit rather than a mix of widths and heights.
 *
 * The nearer eye is used (the larger of the two): at 45° and in profile the
 * far iris is partly hidden behind the nose.
 */
export function irisSize(
  pts: ({ x: number; y: number } | undefined)[],
  width: number,
  height: number,
): number | null {
  if (!(width > 0) || !(height > 0) || pts.length < 478) return null;
  const aspect = width / height;
  let best = 0;
  for (const ring of IRIS_RINGS) {
    const p = ring.map((i) => pts[i]);
    if (p.some((q) => !q)) continue;
    for (let a = 0; a < p.length; a++) {
      for (let b = a + 1; b < p.length; b++) {
        const dx = (p[a]!.x - p[b]!.x) * aspect;
        const dy = p[a]!.y - p[b]!.y;
        best = Math.max(best, Math.hypot(dx, dy));
      }
    }
  }
  return best > 0 ? best : null;
}

/** How far the current distance may drift from the baseline, either way. */
export const DISTANCE_TOLERANCE = 0.06;

/**
 * Closer, back, or matched — against the first scan of this kind taken with
 * the same camera and zoom. Null when there is no baseline to match.
 *
 * Only a like-for-like baseline counts: a different lens or zoom changes how
 * big the same iris looks at the same distance, so comparing across them
 * would coach you to the wrong place.
 */
export function distanceCue(current: number | null, baseline: number | null | undefined): {
  ratio: number;
  cue: "closer" | "back" | "ok";
} | null {
  if (!current || !baseline) return null;
  const ratio = current / baseline;
  return {
    ratio,
    cue: ratio > 1 + DISTANCE_TOLERANCE ? "back" : ratio < 1 - DISTANCE_TOLERANCE ? "closer" : "ok",
  };
}
