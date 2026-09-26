import type { AssistAudio } from "./assist-audio.ts";
import { beepInterval, type Guidance } from "./assist.ts";
import { BodyPoints, bodyMetrics } from "./body3d.ts";
import { bodyKey, type BodySummary, type ScanRecord } from "./scan-store.ts";
import {
  BodyDepth,
  BODY_MAX_DISTANCE_M,
  BODY_MIN_DISTANCE_M,
  type BodyDepthResult,
  type BodyFrameEvent,
  type BodyScanMode,
} from "../native/body-depth.ts";
import { saveScanImage } from "../habit-photos.ts";
import { getLocalDateKey } from "../soma/dates.ts";

/** Read the numbers off a body scan. Pure. */
export function summariseBody(r: BodyDepthResult): BodySummary {
  return {
    source: "lidar",
    mode: r.mode,
    frames: r.frames,
    distanceMm: r.distance * 1000,
    estimatedScale: r.estimatedScale,
    lidar: r.lidar,
    metrics: bodyMetrics(new BodyPoints(r)),
  };
}

const PHRASES: Record<string, string> = {
  find: "Step into view. Whole body, head to feet.",
  frame: "Step back until your head and feet are in view.",
  back: "Step back a little.",
  closer: "Come a little closer.",
  face: "Face the phone squarely.",
  side: "Turn fully sideways to the phone.",
  still: "Hold still.",
  hold: "Hold still.",
};

/**
 * The native screen's verdict as beeps and voice — the phone is on a wall
 * behind or beside you, so sound is the only coach you can follow.
 */
export function bodyGuidance(e: BodyFrameEvent): Guidance {
  const code = e.ok ? "hold" : (e.code ?? "find");
  let error = { find: 1, frame: 0.8, face: 0.6, side: 0.6, still: 0.25, hold: 0 }[code as string] ?? 0.5;
  if ((code === "back" || code === "closer") && e.distance != null) {
    const off = code === "back" ? BODY_MIN_DISTANCE_M - e.distance : e.distance - BODY_MAX_DISTANCE_M;
    error = Math.max(0.2, Math.min(1, off / 1.0 + 0.2));
  }
  const instruction = code === "hold" ? "hold" : code === "back" ? "back" : code === "closer" ? "closer" : code === "face" || code === "side" ? "turn" : "find";
  return {
    instruction,
    side: null,
    error,
    pan: 0,
    beepMs: instruction === "hold" ? 0 : beepInterval(error),
    pitchHz: 660,
    phrase: PHRASES[code] ?? e.message,
  };
}

/**
 * Run the native body scan with the app's audio coach, and store the result.
 * Call `audio.enable()` in the tap that starts this.
 */
export async function runBodyScan(mode: BodyScanMode, audio: AssistAudio): Promise<ScanRecord> {
  const handle = await BodyDepth.addListener("bodyFrame", (e) => audio.update(bodyGuidance(e)));
  audio.announce(mode === "side" ? "Stand side-on to the phone, arms relaxed." : "Face the phone, knees gently together, arms a little out from your sides.");
  let result: BodyDepthResult;
  try {
    result = await BodyDepth.scan({ mode, frames: 60 });
  } finally {
    await handle.remove();
    audio.update(null);
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const { image, ...points } = result;
  await saveScanImage(bodyKey(id), JSON.stringify(points));
  if (image) await saveScanImage(id, image);

  audio.cue("done");
  audio.announce("Body scan captured.");
  return {
    id,
    date: getLocalDateKey(new Date()),
    capturedAt: new Date().toISOString(),
    kind: mode === "side" ? "posture_side" : "posture_front",
    body: summariseBody(result),
  };
}
