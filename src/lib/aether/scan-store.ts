/**
 * A scan, as SOMA stores it.
 *
 * The analysis object travels whole rather than being reduced to two numbers.
 * A Face File is the EDMA ratios, the regional bars, the pose it was taken at
 * and the gates it did or did not pass — and a reading kept without those is a
 * number nobody can later argue with. It is all JSON, so it rides in the store
 * and therefore in the backup.
 *
 * The IMAGE does not live here. Photos go to IndexedDB keyed by scan id, for
 * the same reason habit photos do: the store persists to localStorage, and a
 * handful of base64 captures would blow the ~5MB budget and take every logged
 * workout with it.
 */

import type { FaceAnalysis } from "./analyzeFace.ts";
import type { PostureAnalysis } from "./analyzePosture.ts";
import type { CaptureKind } from "./captureQuality.ts";
import type { SkinReport } from "./skin.ts";
import type { Reading } from "./harmony.ts";
import type { BodyMetrics } from "./body3d.ts";
import type { CylChange, SweepSummary } from "./cylmap.ts";
import { ANALYZER_VERSION, MESH_KEYS } from "./landmarks.ts";
import { turnedSide } from "./assist.ts";

export interface ScanRecord {
  id: string;
  /** Local date key, so it lines up with everything else on the calendar. */
  date: string;
  capturedAt: string;
  kind: CaptureKind | "posture_side" | "posture_front";
  face?: FaceAnalysis;
  posture?: PostureAnalysis;
  /** Pixel measurements — absent on captures taken before these existed. */
  skin?: SkinReport;
  /** Cheek width over intercanthal. Soft tissue over fixed bone. */
  puffiness?: number | null;
  /** Every canon measured against its published norm. */
  harmony?: Reading[];
  /**
   * The analyser that last measured this scan. Absent on scans taken before
   * the field existed — which is exactly the set that predates the head-angle
   * fix, so absence means "measured by an older analyser".
   */
  analyzer?: string;
  /** Profile shots: which way the head was turned, in the user's own left/right. */
  side?: "left" | "right";
  /**
   * How the photo was taken. The iris size (see assist.ts irisSize) is only
   * comparable between scans from the same camera at the same zoom.
   */
  capture?: { facing: "user" | "environment"; zoom: number; iris: number | null };
  /**
   * TrueDepth measurements, in real millimetres. The full averaged mesh is in
   * IndexedDB under `mesh:<id>` (too big for the store); these are the numbers
   * read off it.
   */
  depth?: DepthSummary;
  /**
   * LiDAR body scan. Both averaged skeletons are in IndexedDB under
   * `body:<id>`, so the numbers can be re-read if the maths improves.
   */
  body?: BodySummary;
}

export interface BodySummary {
  source: "lidar";
  mode: "front" | "side";
  frames: number;
  distanceMm: number;
  estimatedScale: number;
  /** False on a phone that tracked the body without LiDAR depth: model numbers only. */
  lidar: boolean;
  metrics: BodyMetrics;
}

export interface DepthSummary {
  source: "truedepth";
  frames: number;
  distanceMm: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Interpupillary distance: eye centre to eye centre. */
  ipdMm: number;
  symmetryRmsMm: number | null;
  symmetryP95Mm: number | null;
  symmetryByThird: { upper: number; middle: number; lower: number } | null;
  faceWidthMm: number | null;
  meshHeightMm: number | null;
  lowerWidthMm: number | null;
  lowerToFace: number | null;
  /** Expression at capture, so a "neutral" scan can be checked. */
  smile: number;
  jawOpen: number;
  /**
   * Symmetry measured on the RAW depth surface — the real shape, not the
   * fitted mesh. Absent when the device delivered no depth.
   */
  raw?: {
    rmsMm: number;
    p95Mm: number;
    byThird: { upper: number; middle: number; lower: number };
    /** Person's left minus right, mm: positive = left sits further forward. */
    leftMinusRightMm: { upper: number; middle: number; lower: number };
    residualYawDeg: number;
    depthFrames: number;
    coverage: number;
  };
  /** Face ID-style sweep: the fused 3D surface's numbers, each with its own noise. */
  sweep?: SweepSummary;
  /** Re-placing the sweep's frames by shape: how many, and the noise before and after. */
  refine?: import("./refine.ts").RefineStats;
  /** Surface change against the FIRST sweep, after alignment. */
  changeVsFirst?: CylChange & { firstId: string; anchorRmsMm?: number };
}

/**
 * Where the newest full scan's RAW capture is kept (JSON): the side and sweep
 * frames exactly as the phone sent them. Only the latest scan's is kept — it
 * exists so a failing scan can be exported and replayed off the phone.
 */
export function rawKey(scanId: string): string {
  return `raw:${scanId}`;
}

/** Where a full scan's side-view point cloud (neck, shoulders, upper back) is stored: base64 Float32 xyz, mm. */
export function cloudKey(scanId: string): string {
  return `cloud:${scanId}`;
}

