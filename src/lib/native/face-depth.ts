import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * The TrueDepth face scan, implemented in Swift (ios/App/App/FaceDepthPlugin.swift).
 *
 * Only exists in the native iOS build; in the PWA every call is unavailable
 * and the 2D MediaPipe scan is the whole story.
 */

export interface FaceFrameEvent {
  tracked: boolean;
  ok: boolean;
  message: string;
  collected: number;
  target: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** Metres from the camera. */
  distance?: number;
  /** Sweep scans: "front", "sweep", then with sides the turn / hold stages. */
  phase?: "front" | "sweep" | "turnRight" | "holdRight" | "stepBack" | "holdPosture" | "back" | "turnLeft" | "holdLeft";
  /** Sweep: degrees from where the head points to the next move's target, and which way it is. */
  targetError?: number;
  targetDir?: "up" | "down" | "left" | "right" | "";
  /** Sweep: how many of the four moves are done. */
  looksDone?: number;
}

export interface FaceDepthResult {
  vertexCount: number;
  /** Base64 little-endian Float32 xyz triples, millimetres, face axes. */
  vertices: string;
  /** Base64 Int16 triangle indices — the same topology for every face. */
  triangles: string;
  blendShapes: Record<string, number>;
  /** Eye centres, mm, face axes. */
  leftEye: [number, number, number];
  rightEye: [number, number, number];
  yaw: number;
  pitch: number;
  roll: number;
  /** Metres. */
  distance: number;
  frames: number;
  intrinsics: number[];
  imageResolution: [number, number];
  /** One colour frame, upright, as a JPEG data URL. */
  image?: string;
  /** Raw TrueDepth surface: base64 Float32 z in mm per grid cell, NaN = no data. */
  depthGrid?: string;
  depthGridWidth?: number;
  depthGridHeight?: number;
  depthCellMm?: number;
  depthOriginMm?: [number, number];
  depthFrames?: number;
  /** Fraction of grid cells with enough samples. */
  depthCoverage?: number;
  /** Sweep only: the two independent cylinders, base64 Float32 radius mm, NaN = none. */
  cylA?: string;
  cylB?: string;
  cylWidth?: number;
  cylHeight?: number;
  cylThetaMinDeg?: number;
  cylThetaStepDeg?: number;
  cylYMinMm?: number;
  cylYStepMm?: number;
  cylAxisZMm?: number;
  cylFrames?: number;
  /** Share of the ring's directions covered. */
  sweepCoverage?: number;
  /** The best ~40° frame each way, for the 2D 45° analysis. */
  obliques?: { image: string; yaw: number }[];
  /** Straight down in the face's own axes, while standing square-on. */
  gravityFace?: [number, number, number];
  /** Sweep: a light copy of the front and head-move frames with ARKit's pose, for re-placing by shape. */
  sweepFrames?: SideFrameRaw[];
  /** Full scan: the raw side-on depth frames, for matching onto the face model. */
  sides?: { right: SideFrameRaw[]; left: SideFrameRaw[] };
  /** Per side: how the stage ended, depth frames seen, nearest distance (m). */
  sideDiag?: Record<string, { outcome?: string; depthFrames?: number; turnDepthFrames?: number; distance?: number }>;
}

export interface SideFrameRaw {
  /** "posture": side-on from the posture mark, a step further back. */
  stage: "turn" | "hold" | "posture" | "front" | "sweep";
  /** Base64 Int16 xyz, 0.1 mm, camera axes (x right, y up, z toward you). */
  points: string;
  /** Camera → face, metres, column-major 4×4 — only while ARKit still tracks the face. */
  pose?: number[];
}

interface FaceDepthPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  scan(options?: {
    frames?: number;
    minDistance?: number;
    maxDistance?: number;
    mode?: "still" | "sweep";
    /** After the sweep, turn right and left side-on for the jaw, neck and profile. */
    sides?: boolean;
  }): Promise<FaceDepthResult>;
  cancel(): Promise<void>;
  addListener(event: "faceFrame", cb: (e: FaceFrameEvent) => void): Promise<PluginListenerHandle>;
}

export const FaceDepth = registerPlugin<FaceDepthPlugin>("FaceDepth");

/** Distance window the scan accepts — where TrueDepth is most accurate. */
export const MIN_DISTANCE_M = 0.25;
export const MAX_DISTANCE_M = 0.5;
/** The sweep holds a tighter band, where TrueDepth is at its most accurate. */
export const SWEEP_MIN_DISTANCE_M = 0.26;
export const SWEEP_MAX_DISTANCE_M = 0.38;

/** True only in the native build, on a phone with a TrueDepth camera. */
export async function trueDepthAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await FaceDepth.isSupported()).supported;
  } catch {
    return false;
  }
}
