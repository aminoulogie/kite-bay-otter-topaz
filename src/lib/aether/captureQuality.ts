import type { Pt } from "./geometry.ts";
import { dist, lineAngleVsHorizontal, midpoint } from "./geometry.ts";
import { FACE } from "./landmarks.ts";

export type CaptureKind = "face_front_true" | "face_front_nhp" | "face_oblique" | "face_side";

export type LightingReport = {
  grade: "good" | "uneven" | "dark" | "harsh" | "unknown";
  mean: number;
  contrast: number;
  leftRightDelta: number;
  highlightPct: number;
  shadowPct: number;
  notes: string[];
};

export type FramingReport = {
  faceHeightFrac: number;
  eyesY: number;
  centerX: number;
  notes: string[];
};

export type Quality = {
  alignment: number;
  lighting: number;
  framing: number;
  overall: number;
  ready: boolean;
  coach: string;
  reasons: string[];
};

export const SESSION: {
  kind: CaptureKind;
  title: string;
  short: string;
  coach: string;
  yawAbs: [number, number];
  rollMax: number;
  pitchMax: number;
}[] = [
  {
    kind: "face_front_true",
    title: "1 · Front",
    short: "Front",
    coach: "Look into the lens. Eyes on the marks. Jaw unclenched.",
    yawAbs: [0, 8],
    rollMax: 2.5,
    pitchMax: 8,
  },
  {
    kind: "face_oblique",
    title: "2 · 45°",
    short: "45°",
    coach: "Turn your head until the far eye sits near the nose line.",
    yawAbs: [28, 56],
    rollMax: 5,
    pitchMax: 12,
  },
  {
    kind: "face_side",
    title: "3 · Profile",
    short: "Side",
    // Was "keep turning until only one eye and the ear show", which is a full
    // 90° — and 90° is exactly where the landmark model stops being able to
    // see a face at all. A shot you cannot take is worth less than a slightly
    // less side-on one you can, so the target stops short of the cliff.
    // The landmark model is trained on frontal faces and simply proposes no
    // face at a hard yaw — so the coaching has to aim at the last angle it can
    // still read, not at the anatomically ideal one. Past this the photo is
    // still kept; the measurements are not.
    coach: "Turn until the far eyebrow just disappears — no further, or it stops reading.",
    yawAbs: [52, 90],
    rollMax: 8,
    pitchMax: 14,
  },
];

export function sampleLighting(canvas: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }): LightingReport {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const notes: string[] = [];
  if (!ctx) return { grade: "unknown", mean: 0, contrast: 0, leftRightDelta: 0, highlightPct: 0, shadowPct: 0, notes: ["No pixels."] };
  const x = Math.max(0, Math.floor(box.x * canvas.width));
  const y = Math.max(0, Math.floor(box.y * canvas.height));
  const w = Math.max(8, Math.min(canvas.width - x, Math.floor(box.w * canvas.width)));
  const h = Math.max(8, Math.min(canvas.height - y, Math.floor(box.h * canvas.height)));
  let img: ImageData;
  try { img = ctx.getImageData(x, y, w, h); }
  catch { return { grade: "unknown", mean: 0, contrast: 0, leftRightDelta: 0, highlightPct: 0, shadowPct: 0, notes: ["Pixel read blocked."] }; }
  const d = img.data;
  let sum = 0, sum2 = 0, n = 0, hi = 0, sh = 0, left = 0, right = 0, ln = 0, rn = 0;
  for (let i = 0; i < d.length; i += 16) {
    const px = ((i / 4) % w);
    const yv = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += yv; sum2 += yv * yv; n++;
    if (yv > 245) hi++;
    if (yv < 18) sh++;
    if (px < w / 2) { left += yv; ln++; } else { right += yv; rn++; }
  }
  const mean = n ? sum / n : 0;
  const contrast = n ? Math.sqrt(Math.max(0, sum2 / n - mean * mean)) : 0;
  const leftRightDelta = (ln && rn) ? Math.abs(left / ln - right / rn) : 0;
  const highlightPct = n ? hi / n : 0;
  const shadowPct = n ? sh / n : 0;
  let grade: LightingReport["grade"] = "good";
  if (mean < 55) { grade = "dark"; notes.push("Face is underexposed. Face a window or lamp."); }
  else if (highlightPct > 0.12 || mean > 210) { grade = "harsh"; notes.push("Highlights clipped. Soften the light or step back from the lamp."); }
  else if (leftRightDelta > 38) { grade = "uneven"; notes.push("One side is much brighter. Turn so light hits both cheeks."); }
  else if (contrast < 12) { notes.push("Flat light — usable, but texture will look washed."); }
  else notes.push("Light is even enough for a metric frame.");
  return { grade, mean, contrast, leftRightDelta, highlightPct, shadowPct, notes };
}

