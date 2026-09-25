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
import { ANALYZER_VERSION } from "./landmarks.ts";

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
