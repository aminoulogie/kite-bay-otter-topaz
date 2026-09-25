import type { AssistAudio } from "./assist-audio.ts";
import { guide } from "./assist.ts";
import { ANALYZER_VERSION } from "./landmarks.ts";
import { depthSymmetry } from "./depthmap.ts";
import { decodeFloat32, distanceMm, extents3d, symmetry3d } from "./mesh3d.ts";
import { depthGridKey, meshKey, type DepthSummary, type ScanRecord } from "./scan-store.ts";
import { FaceDepth, MAX_DISTANCE_M, MIN_DISTANCE_M, type FaceDepthResult } from "../native/face-depth.ts";
import { saveScanImage } from "../habit-photos.ts";
import { getLocalDateKey } from "../soma/dates.ts";

/** Read the numbers off a TrueDepth result. Pure, apart from the decode. */
export function summariseDepth(r: FaceDepthResult): DepthSummary {
  const v = decodeFloat32(r.vertices);
  const sym = symmetry3d(v);
  const ext = extents3d(v);
  const raw =
    r.depthGrid && r.depthGridWidth && r.depthGridHeight && r.depthCellMm && r.depthOriginMm
      ? depthSymmetry({
          z: decodeFloat32(r.depthGrid),
          width: r.depthGridWidth,
          height: r.depthGridHeight,
          cellMm: r.depthCellMm,
          originMm: r.depthOriginMm,
        })
      : null;
  return {
    ...(raw
      ? {
          raw: {
            rmsMm: raw.rmsMm,
            p95Mm: raw.p95Mm,
            byThird: raw.byThird,
            leftMinusRightMm: raw.leftMinusRightMm,
            residualYawDeg: raw.residualYawDeg,
            depthFrames: r.depthFrames ?? 0,
            coverage: r.depthCoverage ?? 0,
          },
        }
      : {}),
    source: "truedepth",
    frames: r.frames,
    distanceMm: r.distance * 1000,
    yawDeg: r.yaw,
    pitchDeg: r.pitch,
    rollDeg: r.roll,
    ipdMm: distanceMm(r.leftEye, r.rightEye),
    symmetryRmsMm: sym?.rmsMm ?? null,
    symmetryP95Mm: sym?.p95Mm ?? null,
    symmetryByThird: sym?.byThird ?? null,
    faceWidthMm: ext?.faceWidthMm ?? null,
    meshHeightMm: ext?.meshHeightMm ?? null,
    lowerWidthMm: ext?.lowerWidthMm ?? null,
    lowerToFace: ext?.lowerToFace ?? null,
    smile: Math.max(r.blendShapes.mouthSmile_L ?? 0, r.blendShapes.mouthSmile_R ?? 0),
    jawOpen: r.blendShapes.jawOpen ?? 0,
  };
}

/**
 * Run the native scan with the app's audio coach, and store the result.
 *
 * Call `audio.enable()` in the tap that starts this — iOS only lets sound
 * start inside a gesture. The native screen streams pose ~8 times a second;
 * each frame goes through the same `guide()` as the 2D capture, so the beeps
 * and voice mean the same things in both.
 */
export async function runTrueDepthScan(audio: AssistAudio): Promise<ScanRecord> {
  const handle = await FaceDepth.addListener("faceFrame", (e) => {
    const d = e.distance;
    audio.update(
      guide({
        kind: "face_front_true",
        hasFace: e.tracked,
        yawDeg: e.yaw ?? 0,
        pitchDeg: e.pitch ?? 0,
        rollDeg: e.roll ?? 0,
        turned: null,
        quality: { ready: e.ok, lighting: 0.85, reasons: [] },
        faceHeightFrac: 0,
        smile: 0,
        distance: d == null ? null : d < MIN_DISTANCE_M ? "back" : d > MAX_DISTANCE_M ? "closer" : "ok",
      }),
    );
  });
  let result: FaceDepthResult;
  try {
    result = await FaceDepth.scan({ frames: 30, minDistance: MIN_DISTANCE_M, maxDistance: MAX_DISTANCE_M });
  } finally {
    await handle.remove();
    audio.update(null);
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await saveScanImage(meshKey(id), result.vertices);
  if (result.depthGrid) await saveScanImage(depthGridKey(id), result.depthGrid);
  if (result.image) await saveScanImage(id, result.image);

  const record: ScanRecord = {
    analyzer: ANALYZER_VERSION,
    id,
    date: getLocalDateKey(new Date()),
    capturedAt: new Date().toISOString(),
    kind: "face_front_true",
    depth: summariseDepth(result),
  };

  // The colour frame also goes through the 2D analyser, so a TrueDepth scan
  // still has the usual face metrics — and a face found in it confirms the
  // photo came out upright.
  if (result.image) {
    try {
      const [{ loadVision }, { canvasFromDataUrl, measureCanvas }] = await Promise.all([
        import("./mediapipe.ts"),
        import("./measure.ts"),
      ]);
      await loadVision();
      const m = await measureCanvas(await canvasFromDataUrl(result.image), "face_front_true");
      if (m) Object.assign(record, { face: m.analysis, skin: m.skin, puffiness: m.puffiness, harmony: m.harmony });
    } catch {
      /* the 3D numbers stand on their own */
    }
  }

  audio.cue("done");
  audio.announce("3D scan captured.");
  return record;
}
