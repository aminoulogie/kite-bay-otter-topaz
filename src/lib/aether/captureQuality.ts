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
    coach: "Keep turning until only one eye and the ear show.",
    yawAbs: [62, 98],
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
  const alignment = Math.max(0, Math.min(1, 0.5 * yawScore + 0.3 * rollScore + 0.2 * pitchScore));

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

export function faceBox(pts: Pt[]) {
  const brow = pts[FACE.glabella];
  const chin = pts[FACE.chin];
  const lt = pts[FACE.leftTragus] ?? pts[FACE.leftOuter];
  const rt = pts[FACE.rightTragus] ?? pts[FACE.rightOuter];
  if (!brow || !chin || !lt || !rt) return { x: 0.2, y: 0.15, w: 0.6, h: 0.7 };
  const x = Math.min(lt.x, rt.x) - 0.04;
  const y = brow.y - 0.08;
  return { x, y, w: Math.abs(rt.x - lt.x) + 0.08, h: chin.y - brow.y + 0.16 };
}

export function proxyPose(pts: Pt[]) {
  const li = pts[FACE.leftInner];
  const ri = pts[FACE.rightInner];
  const tip = pts[FACE.noseTip];
  const brow = pts[FACE.glabella];
  const chin = pts[FACE.chin];
  const ic = li && ri ? dist(li, ri) : 0.12;
  const mid = li && ri ? midpoint(li, ri) : { x: 0.5, y: 0.4 };
  const rollDeg = li && ri ? lineAngleVsHorizontal(li, ri) : 0;
  const yawDeg = tip ? ((tip.x - mid.x) / (ic || 0.12)) * 38 : 0;
  const expected = mid.y + ic * 0.15;
  const pitchDeg = tip ? ((tip.y - expected) / (ic || 0.12)) * 28 : 0;
  const smile = pts[FACE.leftMouth] && pts[FACE.rightMouth] ? dist(pts[FACE.leftMouth], pts[FACE.rightMouth]) / (ic || 0.12) : 0;
  void brow; void chin;
  return { rollDeg, yawDeg, pitchDeg, smile };
}