export function framingFromLandmarks(pts: Pt[]): FramingReport {
  const notes: string[] = [];
  const brow = pts[FACE.glabella];
  const chin = pts[FACE.chin];
  const li = pts[FACE.leftInner];
  const ri = pts[FACE.rightInner];
  const faceHeightFrac = brow && chin ? Math.abs(chin.y - brow.y) : 0;
  const eyesY = li && ri ? (li.y + ri.y) / 2 : 0.42;
  const centerX = li && ri ? (li.x + ri.x) / 2 : 0.5;
  if (faceHeightFrac < 0.28) notes.push("Move closer — face should fill about half the frame.");
  else if (faceHeightFrac > 0.72) notes.push("Step back — chin and hairline are clipped.");
  if (eyesY < 0.22) notes.push("Drop the camera. Eyes should sit on the upper marks.");
  else if (eyesY > 0.52) notes.push("Raise the camera to eye height.");
  if (Math.abs(centerX - 0.5) > 0.14) notes.push("Slide the phone so the face sits on the midline.");
  return { faceHeightFrac, eyesY, centerX, notes };
}

export function scoreCapture(opts: {
  kind: CaptureKind;
  yawDeg: number;
  rollDeg: number;
  pitchDeg: number;
  lighting: LightingReport;
  framing: FramingReport;
  smile: number;
  hasFace: boolean;
}): Quality {
  const step = SESSION.find((s) => s.kind === opts.kind) ?? SESSION[0];
  const reasons: string[] = [];
  if (!opts.hasFace) {
    return { alignment: 0, lighting: 0, framing: 0, overall: 0, ready: false, coach: "No face. Fill the oval.", reasons: ["No face."] };
  }
  const yawAbs = Math.abs(opts.yawDeg);
  const rollAbs = Math.abs(opts.rollDeg);
  const pitchAbs = Math.abs(opts.pitchDeg);
  let yawScore = 1;
  if (yawAbs < step.yawAbs[0]) {
    yawScore = yawAbs / Math.max(1, step.yawAbs[0]);
    reasons.push(step.kind === "face_front_true" ? "Hold still — almost front." : `Turn more toward ${step.short}.`);
  } else if (yawAbs > step.yawAbs[1]) {
    yawScore = Math.max(0, 1 - (yawAbs - step.yawAbs[1]) / 25);
    reasons.push(step.kind === "face_front_true" ? "Face the lens. You are turned." : "You over-rotated. Ease back.");
  }
  const rollScore = Math.max(0, 1 - rollAbs / (step.rollMax * 2.2));
  if (rollAbs > step.rollMax) reasons.push(`Level the phone / head. Roll ${rollAbs.toFixed(1)}°.`);
  const pitchScore = Math.max(0, 1 - pitchAbs / (step.pitchMax * 2.2));
  if (pitchAbs > step.pitchMax) reasons.push(opts.pitchDeg > 0 ? "Chin down a little." : "Chin up a little.");
  /**
   * Yaw GATES alignment; roll and pitch only trim it.
   *
   * A weighted sum let a barely-turned head pass the profile step: at 30° yaw
   * the yaw term scored 0.58, and a level head handed back the other half of
   * the score for free, so alignment cleared 0.7 and the shutter fired on a
   * shot that is not a profile at all. Multiplying instead says the true
   * thing — if the head is at the wrong angle, how level it is cannot rescue
   * the frame, because the measurement being taken is of the angle.
   */
  const alignment = Math.max(
    0,
    Math.min(1, yawScore * (0.6 + 0.25 * rollScore + 0.15 * pitchScore)),
  );

  let lighting = 0.85;
  if (opts.lighting.grade === "dark") lighting = 0.25;
  else if (opts.lighting.grade === "harsh") lighting = 0.4;
  else if (opts.lighting.grade === "uneven") lighting = 0.55;
  else if (opts.lighting.grade === "unknown") lighting = 0.5;
  if (opts.lighting.grade !== "good") reasons.push(opts.lighting.notes[0]);

  let framing = 1;
  if (opts.framing.faceHeightFrac < 0.28) framing -= 0.45;
  if (opts.framing.faceHeightFrac > 0.72) framing -= 0.35;
  if (opts.framing.eyesY < 0.22 || opts.framing.eyesY > 0.52) framing -= 0.2;
  if (step.kind === "face_front_true" && Math.abs(opts.framing.centerX - 0.5) > 0.14) framing -= 0.2;
  framing = Math.max(0, framing);
  reasons.push(...opts.framing.notes);

  if (opts.smile > 0.65) reasons.push("Rest the mouth. No smile for metric frames.");

  const overall = Math.max(0, Math.min(1, alignment * 0.46 + lighting * 0.28 + framing * 0.26 - (opts.smile > 0.65 ? 0.2 : 0)));
  const ready = overall >= 0.72 && alignment >= 0.7 && lighting >= 0.5 && opts.smile <= 0.65;
  const coach = ready ? "Hold. Green. Capture." : (reasons[0] || step.coach);
  return { alignment, lighting, framing, overall, ready, coach, reasons: reasons.slice(0, 4) };
}

