import { analyzeFaceLandmarks, type FaceAnalysis } from "./analyzeFace.ts";
import { postureFromSideFrame, type PostureAnalysis } from "./analyzePosture.ts";
import {
  faceBox, framingFromLandmarks, proxyPose, sampleLighting, scoreCapture, type CaptureKind,
} from "./captureQuality.ts";
import { measureHarmony } from "./harmony.ts";
import {
  detectFaceTolerant, detectPose, eulerFromMatrix4, landmarksToPts, smileFromBlendshapes,
} from "./mediapipe.ts";
import { analyseSkin, puffinessRatio } from "./skin.ts";
import { ANALYZER_VERSION } from "./landmarks.ts";
import { irisSize } from "./assist.ts";
import type { ScanRecord } from "./scan-store.ts";
import { loadScanImage } from "../habit-photos.ts";

/**
 * Everything measured off one photograph.
 *
 * The live capture and the re-analysis of old scans both go through here, so
 * a scan re-measured today is measured by exactly the code that would measure
 * it if it were taken today — not by a second copy that drifts.
 */
export interface Measurement {
  analysis: FaceAnalysis;
  skin: ReturnType<typeof analyseSkin>;
  puffiness: number | null;
  harmony: ReturnType<typeof measureHarmony>;
  /** Iris size in frame heights — the distance ruler (assist.ts irisSize). */
  iris: number | null;
}

/** Face metrics from a canvas already holding the photo, or null when no face is found. */
export async function measureCanvas(canvas: HTMLCanvasElement, kind: CaptureKind): Promise<Measurement | null> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const res = await detectFaceTolerant(canvas);
  if (!res.landmarks) return null;

  const pts = landmarksToPts(res.landmarks);
  const eu = eulerFromMatrix4(res.matrix);
  const proxy = proxyPose(pts);
  const lighting = sampleLighting(canvas, faceBox(pts));
  const framing = framingFromLandmarks(pts);
  const smile = smileFromBlendshapes(res.blendshapes as never);
  const yawDeg = eu?.yawDeg ?? proxy.yawDeg;
  const rollDeg = eu?.rollDeg ?? proxy.rollDeg;
  const pitchDeg = eu?.pitchDeg ?? proxy.pitchDeg;
  const quality = scoreCapture({ kind, yawDeg, rollDeg, pitchDeg, lighting, framing, smile, hasFace: true });
  const analysis = analyzeFaceLandmarks(pts, {
    yawDeg, pitchDeg, rollDeg,
    poseSource: eu ? "matrix" : "proxy",
    lighting, framing, quality, smileBlend: smile,
  });
  // Pixel measurements come off the SAME canvas the landmarks were found on,
  // so a patch placed at a landmark lands on the skin it names.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    analysis,
    skin: analyseSkin(pixels, pts),
    puffiness: puffinessRatio(pts),
    harmony: measureHarmony(pts),
    iris: irisSize(pts, canvas.width, canvas.height),
  };
}

/**
 * Neck carriage from a profile photograph, or undefined when the photo cannot
 * support one (no shoulder in frame, no pose found, or the model failed):
 * absence, never a guess.
 *
 * The body-pose model reads an ear and a shoulder from the side far more
 * reliably than the face model reads a face, so a profile too turned for face
 * metrics can still yield a neck angle.
 */
export async function measurePosture(source: HTMLCanvasElement | HTMLImageElement): Promise<PostureAnalysis | undefined> {
  try {
    const res = await detectPose(source);
    const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    return postureFromSideFrame(res.landmarks?.[0], w, h) ?? undefined;
  } catch {
    return undefined;
  }
}

/** A stored data URL, drawn onto a fresh canvas at full resolution. */
export async function canvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0);
  return canvas;
}

/** What a re-analysis changes on a scan — merged over the stored record. */
export type ScanPatch = Partial<Pick<ScanRecord, "face" | "skin" | "puffiness" | "harmony" | "posture" | "analyzer">>;

const CAPTURE_KINDS: ReadonlySet<string> = new Set(["face_front_true", "face_front_nhp", "face_oblique", "face_side"]);

/**
 * Re-measure a stored scan with today's analyser.
 *
 * Returns null when there is nothing to re-measure (no stored photo, or a kind
 * this pipeline does not handle). When the photo no longer yields a face the
 * old face metrics are LEFT in place, still carrying their old analyser
 * version so the Face File shows what measured them — deleting a reading
 * because it cannot be reproduced would be quietly destroying data. The scan
 * is still stamped, so it is not offered for re-analysis again and again.
 */
export async function reanalyseScan(scan: ScanRecord): Promise<{ patch: ScanPatch; remeasured: boolean } | null> {
  if (!CAPTURE_KINDS.has(scan.kind)) return null;
  const dataUrl = await loadScanImage(scan.id);
  if (!dataUrl) return null;
  const kind = scan.kind as CaptureKind;
  const canvas = await canvasFromDataUrl(dataUrl);
  const m = await measureCanvas(canvas, kind);
  const posture = kind === "face_side" ? await measurePosture(canvas) : undefined;
  const patch: ScanPatch = { analyzer: ANALYZER_VERSION };
  if (m) Object.assign(patch, { face: m.analysis, skin: m.skin, puffiness: m.puffiness, harmony: m.harmony });
  // A refiled scan's old numbers were measured as the WRONG pose: unlike an
  // older analyser's reading they are not worth keeping if this one finds nothing.
  else if (scan.analyzer === "refiled") Object.assign(patch, { face: undefined, skin: undefined, puffiness: undefined, harmony: undefined });
  if (posture) patch.posture = posture;
  return { patch, remeasured: !!m || !!posture };
}
