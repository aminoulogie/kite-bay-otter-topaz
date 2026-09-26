import assert from "node:assert/strict";
import { test } from "node:test";
import type { FaceAnalysis } from "./analyzeFace.ts";
import { ANALYZER_VERSION, MESH_KEYS } from "./landmarks.ts";
import { misfiledAs, needsReanalysis, type ScanRecord } from "./scan-store.ts";

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

test("the distance baseline is the FIRST like-for-like scan, never another camera or zoom", async () => {
  const { baselineIris } = await import("./scan-store.ts");
  const cap = (facing: "user" | "environment", zoom: number, iris: number) => ({ facing, zoom, iris });
  const scans: ScanRecord[] = [
    { ...base, id: "later", capturedAt: "2026-09-25T10:00:00Z", capture: cap("user", 2, 0.03) },
    { ...base, id: "first", capturedAt: "2026-09-20T10:00:00Z", capture: cap("user", 2, 0.02) },
    { ...base, id: "zoom1", capturedAt: "2026-09-10T10:00:00Z", capture: cap("user", 1, 0.01) },
    { ...base, id: "back", capturedAt: "2026-09-01T10:00:00Z", capture: cap("environment", 2, 0.05) },
    { ...base, id: "side", kind: "face_side", capturedAt: "2026-09-01T10:00:00Z", capture: cap("user", 2, 0.07) },
  ];
  assert.equal(baselineIris(scans, "face_front_true", "user", 2), 0.02);
  assert.equal(baselineIris(scans, "face_front_true", "environment", 3), null);
});

function faceAt(yawDeg: number, noseX: number): FaceAnalysis {
  const mesh = MESH_KEYS.map(() => ({ x: 0.5, y: 0.5, z: 0 }));
  mesh[MESH_KEYS.indexOf("noseTip")] = { x: noseX, y: 0.5, z: 0 };
  mesh[MESH_KEYS.indexOf("leftOuter")] = { x: 0.4, y: 0.4, z: 0 };
  mesh[MESH_KEYS.indexOf("rightOuter")] = { x: 0.6, y: 0.4, z: 0 };
  return { yawDeg, mesh } as unknown as FaceAnalysis;
}
const front = (face?: FaceAnalysis) =>
  ({ id: "a", date: "2026-09-25", capturedAt: "", kind: "face_front_true", face }) as const;

test("a turned 'front' scan is refiled to the pose it was taken at", () => {
  assert.deepEqual(misfiledAs(front(faceAt(35, 0.4))), { kind: "face_oblique", side: "right" });
  assert.deepEqual(misfiledAs(front(faceAt(-70, 0.6))), { kind: "face_side", side: "left" });
});

test("real front scans, 3D scans and non-front scans stay where they are", () => {
  assert.equal(misfiledAs(front(faceAt(4, 0.5))), null);
  assert.equal(misfiledAs(front()), null);
  assert.equal(misfiledAs({ ...front(faceAt(40, 0.4)), depth: {} as never }), null);
  assert.equal(misfiledAs({ ...front(faceAt(40, 0.4)), kind: "face_oblique" }), null);
});

test("a story steps through the exact same position only, oldest first", async () => {
  const { storyOf, matchesFilter } = await import("./scan-store.ts");
  const mk = (id: string, at: string, kind: string, side?: "left" | "right", depth = false) =>
    ({ id, date: at.slice(0, 10), capturedAt: at, kind, side, ...(depth ? { depth: {} } : {}) }) as never;
  const scans = [
    mk("L1", "2026-09-01T10:00", "face_side", "left"),
    mk("R1", "2026-09-01T10:01", "face_side", "right"),
    mk("L2", "2026-09-01T18:00", "face_side", "left"),
    mk("F1", "2026-09-02T10:00", "face_front_true"),
    mk("D1", "2026-09-02T11:00", "face_front_true", undefined, true),
    mk("L3", "2026-09-03T10:00", "face_side", "left"),
  ];
  const s = storyOf(scans, scans[2]!);
  assert.deepEqual(s.list.map((x: { id: string }) => x.id), ["L1", "L2", "L3"], "same day kept, right side left out");
  assert.equal((s.prev as { id: string } | null)?.id, "L1");
  assert.equal((s.next as { id: string } | null)?.id, "L3");
  assert.deepEqual(storyOf(scans, scans[3]!).list.map((x: { id: string }) => x.id), ["F1"], "3D apart from 2D");
  assert.equal(matchesFilter(scans[4]!, "front"), false);
  assert.equal(matchesFilter(scans[4]!, "3d"), true);
  assert.equal(matchesFilter(scans[1]!, "right"), true);
  assert.equal(matchesFilter(scans[1]!, "left"), false);
});
