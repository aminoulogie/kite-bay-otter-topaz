import { craniovertebralAngle, lineAngleVsHorizontal, midpoint, type Pt } from "./geometry.ts";
import { POSE } from "./landmarks.ts";

export type PostureAnalysis = {
  capturedAt: string;
  view: "side" | "front";
  cvaEst?: number;
  cranialRotation?: number;
  forwardHeadNote: string;
  headTilt?: number;
  shoulderSlope?: number;
  trunkList?: number;
  estimatedC7: boolean;
  confidence: number;
  gates: { ok: boolean; reasons: string[] };
  notes: string[];
};

export function analyzePostureSide(pose: Pt[], faceEar?: Pt): PostureAnalysis {
  const reasons: string[] = [];
  const notes = [
    "C7 is estimated — MediaPipe Pose has no C7 landmark.",
    "CVA is an external moment-arm proxy, not curve shape.",
    "FHP is typically upper-cervical extension + mid/low cervical flexion.",
  ];
  const lEar = pose[POSE.leftEar];
  const rEar = pose[POSE.rightEar];
  const lSh = pose[POSE.leftShoulder];
  const rSh = pose[POSE.rightShoulder];
  const ear = faceEar ?? (lEar && rEar ? pickNearerEar(lEar, rSh, rEar, lSh) : lEar || rEar);
  const shoulders = lSh && rSh ? midpoint(lSh, rSh) : lSh || rSh;
  if (!ear || !shoulders) {
    return {
      capturedAt: new Date().toISOString(), view: "side",
      forwardHeadNote: "Insufficient landmarks", estimatedC7: true, confidence: 0.1,
      gates: { ok: false, reasons: ["Need a true profile with ear and shoulder visible."] }, notes,
    };
  }
  const c7: Pt = { x: shoulders.x * 0.72 + ear.x * 0.28, y: shoulders.y * 0.55 + ear.y * 0.45 };
  const cva = craniovertebralAngle(ear, c7);
  const canthus = pose[POSE.nose];
  const cranialRotation = canthus ? Math.abs(lineAngleVsHorizontal(ear, canthus)) : undefined;
  if (lEar && rEar && Math.abs(lEar.x - rEar.x) < 0.04) reasons.push("Both ears visible — may not be a true profile.");
  let forwardHeadNote = "Carriage near stacked (estimate).";
  if (cva < 45.5) forwardHeadNote = "Moderate-to-marked forward head (CVA estimate).";
  else if (cva < 50) forwardHeadNote = "Mild forward head by common CVA convention (~50°).";
  notes.push("Changes under ~2.5° week-to-week may be protocol noise.");
  return {
    capturedAt: new Date().toISOString(), view: "side", cvaEst: cva, cranialRotation,
    forwardHeadNote, estimatedC7: true, confidence: reasons.length ? 0.45 : 0.72,
    gates: { ok: reasons.length === 0, reasons }, notes,
  };
}

export function analyzePostureFront(pose: Pt[]): PostureAnalysis {
  const reasons: string[] = [];
  const lEar = pose[POSE.leftEar];
  const rEar = pose[POSE.rightEar];
  const lSh = pose[POSE.leftShoulder];
  const rSh = pose[POSE.rightShoulder];
  const lHip = pose[POSE.leftHip];
  const rHip = pose[POSE.rightHip];
  const headTilt = lEar && rEar ? lineAngleVsHorizontal(lEar, rEar) : undefined;
  const shoulderSlope = lSh && rSh ? lineAngleVsHorizontal(lSh, rSh) : undefined;
  const midSh = lSh && rSh ? midpoint(lSh, rSh) : undefined;
  const midHip = lHip && rHip ? midpoint(lHip, rHip) : undefined;
  const trunkList = midSh && midHip ? lineAngleVsHorizontal({ x: midHip.x, y: midSh.y }, midSh) : undefined;
  if (headTilt !== undefined && Math.abs(headTilt) > 3) reasons.push("Head tilt will leak into face scores.");
  return {
    capturedAt: new Date().toISOString(), view: "front", headTilt, shoulderSlope, trunkList,
    forwardHeadNote: "Front view cannot measure CVA. Use side studio.",
    estimatedC7: false, confidence: lSh && rSh ? 0.8 : 0.3,
    gates: { ok: reasons.length === 0, reasons },
    notes: ["Yaw (mostly C1–C2) and roll couple into apparent orbital/jaw asymmetry."],
  };
}

function pickNearerEar(lEar: Pt, rSh: Pt | undefined, rEar: Pt, lSh: Pt | undefined): Pt {
  if (!rSh || !lSh) return lEar;
  return Math.abs(rEar.x - 0.5) > Math.abs(lEar.x - 0.5) ? rEar : lEar;
}
