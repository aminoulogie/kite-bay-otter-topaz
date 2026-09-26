import { checksum } from "./checksum.ts";
import {
  getVaultHandle, setVaultHandle, clearVaultHandle,
  putPhotoRecord, saveScanImage, putExercisePhotoRecord,
} from "./habit-photos.ts";
import type { Backup, BackupExercisePhoto, BackupPhoto, ScanImage } from "./backup.ts";

/**
 * A folder, synced by iCloud Drive (or Dropbox, or anything else that syncs a
 * folder), holding one file this app reads and writes. Not real-time — there
 * is no server here, so "synced" means "whatever the sync client already
 * copied down by the time this device next opens the file."
 *
 * Only Chromium (desktop Chrome, Edge) exposes the File System Access API
 * this needs. Safari and iOS have neither it nor any equivalent — on those
 * platforms the existing Save backup / Restore backup buttons ARE the vault:
 * the share sheet already reaches "Save to Files → iCloud Drive", and the
 * file picker already reaches "Browse → iCloud Drive" to read it back. This
 * module exists for the platform that can do better than a share sheet.
 */

export const VAULT_FILENAME = "soma-vault.json";

export function supportsVaultFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

/** Opens the native folder picker and remembers the choice for next time. */
export async function pickVaultFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await setVaultHandle(handle);
  return handle;
}

/**
 * The previously-chosen folder, if permission is still granted.
 *
 * A handle surviving in IndexedDB does not mean the browser still trusts it —
 * permission can be revoked (a site-data clear, a different profile) without
 * the handle itself disappearing, so this is the one place that is allowed to
 * come back empty even though something was stored.
 */
export async function getStoredVaultFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getVaultHandle();
  if (!handle) return null;
  try {
    return (await verifyPermission(handle, "readwrite")) ? handle : null;
  } catch {
    // The handle can throw rather than resolve "denied" if its underlying
    // path is gone entirely (folder deleted, drive unmounted).
    return null;
  }
}

export async function forgetVaultFolder(): Promise<void> {
  await clearVaultHandle();
}

export async function writeVaultFile(handle: FileSystemDirectoryHandle, json: string): Promise<void> {
  const fileHandle = await handle.getFileHandle(VAULT_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(json);
  await writable.close();
}

/** The vault file's contents and when it was last written, or null if it has never been synced to. */
export async function readVaultFile(
  handle: FileSystemDirectoryHandle,
): Promise<{ text: string; modified: number } | null> {
  try {
    const fileHandle = await handle.getFileHandle(VAULT_FILENAME);
    const file = await fileHandle.getFile();
    return { text: await file.text(), modified: file.lastModified };
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotFoundError") return null;
    throw err;
  }
}

// ------------------------------------------------------------- vault photos --
//
// A backup's photos travel as base64 text inside its JSON because that JSON
// is one self-contained file, which is the whole point of a disaster-recovery
// backup: Save backup / Restore backup keeps that shape exactly as it is,
// unchanged by anything below.
//
// The vault is a folder, not a single file, so it does not need that trick —
// a photo can just be a photo, a real .jpg sitting in <vault>/photos where
// any app (or a person in Finder or Explorer) can open it directly. That is
// also the only way an iPhone gets any real use out of these without SOMA's
// own code running there at all: they are ordinary files in an iCloud Drive
// folder, so the Files app already shows them.

const PHOTO_DIR = "photos";
const THUMB_SUFFIX = ".thumb.jpg";
const DISPLAY_SUFFIX = ".display.jpg";
const META_SUFFIX = ".meta.json";

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read image"));
    r.readAsDataURL(b);
  });

const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();

async function subDir(root: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(name, { create: true });
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, contents: Blob): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

/**
 * The scan store (see lib/aether/*.ts) is not only photos under another
 * name — the same saveScanImage/allScanImages pair also holds a 3D scan's
 * mesh, depth grid, point cloud and raw capture, each just a JSON or
 * float32-encoded string wearing the same {id, dataUrl} shape a photo does.
 * Only a real photo can safely become a .jpg file; treating the rest of it
 * as image bytes would either throw converting it or write a file that is
 * not actually a JPEG despite its name. A real captured photo always comes
 * from canvas.toDataURL, so it is the one shape that always starts this way.
 */
function isImageDataUrl(s: string): boolean {
  return s.startsWith("data:image/");
}

/**
 * A backup's checksum is computed over exactly {data, photos, scanImages,
 * exercisePhotos} — see parseBackup. Changing those arrays without
 * recomputing it would make every vault file fail its own check the moment
 * it was read back, the exact bug that made a perfectly good backup report
 * itself "damaged". This keeps the two in lockstep the same way buildBackup
 * itself does: the checksum is computed over precisely what gets written.
 *
 * `keptScanImages` is whatever writeVaultPhotos did NOT turn into files —
 * the non-photo scan data, which stays embedded exactly as a full backup
 * already carries it, since there is nowhere else for it to safely go.
 */