/** Where a sweep's two cylinders are stored (JSON). */
export function cylKey(scanId: string): string {
  return `cyl:${scanId}`;
}

/** Where the averaged skeletons of a LiDAR body scan are stored. */
export function bodyKey(scanId: string): string {
  return `body:${scanId}`;
}

/** Where the raw depth grid of a TrueDepth scan is stored. */
export function depthGridKey(scanId: string): string {
  return `depth:${scanId}`;
}

/** Where the full mesh of a TrueDepth scan is stored. */
export function meshKey(scanId: string): string {
  return `mesh:${scanId}`;
}

/**
 * The iris size to match: the FIRST scan in this slot taken with the same
 * camera and zoom. The first, not the latest — matching the latest lets the
 * distance creep a little every week, and after two months nothing lines up.
 */
export function baselineIris(
  scans: ScanRecord[],
  slot: string,
  facing: "user" | "environment",
  zoom: number,
): number | null {
  let first: ScanRecord | null = null;
  for (const s of scans) {
    const c = s.capture;
    if (!c?.iris || c.facing !== facing || c.zoom !== zoom || scanSlot(s) !== slot) continue;
    if (!first || s.capturedAt < first.capturedAt) first = s;
  }
  return first?.capture?.iris ?? null;
}

/**
 * The comparable "slot" a scan belongs to: its kind, and for profiles also its
 * side, because a left profile and a right profile are different photographs
 * of different halves of a face. Profiles from before sides were recorded were
 * all taken turning right (the only direction the guides drew), so they file
 * as right.
 */
export function scanSlot(scan: Pick<ScanRecord, "kind" | "side">): string {
  return scan.kind === "face_side" ? `face_side:${scan.side ?? "right"}` : scan.kind;
}

/**
 * A 45° or profile shot that was filed as a front scan.
 *
 * Until the auto-shutter bug was fixed, every automatic capture used the step
 * that was showing when the camera opened — nearly always Front — so turned
 * faces were saved, and measured, as front scans. The head angle measured at
 * the time gives them away: a front shot is gated to under 8°, so a "front"
 * scan turned 20° or more was not taken as one. The side it faced comes from
 * the stored landmarks, the same way the live coach works it out.
 */
export function misfiledAs(scan: ScanRecord): { kind: "face_oblique" | "face_side"; side?: "left" | "right" } | null {
  if (scan.kind !== "face_front_true" || scan.depth || scan.body || !scan.face) return null;
  const yaw = Math.abs(scan.face.yawDeg);
  if (!Number.isFinite(yaw) || yaw < 20) return null;
  const at = (k: (typeof MESH_KEYS)[number]) => scan.face!.mesh[MESH_KEYS.indexOf(k)]?.x;
  const side = turnedSide(at("noseTip"), at("leftOuter"), at("rightOuter")) ?? undefined;
  return { kind: yaw < 45 ? "face_oblique" : "face_side", ...(side ? { side } : {}) };
}

/** True when this scan was measured by an older analyser and should be re-measured. */
export function needsReanalysis(scan: ScanRecord): boolean {
  if (scan.body) return false; // a LiDAR scan has no photo analysis to redo
  return (scan.analyzer ?? scan.face?.analyzerVersion) !== ANALYZER_VERSION;
}

/** Evenness as a percentage, from the raw Procrustes distance. */
export function evennessOf(face: FaceAnalysis | undefined): number | null {
  if (!face) return null;
  return Math.round((100 - face.alpha * 100) * 10) / 10;
}

/**
 * The most recent scan of each kind.
 *
 * Front, 45° and profile answer different questions and are not
 * interchangeable, so "latest" has to mean latest of its kind rather than
 * latest overall — otherwise a profile shot replaces the front metrics on the
 * card with numbers that were gated out of being front metrics.
 */
export function latestByKind(scans: ScanRecord[]): Map<string, ScanRecord> {
  const out = new Map<string, ScanRecord>();
  for (const s of scans) {
    const slot = scanSlot(s);
    const prev = out.get(slot);
    if (!prev || s.capturedAt > prev.capturedAt) out.set(slot, s);
  }
  return out;
}

/** Scans newest first, which is the order they are read in. */
export function newestFirst(scans: ScanRecord[]): ScanRecord[] {
  return [...scans].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/**
 * Evenness over time, for a trend.
 *
 * Only front captures, and only ones that passed their gates. Mixing a gated
 * frame into a trend line is how a bad photo becomes a bad week.
 */
export function evennessTrend(scans: ScanRecord[]): { date: string; evenness: number }[] {
  return scans
    .filter((s) => s.kind === "face_front_true" && s.face?.gates.ok)
    .map((s) => ({ date: s.date, evenness: evennessOf(s.face)! }))
    .filter((p) => Number.isFinite(p.evenness))
    .sort((a, b) => a.date.localeCompare(b.date));
}
