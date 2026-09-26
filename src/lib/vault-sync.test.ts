import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBackup, BACKUP_FORMAT, BACKUP_VERSION, type Backup } from "./backup.ts";
import { stripPhotosForVault } from "./vault-sync.ts";

/**
 * writeVaultPhotos/readVaultPhotos themselves need a real FileSystemDirectoryHandle
 * and real IndexedDB, neither available under plain Node — they are covered by an
 * in-browser round trip instead (Origin Private File System stands in for a picked
 * folder, so no native dialog is needed). What IS plain-Node testable, and the part
 * most likely to silently regress into the exact "damaged backup" bug this session
 * already found and fixed once, is stripPhotosForVault's checksum: it has to be
 * recomputed over exactly the body it writes, every time that body's shape changes.
 */

function fakeBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    checksum: "whatever-buildBackup-computed-for-the-bulky-body",
    data: { history: { "2026-01-01": { split: "Push" } } },
    photos: [{ habitId: "h1", date: "2026-01-01", thumb: "data:image/jpeg;base64,AA==", display: "data:image/jpeg;base64,AA==", ts: 1 }],
    scanImages: [{ id: "scan:1", dataUrl: "data:image/jpeg;base64,AA==" }],
    exercisePhotos: [{ key: "ex1", dataUrl: "data:image/jpeg;base64,AA==" }],
    ...overrides,
  };
}

test("a stripped backup with no photos left over passes its own checksum", () => {
  const stripped = stripPhotosForVault(fakeBackup(), []);
  assert.deepEqual(stripped.photos, []);
  assert.deepEqual(stripped.exercisePhotos, []);
  assert.deepEqual(stripped.scanImages, []);
  const result = parseBackup(JSON.stringify(stripped));
  assert.equal(result.ok, true, !result.ok ? result.reason : undefined);
});

test("kept (non-photo) scan entries survive stripping and still pass checksum", () => {
  const kept = [{ id: "mesh:1", dataUrl: JSON.stringify([1, 2, 3]) }];
  const stripped = stripPhotosForVault(fakeBackup(), kept);
  assert.deepEqual(stripped.scanImages, kept);
  const result = parseBackup(JSON.stringify(stripped));
  assert.equal(result.ok, true, !result.ok ? result.reason : undefined);
  if (result.ok) assert.deepEqual(result.backup.scanImages, kept);
});

test("stripping never leaves the ORIGINAL (bulky-body) checksum behind", () => {
  const original = fakeBackup();
  const stripped = stripPhotosForVault(original, []);
  assert.notEqual(stripped.checksum, original.checksum);
});

test("the data section itself is untouched by stripping", () => {
  const original = fakeBackup();
  const stripped = stripPhotosForVault(original, []);
  assert.deepEqual(stripped.data, original.data);
});
