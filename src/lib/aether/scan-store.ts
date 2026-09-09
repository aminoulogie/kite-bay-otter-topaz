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
    const prev = out.get(s.kind);
    if (!prev || s.capturedAt > prev.capturedAt) out.set(s.kind, s);
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
