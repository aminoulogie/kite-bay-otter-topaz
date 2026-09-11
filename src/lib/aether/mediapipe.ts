import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Pt } from "./geometry.ts";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let face: FaceLandmarker | null = null;
let pose: PoseLandmarker | null = null;
let loading: Promise<void> | null = null;

/**
 * The model is fetched, not bundled.
 *
 * The runtime is 11MB of WASM and the two model files another ten, against an
 * app that is otherwise under half a megabyte. Shipping them would multiply
 * the download by forty for a screen used weekly, so they come from a CDN and
 * the browser caches them after the first successful load.
 *
 * The honest consequence: the FIRST scan on a device needs a connection.
 * Everything after that works offline. A failure here has to say that plainly
 * rather than surfacing whatever error a failed WASM streaming compile throws,
 * which reads like a bug in the app.
 */
export class VisionUnavailable extends Error {
  constructor(cause?: unknown) {
    super(
      "Could not load the face model. The first scan on a device needs a connection — " +
        "after that it is cached and works offline.",
    );
    this.name = "VisionUnavailable";
    this.cause = cause;
  }
}

export async function loadVision() {
  if (face && pose) return;
  if (!loading) {
    loading = (async () => {
      const files = await FilesetResolver.forVisionTasks(WASM);
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        // Well below the 0.5 default, and this is the whole reason the profile
        // step never captured. MediaPipe CAN find a face turned 70-90° — it
        // just scores it around 0.3, so the default threshold threw every
        // profile frame away and the app reported "no face". A lower bar
        // costs a little precision on a shot nobody was getting at all.
        minFaceDetectionConfidence: 0.2,
        minFacePresenceConfidence: 0.2,
        minTrackingConfidence: 0.2,
      });
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    })().catch(async (gpuErr) => {
      // GPU delegate refused — some WebViews have no WebGL worth the name.
      // Retry on CPU before giving up, since CPU is slower but always there.
      try {
      const files = await FilesetResolver.forVisionTasks(WASM);
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        // Well below the 0.5 default, and this is the whole reason the profile
        // step never captured. MediaPipe CAN find a face turned 70-90° — it
        // just scores it around 0.3, so the default threshold threw every
        // profile frame away and the app reported "no face". A lower bar
        // costs a little precision on a shot nobody was getting at all.
        minFaceDetectionConfidence: 0.2,
        minFacePresenceConfidence: 0.2,
        minTrackingConfidence: 0.2,
      });
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        numPoses: 1,
      });
      } catch (cpuErr) {
        // Let the next attempt try again rather than caching the failure
        // forever — the usual cause is no signal, which passes.
        loading = null;
        throw new VisionUnavailable(cpuErr ?? gpuErr);
      }
    });
  }
  await loading;
}

export async function detectFace(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) {
  await loadVision();
  if (!face) throw new Error("Face landmarker failed to load");
  return face.detect(image);
}

/** Scratch canvas for the mirrored retry, made once rather than per frame. */
let flipCanvas: HTMLCanvasElement | null = null;

export interface TolerantDetection {
  landmarks: { x: number; y: number; z?: number }[] | null;
  blendshapes: unknown;
  /** Absent when the face was only found mirrored — see below. */
  matrix: number[] | undefined;
  /** True when this came from the flipped frame. */
  mirrored: boolean;
}

/**
 * Detect, and if that finds nothing, try the frame mirrored.
 *
 * The face detector behind FaceLandmarker is BlazeFace, trained overwhelmingly
 * on frontal faces. At a hard yaw it does not return a low-confidence box that
 * a threshold could rescue — it often proposes no box at all, which is why
 * dropping the confidence to 0.2 did not make the profile step work.
 *
 * What it IS, is asymmetric: it will frequently find a head turned one way and
 * miss the mirror image of the same pose. Flipping the frame costs one extra
 * inference, and only on frames that already failed.
 *
 * The landmarks come back in the flipped frame's coordinates, so x is undone
 * here — every consumer gets geometry in the real image's space and none of
 * them need to know this happened. The transformation matrix is DROPPED rather
 * than un-mirrored: reflecting a 4x4 pose matrix correctly is fiddly, and
 * silently handing back a matrix with the wrong handedness would flip every
 * yaw sign downstream. Callers fall back to the landmark proxy, which is
 * computed from the corrected points and is right by construction.
 */
export async function detectFaceTolerant(
  canvas: HTMLCanvasElement,
): Promise<TolerantDetection> {
  const direct = await detectFace(canvas);
  const lms = direct.faceLandmarks?.[0];
  if (lms?.length) {
    return {
      landmarks: lms,
      blendshapes: direct.faceBlendshapes?.[0],
      matrix: direct.facialTransformationMatrixes?.[0]?.data as number[] | undefined,
      mirrored: false,
    };
  }

  flipCanvas ??= document.createElement("canvas");
  flipCanvas.width = canvas.width;
  flipCanvas.height = canvas.height;
  const ctx = flipCanvas.getContext("2d");
  if (!ctx) return { landmarks: null, blendshapes: undefined, matrix: undefined, mirrored: false };
  ctx.save();
  ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();

  const flipped = await detectFace(flipCanvas);
  const fl = flipped.faceLandmarks?.[0];
  if (!fl?.length) {
    return { landmarks: null, blendshapes: undefined, matrix: undefined, mirrored: false };
  }
  return {
    landmarks: fl.map((p) => ({ ...p, x: 1 - p.x })),
    blendshapes: flipped.faceBlendshapes?.[0],
    matrix: undefined,
    mirrored: true,
  };
}

export async function detectPose(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) {
  await loadVision();
  if (!pose) throw new Error("Pose landmarker failed to load");
  return pose.detect(image);
}

export function landmarksToPts(lms: { x: number; y: number; z?: number }[]): Pt[] {
  return lms.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

export function smileFromBlendshapes(
  blendshapes?: { categories: { categoryName: string; score: number }[] },
): number {
  if (!blendshapes?.categories) return 0;
  const want = ["mouthSmileLeft", "mouthSmileRight", "jawOpen"];
  return want.reduce((s, n) => {
    const c = blendshapes.categories.find((x) => x.categoryName === n);
    return s + (c?.score ?? 0);
  }, 0);
}

/** Column-major 4x4 facial transformation matrix → approximate Euler degrees. */
export function eulerFromMatrix4(m?: number[]): { yawDeg: number; pitchDeg: number; rollDeg: number } | null {
  if (!m || m.length < 16) return null;
  const r00 = m[0], r10 = m[1], r20 = m[2];
  const r21 = m[6], r22 = m[10];
  const yawDeg = (Math.atan2(r10, r00) * 180) / Math.PI;
  const pitchDeg = (Math.atan2(-r20, Math.hypot(r00, r10)) * 180) / Math.PI;
  const rollDeg = (Math.atan2(r21, r22) * 180) / Math.PI;
  if (![yawDeg, pitchDeg, rollDeg].every(Number.isFinite)) return null;
  return { yawDeg, pitchDeg, rollDeg };
}
