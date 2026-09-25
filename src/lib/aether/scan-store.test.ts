import assert from "node:assert/strict";
import { test } from "node:test";
import type { FaceAnalysis } from "./analyzeFace.ts";
import { ANALYZER_VERSION } from "./landmarks.ts";
import { needsReanalysis, type ScanRecord } from "./scan-store.ts";

const base: ScanRecord = { id: "a", date: "2026-09-20", capturedAt: "2026-09-20T10:00:00Z", kind: "face_front_true" };
const face = (v: string) => ({ analyzerVersion: v }) as FaceAnalysis;

test("scans from before the version stamp are flagged", () => {
  assert.equal(needsReanalysis({ ...base, face: face("aether-face-1.2.0") }), true);
  // Photo-only profiles from before the fix carry no face and no stamp.
  assert.equal(needsReanalysis({ ...base, kind: "face_side" }), true);
});

test("a scan taken or re-measured by the current analyser is not flagged again", () => {
  assert.equal(needsReanalysis({ ...base, analyzer: ANALYZER_VERSION }), false);
  assert.equal(needsReanalysis({ ...base, face: face(ANALYZER_VERSION) }), false);
  // Re-measured, but the photo no longer yielded a face: old face kept, stamp current.
  assert.equal(needsReanalysis({ ...base, analyzer: ANALYZER_VERSION, face: face("aether-face-1.2.0") }), false);
});

test("profiles file by side; old profiles without a side file as right", async () => {
  const { scanSlot, latestByKind } = await import("./scan-store.ts");
  assert.equal(scanSlot({ kind: "face_side", side: "left" }), "face_side:left");
  assert.equal(scanSlot({ kind: "face_side" }), "face_side:right");
  assert.equal(scanSlot({ kind: "face_front_true" }), "face_front_true");
  const m = latestByKind([
    { ...base, id: "r", kind: "face_side", side: "right" },
    { ...base, id: "l", kind: "face_side", side: "left", capturedAt: "2026-09-21T10:00:00Z" },
  ]);
  assert.equal(m.get("face_side:right")?.id, "r");
  assert.equal(m.get("face_side:left")?.id, "l");
});
