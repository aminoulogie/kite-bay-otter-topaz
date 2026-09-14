import { fitWithin } from "./fit-image.ts";
import { pickFiles } from "./file-picker.ts";
/**
 * Habit photos.
 *
 * Kept in IndexedDB, deliberately apart from the zustand store. That store
 * persists to localStorage, which is a ~5MB string-only budget — a handful of
 * base64 photos would blow it and take every logged workout down with it.
 * IndexedDB stores Blobs natively and has orders of magnitude more room.
 *
 * Two derivatives per capture: a small square thumbnail for calendar cells,
 * and a larger one for the viewer. Painting a month grid from full-size photos
 * would move tens of megabytes to render a few hundred kilobytes.
 */

const DB_NAME = "soma-habit-photos";
/**
 * v2 adds the scan store, v3 the book files. Object stores in the SAME
 * database rather than databases of their own, deliberately: the backup
 * coverage test asserts the app opens exactly one IndexedDB, because a second
 * one is a second thing to remember at backup time and that is precisely how
 * four localStorage keys went missing from every backup for months.
 */
const DB_VERSION = 3;
const STORE = "photos";
/** Face and posture captures, as data URLs keyed by scan id. */
const SCAN_STORE = "scans";
/** Imported PDFs and EPUBs, as Blobs keyed by book id. See lib/book-files.ts. */
export const BOOK_STORE = "books";

const THUMB_PX = 320;
const DISPLAY_PX = 1080;

export interface HabitPhoto {
  key: string;
  habitId: string;
  date: string;
  thumb: Blob;
  display: Blob;
  ts: number;
}

const keyOf = (habitId: string, date: string) => `${habitId}:${date}`;

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * The app's one local blob store.
 *
 * Exported so a module that owns a different KIND of blob — book files — can
 * add a store to it without opening a database of its own. One `indexedDB.open`
 * in the codebase is a rule the backup test enforces, and it is the right rule:
 * the second database is the one nobody remembers to back up.
 */
export function openBlobDb(): Promise<IDBDatabase> {
  return open();
}

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(SCAN_STORE)) {
        // Keyed externally rather than by a field: a scan image is a bare
        // string, and wrapping it in a record to carry its own key would mean
        // migrating anything already stored.
        db.createObjectStore(SCAN_STORE);
      }
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

/**
 * The image, fitted to a long-edge budget, re-encoded as JPEG.
 *
 * This used to centre-crop to a SQUARE, which was written for habit tiles and
 * was quietly destroying every book cover: a 500x800 cover lost its top and
 * bottom to the crop, was then upscaled to 1080x1080, and was finally cropped
 * back down by the shelf's 1:1.6 box. See lib/fit-image.ts for the arithmetic
 * and why never upscaling is the half that matters.
 *
 * Cropping now happens in CSS, at draw time, against the box the image is
 * actually in — which is reversible, where destroying the pixels was not. The
 * habit tiles look identical, because they were already `object-cover`.
 */
async function derive(file: Blob, size: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const box = fitWithin({ width: bitmap.width, height: bitmap.height }, size);
  if (!box.width || !box.height) {
    bitmap.close?.();
    throw new Error("That image has no size to read.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device.");
  // Downscaling in one step is what makes a shrunk photo soft; the browser's
  // high-quality path is the one thing here that costs nothing to ask for.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, box.width, box.height);
  bitmap.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode that image."))),
      "image/jpeg",
      quality,
    );
  });
}

export async function savePhoto(habitId: string, date: string, file: Blob): Promise<HabitPhoto> {
  const [thumb, display] = await Promise.all([
    derive(file, THUMB_PX, 0.72),
    derive(file, DISPLAY_PX, 0.82),
  ]);
  const row: HabitPhoto = { key: keyOf(habitId, date), habitId, date, thumb, display, ts: Date.now() };
  await tx("readwrite", (s) => s.put(row));
  return row;
}

export async function getPhoto(habitId: string, date: string): Promise<HabitPhoto | null> {
  const row = await tx<HabitPhoto | undefined>("readonly", (s) => s.get(keyOf(habitId, date)));
  return row ?? null;
}

export async function deletePhoto(habitId: string, date: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(keyOf(habitId, date)));
}

/**
 * Thumbnails for one habit, as date -> blob. Only thumbs are read; pulling
 * display blobs to paint a grid would be wasteful by two orders of magnitude.
 */
export async function thumbsFor(habitId: string): Promise<Map<string, Blob>> {
  const rows = await tx<HabitPhoto[]>("readonly", (s) => s.getAll());
  const out = new Map<string, Blob>();
  for (const r of rows) if (r.habitId === habitId) out.set(r.date, r.thumb);
  return out;
}

/** Every stored photo — the backup needs the blobs themselves, not just dates. */
export function allPhotos(): Promise<HabitPhoto[]> {
  return tx<HabitPhoto[]>("readonly", (s) => s.getAll());
}

/** Writes a photo row straight back, used when restoring a backup. */
export async function putPhotoRecord(row: HabitPhoto): Promise<void> {
  await tx("readwrite", (s) => s.put(row));
}

/** Every date that has a photo, for any habit — used to badge the calendar. */
export async function allPhotoDates(): Promise<Set<string>> {
  const rows = await tx<HabitPhoto[]>("readonly", (s) => s.getAll());
  return new Set(rows.map((r) => r.date));
}

/**
 * Opens the camera on a phone and the file picker on a desktop.
 *
 * `capture` asks for the rear camera directly; browsers that ignore it fall
 * back to the normal picker, which is the desired behaviour rather than an
 * error. The awkward parts of waiting for the answer live in file-picker.ts —
 * they are the same on a photo from iCloud as on a book from Files.
 */
export async function captureImage(): Promise<File | null> {
  const files = await pickFiles({ accept: "image/*", capture: "environment" });
  return files[0] ?? null;
}

/**
 * Object URLs must be revoked or every repaint leaks the blob it painted.
 * A pool makes that one call at the top of a render rather than per image.
 */
export class ObjectUrlPool {
  private urls: string[] = [];

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.push(url);
    return url;
  }

  releaseAll(): void {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }
}


/**
 * Scan images: the actual photographs behind a Face File.
 *
 * Stored as data URLs rather than Blobs, which is how the analyser receives
 * them and how they go into a backup — converting on every read and write to
 * save a third of the bytes would cost more than it saves for a handful of
 * images kept per month.
 */
function scanTx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(SCAN_STORE, mode);
        const req = run(t.objectStore(SCAN_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

export async function saveScanImage(id: string, dataUrl: string): Promise<void> {
  if (!id || !dataUrl) return;
  await scanTx("readwrite", (s) => s.put(dataUrl, id));
}

export async function loadScanImage(id: string): Promise<string | null> {
  if (!id) return null;
  const row = await scanTx<string | undefined>("readonly", (s) => s.get(id));
  return row ?? null;
}

export async function deleteScanImage(id: string): Promise<void> {
  await scanTx("readwrite", (s) => s.delete(id));
}

/** Every scan image, for the backup. */
export async function allScanImages(): Promise<{ id: string; dataUrl: string }[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(SCAN_STORE, "readonly");
    const store = t.objectStore(SCAN_STORE);
    const keys = store.getAllKeys();
    const values = store.getAll();
    t.oncomplete = () => {
      const ids = (keys.result as IDBValidKey[]).map(String);
      const rows = values.result as string[];
      resolve(ids.map((id, i) => ({ id, dataUrl: rows[i]! })).filter((r) => r.dataUrl));
    };
    t.onerror = () => reject(t.error ?? new Error("Could not read scan images"));
  });
}
