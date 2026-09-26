import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * The LiDAR body scan, implemented in Swift (ios/App/App/BodyDepthPlugin.swift).
 *
 * Only exists in the native iOS build, on a phone with body tracking. The
 * phone goes on a wall mount, back camera toward you, 1.5–4.5 m away.
 */

export type BodyScanMode = "front" | "side";

/** Why a frame was not collected: the native screen's own gates. */
export type BodyFrameCode = "find" | "frame" | "back" | "closer" | "face" | "side" | "still" | "hold";

export interface BodyFrameEvent {
  ok: boolean;
  code?: BodyFrameCode;
  message: string;
  collected: number;
  target: number;
  /** Metres from the camera to the hips. */
  distance?: number;
}

export interface BodyDepthResult {
  mode: BodyScanMode;
  frames: number;
  /** ARKit's estimate of body size relative to its default skeleton. */
  estimatedScale: number;
  /** Scale ARKit put on the anchor itself; the plugin removes it. */
  anchorScale?: number;
  /** Metres. */
  distance: number;
  skeletonNames: string[];
  /** Fitted skeleton: flat xyz, metres, body space. */
  skeleton: number[];
  measuredNames: string[];
  /** LiDAR-measured joints: flat xyz, metres, body space; null = never read. */
  measured: (number | null)[];
  measuredCounts: number[];
  lidar: boolean;
  /** One upright colour frame, JPEG data URL. */
  image?: string;
}

interface BodyDepthPlugin {
  isSupported(): Promise<{ supported: boolean; lidar: boolean }>;
  scan(options: { mode: BodyScanMode; frames?: number }): Promise<BodyDepthResult>;
  cancel(): Promise<void>;
  addListener(event: "bodyFrame", cb: (e: BodyFrameEvent) => void): Promise<PluginListenerHandle>;
}

export const BodyDepth = registerPlugin<BodyDepthPlugin>("BodyDepth");

export const BODY_MIN_DISTANCE_M = 1.5;
export const BODY_MAX_DISTANCE_M = 4.5;

/** True only in the native build, on a phone that can track a body. */
export async function bodyScanAvailable(): Promise<{ supported: boolean; lidar: boolean }> {
  if (!Capacitor.isNativePlatform()) return { supported: false, lidar: false };
  try {
    return await BodyDepth.isSupported();
  } catch {
    return { supported: false, lidar: false };
  }
}
