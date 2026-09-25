import type { AssistAudio } from "./assist-audio.ts";
import { guide } from "./assist.ts";
import { ANALYZER_VERSION } from "./landmarks.ts";
import { depthSymmetry } from "./depthmap.ts";
import { compareCyl, faceWindow, mergeCyl, summariseCylinder, type Cylinder } from "./cylmap.ts";
import type { Guidance } from "./assist.ts";
import { decodeFloat32, distanceMm, extents3d, symmetry3d } from "./mesh3d.ts";
import { cylKey, depthGridKey, meshKey, type DepthSummary, type ScanRecord } from "./scan-store.ts";
import {
  FaceDepth, MAX_DISTANCE_M, MIN_DISTANCE_M, SWEEP_MAX_DISTANCE_M, SWEEP_MIN_DISTANCE_M,
  type FaceDepthResult, type FaceFrameEvent,
} from "../native/face-depth.ts";
import { loadScanImage, saveScanImage } from "../habit-photos.ts";
import { getLocalDateKey } from "../soma/dates.ts";

/** The sweep's cylinders, decoded; null for a still scan. */
export function cylinderOf(r: FaceDepthResult): Cylinder | null {
  if (!r.cylA || !r.cylB || !r.cylWidth || !r.cylHeight) return null;
  return {
    a: decodeFloat32(r.cylA),
    b: decodeFloat32(r.cylB),
    width: r.cylWidth,
    height: r.cylHeight,
    thetaMinDeg: r.cylThetaMinDeg ?? -100,
    thetaStepDeg: r.cylThetaStepDeg ?? 1,
    yMinMm: r.cylYMinMm ?? -130,
    yStepMm: r.cylYStepMm ?? 1.5,
  };
}

/** Eye height in the face's axes, mm — sets the window the sweep is read in. */
const eyeY = (r: FaceDepthResult) => (r.leftEye[1] + r.rightEye[1]) / 2;

/**
 * Sweep audio: the ring fills as directions are covered, so beeps quicken as
 * it fills — the same "faster = closer" as the rest of the coach.
 */
export function sweepGuidance(e: FaceFrameEvent): Guidance {
  const done = e.target ? e.collected / e.target : 0;
  const error = e.ok ? Math.max(0.05, 1 - done) : 0.9;
  return {
    instruction: e.ok ? "turn" : "find",
    side: null,
    error,
    pan: 0,
    beepMs: Math.round(140 + error * 810),
    pitchHz: 660,
    phrase: e.message,
  };
}

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
    ...(() => {
      const c = cylinderOf(r);
      return c ? { sweep: summariseCylinder(c, eyeY(r), r.cylFrames ?? 0, r.sweepCoverage ?? 0) } : {};
    })(),
  };
}

interface StoredCylinder {
  a: string;
  b: string;
  width: number;
  height: number;
  thetaMinDeg: number;
  thetaStepDeg: number;
  yMinMm: number;
  yStepMm: number;
  eyeYMm: number;
}

/**
 * Change against the FIRST sweep, not the last: comparing each scan only
 * with the one before lets small errors add up unseen over months.
 */
async function changeVsFirst(scans: ScanRecord[], c: Cylinder, eye: number): Promise<DepthSummary["changeVsFirst"]> {
  const first = scans
    .filter((x) => x.depth?.sweep)
    .reduce<ScanRecord | null>((a, b) => (!a || b.capturedAt < a.capturedAt ? b : a), null);
  if (!first) return undefined;
  const raw = await loadScanImage(cylKey(first.id));
  if (!raw) return undefined;
  const p = JSON.parse(raw) as StoredCylinder;
  if (p.width !== c.width || p.height !== c.height) return undefined;
  const prev = mergeCyl({ ...c, a: decodeFloat32(p.a), b: decodeFloat32(p.b) });
  const change = compareCyl(prev, mergeCyl(c), c, faceWindow((p.eyeYMm + eye) / 2));
  return change ? { ...change, firstId: first.id } : undefined;
}

/**
 * Run the native scan with the app's audio coach, and store the result.
 *
 * Call `audio.enable()` in the tap that starts this — iOS only lets sound
 * start inside a gesture. The native screen streams pose ~8 times a second;
 * each frame goes through the same `guide()` as the 2D capture, so the beeps
 * and voice mean the same things in both.
 */
export async function runTrueDepthScan(
  audio: AssistAudio,
  mode: "still" | "sweep" = "still",
  history: ScanRecord[] = [],
): Promise<{ record: ScanRecord; extra: ScanRecord[] }> {
  const sweep = mode === "sweep";
  const handle = await FaceDepth.addListener("faceFrame", (e) => {
    if (e.phase === "sweep") {
      audio.update(sweepGuidance(e));
      return;
    }
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
    if (sweep) audio.announce("Look straight at the screen, then slowly circle your head.");
    result = sweep
      ? await FaceDepth.scan({ mode, frames: 30, minDistance: SWEEP_MIN_DISTANCE_M, maxDistance: SWEEP_MAX_DISTANCE_M })
      : await FaceDepth.scan({ frames: 30, minDistance: MIN_DISTANCE_M, maxDistance: MAX_DISTANCE_M });
  } finally {
    await handle.remove();
    audio.update(null);
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await saveScanImage(meshKey(id), result.vertices);
  if (result.depthGrid) await saveScanImage(depthGridKey(id), result.depthGrid);
  const cyl = cylinderOf(result);
  if (cyl && result.cylA && result.cylB) {
    const stored: StoredCylinder = {
      a: result.cylA, b: result.cylB, width: cyl.width, height: cyl.height, thetaMinDeg: cyl.thetaMinDeg,
      thetaStepDeg: cyl.thetaStepDeg, yMinMm: cyl.yMinMm, yStepMm: cyl.yStepMm, eyeYMm: eyeY(result),
    };
    await saveScanImage(cylKey(id), JSON.stringify(stored));
  }
  if (result.image) await saveScanImage(id, result.image);

  const record: ScanRecord = {
    analyzer: ANALYZER_VERSION,
    id,
    date: getLocalDateKey(new Date()),
    capturedAt: new Date().toISOString(),
    kind: "face_front_true",
    depth: summariseDepth(result),
  };
  if (cyl && record.depth) {
    const change = await changeVsFirst(history, cyl, eyeY(result)).catch(() => undefined);
    if (change) record.depth.changeVsFirst = change;
  }

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

  // The sweep's ~40° frames become ordinary 45° scans, measured by the same
  // 2D pipeline as a camera capture, so that slot fills in the same pass.
  const extra: ScanRecord[] = [];
  for (const o of result.obliques ?? []) {
    try {
      const [{ loadVision }, { canvasFromDataUrl, measureCanvas }] = await Promise.all([
        import("./mediapipe.ts"),
        import("./measure.ts"),
      ]);
      await loadVision();
      const m = await measureCanvas(await canvasFromDataUrl(o.image), "face_oblique");
      const oid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await saveScanImage(oid, o.image);
      extra.push({
        analyzer: ANALYZER_VERSION,
        id: oid,
        date: record.date,
        capturedAt: new Date().toISOString(),
        kind: "face_oblique",
        ...(m ? { face: m.analysis, skin: m.skin, puffiness: m.puffiness, harmony: m.harmony } : {}),
      });
    } catch {
      /* a missing 45° photo does not spoil the 3D scan */
    }
  }

  audio.cue("done");
  audio.announce(sweep ? "3D sweep captured." : "3D scan captured.");
  return { record, extra };
}
