import assert from "node:assert/strict";
import { test } from "node:test";
import { checksum } from "./checksum.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from "./backup.ts";

/**
 * The checksum this file writes and the checksum it verifies against have to
 * sum the exact same fields, or every real backup fails its own check.
 *
 * That is exactly what shipped once already: buildBackup summed four fields
 * (data, photos, scanImages, exercisePhotos) the moment exercise photos
 * joined the backup, but parseBackup's recomputation still summed three,
 * fixed at the shape from before that existed. Every backup taken since —
 * which is any backup with a photo on an exercise — failed on restore with
 * "That backup is damaged", for a file that was not damaged at all.
 *
 * These build a backup body by hand rather than calling buildBackup, which
 * needs IndexedDB for the photo stores; the shape is what matters here, not
 * the photo bytes.
 */

function backupWith(body: Record<string, unknown>): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    checksum: checksum(JSON.stringify(body)),
    ...body,
  });
}

test("a backup with exercise photos passes its own checksum check", () => {
  const body = {
    data: { history: { "2026-01-01": { split: "Push" } } },
    photos: [],
    scanImages: [],
    exercisePhotos: [{ key: "bench-press", dataUrl: "data:image/jpeg;base64,AA==" }],
  };
  const result = parseBackup(backupWith(body));
  assert.equal(result.ok, true, !result.ok ? result.reason : undefined);
});

test("a v2-shaped backup (scan images, no exercise photos) still passes", () => {
  const body = {
    data: { history: {} },
    photos: [],
    scanImages: [{ id: "scan-1", dataUrl: "data:image/jpeg;base64,AA==" }],
  };
  const result = parseBackup(backupWith(body));
  assert.equal(result.ok, true, !result.ok ? result.reason : undefined);
});

test("a v1-shaped backup (neither scan nor exercise photos) still passes", () => {
  const body = { data: { history: {} }, photos: [] };
  const result = parseBackup(backupWith(body));
  assert.equal(result.ok, true, !result.ok ? result.reason : undefined);
});

test("a file with a checksum that matches nothing is rejected, not half-imported", () => {
  const raw = JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    checksum: "00000000",
    data: { history: { "2026-01-01": { split: "Push" } } },
    photos: [],
  });
  const result = parseBackup(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /damaged/i);
});

test("a file truncated after export fails, rather than restoring partial data", () => {
  const body = {
    data: { history: { "2026-01-01": { split: "Push" } } },
    photos: [],
    scanImages: [],
    exercisePhotos: [{ key: "bench-press", dataUrl: "data:image/jpeg;base64,AA==" }],
  };
  const full = backupWith(body);
  const truncated = full.slice(0, Math.floor(full.length * 0.9));
  // The cut is very unlikely to land on valid JSON, but if it ever does, the
  // point of this test — a truncated file must not report success — still
  // holds either way.
  let result: ReturnType<typeof parseBackup>;
  try {
    result = parseBackup(truncated);
  } catch {
    return;
  }
  assert.equal(result.ok, false);
});
