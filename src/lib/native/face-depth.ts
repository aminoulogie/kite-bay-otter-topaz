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
}

interface FaceDepthPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  scan(options?: { frames?: number; minDistance?: number; maxDistance?: number }): Promise<FaceDepthResult>;
  cancel(): Promise<void>;
  addListener(event: "faceFrame", cb: (e: FaceFrameEvent) => void): Promise<PluginListenerHandle>;
}

export const FaceDepth = registerPlugin<FaceDepthPlugin>("FaceDepth");

/** Distance window the scan accepts — where TrueDepth is most accurate. */
export const MIN_DISTANCE_M = 0.25;
export const MAX_DISTANCE_M = 0.5;

/** True only in the native build, on a phone with a TrueDepth camera. */
export async function trueDepthAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await FaceDepth.isSupported()).supported;
  } catch {
    return false;
  }
}