/**
 * The rectangle lighting is sampled from.
 *
 * Guards the profile case. The width used to come from the two tragus points,
 * which converge as the head turns and very nearly coincide at full profile —
 * so the box collapsed to a sliver and the LIGHT reading was taken from a
 * couple of pixels beside the ear. That is why the lighting chip was wrong on
 * exactly the two steps where it was hardest to notice.
 *
 * Face height barely changes with yaw, so a box that has degenerated in width
 * is rebuilt from the height instead.
 */
export function faceBox(pts: Pt[]) {
  const brow = pts[FACE.glabella];
  const chin = pts[FACE.chin];
  const lt = pts[FACE.leftTragus] ?? pts[FACE.leftOuter];
  const rt = pts[FACE.rightTragus] ?? pts[FACE.rightOuter];
  if (!brow || !chin || !lt || !rt) return { x: 0.2, y: 0.15, w: 0.6, h: 0.7 };

  const h = Math.abs(chin.y - brow.y) + 0.16;

  // Spanned across everything visible rather than ear to ear. At profile the
  // two tragus points nearly coincide while the face still extends forward to
  // the nose, so an ear-to-ear box is both a sliver AND in the wrong place —
  // it would sample the light beside the head instead of on it.
  const xs = [lt.x, rt.x, brow.x, chin.x];
  const tip = pts[FACE.noseTip];
  if (tip) xs.push(tip.x);
  const lo = pts[FACE.leftOuter];
  const ro = pts[FACE.rightOuter];
  if (lo) xs.push(lo.x);
  if (ro) xs.push(ro.x);

  const lowest = Math.min(...xs) - 0.03;
  const highest = Math.max(...xs) + 0.03;
  const seen = highest - lowest;
  // A face is roughly two-thirds as wide as tall head-on. Well below that the
  // width is foreshortening, and the box is padded around its own centre.
  const minW = h * 0.3;
  const w = Math.max(seen, minW);
  const centre = (lowest + highest) / 2;
  return { x: centre - w / 2, y: brow.y - 0.08, w, h };
}

/**
 * Head pose from landmarks alone, for when the transform matrix is absent.
 *
 * ## The bug this replaces
 *
 * Yaw used to be the nose tip's offset from the eye midpoint, divided by the
 * INTERCANTHAL DISTANCE, times 38. That is fine at front and nonsense
 * everywhere else, because the denominator foreshortens as you turn: by 45°
 * the gap between the inner eye corners has visibly shrunk, so the quotient
 * inflates, and near profile the two corners almost coincide and it runs away
 * entirely. The 45° and profile steps were being graded against a number that
 * could read past 100°.
 *
 * The replacement is bounded by construction. Nose tip sits between the two
 * outer eye corners; as the head turns, the gap on one side grows and the
 * other shrinks. Their normalised difference runs from 0 at true front to ±1
 * at full profile and cannot exceed it, whatever the foreshortening does,
 * because the same shrinking appears in both the numerator and the denominator
 * and cancels.
 *
 * Pitch and the smile proxy are normalised by FACE HEIGHT rather than by the
 * eye gap for the same reason — a vertical span barely foreshortens with yaw,
 * an inter-eye span does.
 */
export function proxyPose(pts: Pt[]) {
  const li = pts[FACE.leftInner];
  const ri = pts[FACE.rightInner];
  const lo = pts[FACE.leftOuter];
  const ro = pts[FACE.rightOuter];
  const tip = pts[FACE.noseTip];
  const brow = pts[FACE.glabella];
  const chin = pts[FACE.chin];

  const mid = li && ri ? midpoint(li, ri) : { x: 0.5, y: 0.4 };
  const rollDeg = li && ri ? lineAngleVsHorizontal(li, ri) : 0;

  // A vertical scale, which yaw does not squash.
  const faceH = brow && chin ? Math.abs(chin.y - brow.y) : 0.32;
  const scale = faceH || 0.32;

  let yawDeg = 0;
  if (tip && lo && ro) {
    // SIGNED, not absolute. Near profile the nose tip projects past the far
    // eye corner, so that gap genuinely goes negative — taking the magnitude
    // instead makes the measure fold back on itself and a full profile reads
    // like a front face, which is worse than the bug it replaced.
    const dLeft = tip.x - lo.x;
    const dRight = ro.x - tip.x;
    // Divided by face HEIGHT, which a turn barely shortens. Every horizontal
    // span on a face collapses as it rotates, so any of them in a denominator
    // is the original bug wearing a different hat. The constant maps a full
    // profile onto 90° and is close to linear in between.
    yawDeg = Math.max(-90, Math.min(90, ((dLeft - dRight) / scale) * 200));
  }

  // Where the nose tip sits vertically against a face-height reference.
  const expected = mid.y + scale * 0.16;
  const pitchDeg = tip ? ((tip.y - expected) / scale) * 34 : 0;

  const lm = pts[FACE.leftMouth];
  const rm = pts[FACE.rightMouth];
  const smile = lm && rm ? (dist(lm, rm) / scale) * 2.2 : 0;

  return { rollDeg, yawDeg, pitchDeg, smile };
}
