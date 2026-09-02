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
const DB_VERSION = 1;
const STORE = "photos";

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

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
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

/** Square centre-crop at `size`, re-encoded as JPEG. */
async function derive(file: Blob, size: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
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

/** Every date that has a photo, for any habit — used to badge the calendar. */
export async function allPhotoDates(): Promise<Set<string>> {
  const rows = await tx<HabitPhoto[]>("readonly", (s) => s.getAll());
  return new Set(rows.map((r) => r.date));
}

/**
 * Opens the camera on a phone and the file picker on a desktop. `capture`
 * asks for the rear camera directly; browsers that ignore it fall back to the
 * normal picker, which is the desired behaviour rather than an error.
 */
export function captureImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const done = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };

    input.addEventListener("change", () => done(input.files?.[0] ?? null));
    // There is no cancel event on a file input. Focus returning to the window
    // means the picker closed; if no file arrived by then, it was dismissed.
    window.addEventListener("focus", () => setTimeout(() => done(null), 400), { once: true });
    input.click();
  });
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