export function stripPhotosForVault(backup: Backup, keptScanImages: ScanImage[]): Backup {
  const body = {
    data: backup.data,
    photos: [] as BackupPhoto[],
    scanImages: keptScanImages,
    exercisePhotos: [] as BackupExercisePhoto[],
  };
  return { ...backup, ...body, checksum: checksum(JSON.stringify(body)) };
}

/**
 * Writes every photo in a backup out as real files under <vault>/photos —
 * habit photos and exercise photos always, scan images only the ones that
 * are actually pictures. Returns how many files it wrote, and the scan
 * entries it left untouched for stripPhotosForVault to keep in the JSON.
 */
export async function writeVaultPhotos(
  handle: FileSystemDirectoryHandle,
  backup: Backup,
): Promise<{ written: number; keptScanImages: ScanImage[] }> {
  const root = await subDir(handle, PHOTO_DIR);
  let n = 0;

  const habitDir = await subDir(root, "habit");
  for (const p of backup.photos) {
    const key = encodeURIComponent(`${p.habitId}:${p.date}`);
    await writeFile(habitDir, key + THUMB_SUFFIX, await dataUrlToBlob(p.thumb));
    await writeFile(habitDir, key + DISPLAY_SUFFIX, await dataUrlToBlob(p.display));
    await writeFile(
      habitDir, key + META_SUFFIX,
      new Blob([JSON.stringify({ ts: p.ts })], { type: "application/json" }),
    );
    n++;
  }

  const scanDir = await subDir(root, "scan");
  const keptScanImages: ScanImage[] = [];
  for (const img of backup.scanImages ?? []) {
    if (!isImageDataUrl(img.dataUrl)) {
      keptScanImages.push(img);
      continue;
    }
    await writeFile(scanDir, encodeURIComponent(img.id) + ".jpg", await dataUrlToBlob(img.dataUrl));
    n++;
  }

  const exerciseDir = await subDir(root, "exercise");
  for (const p of backup.exercisePhotos ?? []) {
    await writeFile(exerciseDir, encodeURIComponent(p.key) + ".jpg", await dataUrlToBlob(p.dataUrl));
    n++;
  }

  return { written: n, keptScanImages };
}

/**
 * Reads <vault>/photos back into IndexedDB directly — there is no JSON round
 * trip to go through, since writeVaultPhotos is the only thing that puts
 * anything there and it never writes metadata anywhere else. Missing
 * subfolders (nothing of that kind has been pushed from any device yet) are
 * silently skipped rather than treated as an error.
 */
export async function readVaultPhotos(handle: FileSystemDirectoryHandle): Promise<number> {
  const root = await handle.getDirectoryHandle(PHOTO_DIR).catch(() => null);
  if (!root) return 0;
  let n = 0;

  const habitDir = await root.getDirectoryHandle("habit").catch(() => null);
  if (habitDir) {
    const metas = new Map<string, { ts: number }>();
    const thumbs = new Map<string, File>();
    const displays = new Map<string, File>();
    for await (const [name, entryHandle] of habitDir.entries()) {
      if (entryHandle.kind !== "file") continue;
      const file = await (entryHandle as FileSystemFileHandle).getFile();
      if (name.endsWith(META_SUFFIX)) {
        metas.set(name.slice(0, -META_SUFFIX.length), JSON.parse(await file.text()));
      } else if (name.endsWith(THUMB_SUFFIX)) {
        thumbs.set(name.slice(0, -THUMB_SUFFIX.length), file);
      } else if (name.endsWith(DISPLAY_SUFFIX)) {
        displays.set(name.slice(0, -DISPLAY_SUFFIX.length), file);
      }
    }
    for (const [key, thumb] of thumbs) {
      const display = displays.get(key);
      // A thumb with no matching display is a half-written pair (the sync
      // that wrote it was interrupted between the two files) — skipped
      // rather than restored looking like a photo that has no display size.
      if (!display) continue;
      const decoded = decodeURIComponent(key);
      const sep = decoded.lastIndexOf(":");
      if (sep < 0) continue;
      await putPhotoRecord({
        key: decoded,
        habitId: decoded.slice(0, sep),
        date: decoded.slice(sep + 1),
        ts: metas.get(key)?.ts ?? Date.now(),
        thumb, display,
      });
      n++;
    }
  }

  const scanDir = await root.getDirectoryHandle("scan").catch(() => null);
  if (scanDir) {
    for await (const [name, entryHandle] of scanDir.entries()) {
      if (entryHandle.kind !== "file" || !name.endsWith(".jpg")) continue;
      const file = await (entryHandle as FileSystemFileHandle).getFile();
      await saveScanImage(decodeURIComponent(name.slice(0, -4)), await blobToDataUrl(file));
      n++;
    }
  }

  const exerciseDir = await root.getDirectoryHandle("exercise").catch(() => null);
  if (exerciseDir) {
    for await (const [name, entryHandle] of exerciseDir.entries()) {
      if (entryHandle.kind !== "file" || !name.endsWith(".jpg")) continue;
      const file = await (entryHandle as FileSystemFileHandle).getFile();
      await putExercisePhotoRecord({
        key: decodeURIComponent(name.slice(0, -4)),
        blob: file,
        ts: file.lastModified || Date.now(),
      });
      n++;
    }
  }

  return n;
}
