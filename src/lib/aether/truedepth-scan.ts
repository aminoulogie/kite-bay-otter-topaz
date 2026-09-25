import type { AssistAudio } from "./assist-audio.ts";
import { guide } from "./assist.ts";
import { ANALYZER_VERSION } from "./landmarks.ts";
import { depthSymmetry } from "./depthmap.ts";
import { compareCyl, faceWindow, mergeCyl, summariseCylinder, type Cylinder } from "./cylmap.ts";
import { extendWithSides, type SideStats } from "./fullscan.ts";
import { alignOnAnchors } from "./align3d.ts";
import { decodeSweepFrames, refineSweep, type RefineStats } from "./refine.ts";
import type { Guidance } from "./assist.ts";
import { decodeFloat32, distanceMm, extents3d, symmetry3d } from "./mesh3d.ts";
import { cloudKey, cylKey, depthGridKey, meshKey, type DepthSummary, type ScanRecord } from "./scan-store.ts";
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
  // Steering onto the next move's target: beeps quicken as the head nears
  // it, come from the side to turn to, and rise for up / fall for down —
  // the same sound language as the rest of the coach.
  if (e.ok && e.targetDir) {
    const error = Math.max(0.05, Math.min(1, (e.targetError ?? 30) / 30));
    const dir = e.targetDir;
    return {
      instruction: dir === "up" ? "chinUp" : dir === "down" ? "chinDown" : "turn",
      side: dir === "left" || dir === "right" ? dir : null,
      error,
      pan: dir === "right" ? 1 : dir === "left" ? -1 : 0,
      beepMs: Math.round(140 + error * 810),
      pitchHz: dir === "up" ? 880 : dir === "down" ? 440 : 660,
      phrase: e.message,
    };
  }
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

/** Float32Array → base64, for storing a cylinder the web side built. */
function encodeFloat32(a: Float32Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The surface the summary reads, when the web side improved on the phone's: re-placed frames and/or sides. */
type Extended = { cyl: Cylinder; stats: { right: SideStats; left: SideStats } | null; cloud?: Float32Array } | null;

/** The side stages: slow beeps while turning, the steady hold tone when still. */
export function sideGuidance(e: FaceFrameEvent): Guidance {
  const holding = e.phase === "holdRight" || e.phase === "holdLeft" || e.phase === "holdPosture";
  const error = holding && e.ok ? 0 : holding ? 0.4 : 0.8;
  return {
    instruction: error === 0 ? "hold" : "turn",
    side: e.phase === "turnRight" ? "right" : e.phase === "turnLeft" ? "left" : null,
    error,
    pan: e.phase === "turnRight" ? 1 : e.phase === "turnLeft" ? -1 : 0,
    beepMs: error === 0 ? 0 : Math.round(140 + error * 810),
    pitchHz: 660,
    phrase: e.message,
  };
}

/** Read the numbers off a TrueDepth result. Pure, apart from the decode. */
export function summariseDepth(r: FaceDepthResult, extended: Extended = null): DepthSummary {
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
      const c = extended?.cyl ?? cylinderOf(r);
      const full = r.sides
        ? { axisZ: r.cylAxisZMm ?? -60, gravityFace: r.gravityFace ?? null, sides: extended?.stats ?? null }
        : undefined;
      return c ? { sweep: summariseCylinder(c, eyeY(r), r.cylFrames ?? 0, r.sweepCoverage ?? 0, full) } : {};
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
  const eyeY = (p.eyeYMm + eye) / 2;
  // Line the two up on forehead and nose bridge first (align3d.ts), so a
  // different nod or shift is not counted as change.
  const cur = mergeCyl(c);
  const aligned = alignOnAnchors(prev, cur, c, -60, eyeY);
  const change = compareCyl(prev, aligned?.map ?? cur, c, faceWindow(eyeY));
  return change ? { ...change, firstId: first.id, ...(aligned ? { anchorRmsMm: aligned.anchorRmsMm } : {}) } : undefined;
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
  mode: "still" | "sweep" | "full" = "still",
  history: ScanRecord[] = [],
): Promise<{ record: ScanRecord; extra: ScanRecord[] }> {
  const sweep = mode !== "still";
  let lastPhase: string | undefined;
  let looks = 0;
  const handle = await FaceDepth.addListener("faceFrame", (e) => {
    // The side stages happen facing away from the screen: every change of
    // stage is spoken, and holding still gets the steady tone.
    if (e.phase && e.phase !== lastPhase) {
      if (e.phase !== "front" && e.phase !== "sweep") audio.announce(e.message);
      if (e.phase === "holdRight" || e.phase === "holdLeft" || e.phase === "holdPosture") audio.cue("target");
      lastPhase = e.phase;
    }
    // A chime as each of the four head moves is done.
    if (e.looksDone != null && e.looksDone > looks) {
      looks = e.looksDone;
      audio.cue("capture");
    }
    if (e.phase && e.phase !== "front") {
      audio.update(e.phase === "sweep" ? sweepGuidance(e) : sideGuidance(e));
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
      ? await FaceDepth.scan({
          mode: "sweep",
          sides: mode === "full",
          frames: 30,
          minDistance: SWEEP_MIN_DISTANCE_M,
          maxDistance: SWEEP_MAX_DISTANCE_M,
        })
      : await FaceDepth.scan({ frames: 30, minDistance: MIN_DISTANCE_M, maxDistance: MAX_DISTANCE_M });
  } finally {
    await handle.remove();
    audio.update(null);
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await saveScanImage(meshKey(id), result.vertices);
  if (result.depthGrid) await saveScanImage(depthGridKey(id), result.depthGrid);
  const raw = cylinderOf(result);
  // Placing the side frames is a few seconds of maths; say so rather than sit silent.
  if (raw && result.sides) {
    audio.announce("Building your 3D model.");
    await new Promise((r) => setTimeout(r, 60)); // let the screen and voice update first
  }
  // First re-place the sweep's own frames by shape (refine.ts); the sides are
  // then matched to that sharper surface.
  let refine: RefineStats | null = null;
  let base = raw;
  if (raw && result.sweepFrames?.length) {
    const r = refineSweep(raw, result.cylAxisZMm ?? -60, eyeY(result), decodeSweepFrames(result.sweepFrames));
    refine = r.stats;
    base = r.cyl;
  }
  const ext: Extended = base && result.sides ? extendWithSides(base, result.cylAxisZMm ?? -60, result.sides, result.sideDiag) : null;
  const cyl = ext?.cyl ?? base;
  const cloud = ext?.cloud ?? null;
  if (cloud && cloud.length) await saveScanImage(cloudKey(id), encodeFloat32(cloud));
  if (cyl) {
    const stored: StoredCylinder = {
      a: encodeFloat32(cyl.a), b: encodeFloat32(cyl.b), width: cyl.width, height: cyl.height, thetaMinDeg: cyl.thetaMinDeg,
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
    depth: {
      ...summariseDepth(result, ext ?? (base && base !== raw ? { cyl: base, stats: null } : null)),
      ...(refine ? { refine } : {}),
    },
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
