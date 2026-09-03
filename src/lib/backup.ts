/**
 * Backup and restore.
 *
 * The app keeps everything on one device, so a backup file is the only thing
 * standing between a cleared Safari and years of training history. That makes
 * three things non-negotiable here:
 *
 *  1. It has to include habit photos. They live in IndexedDB rather than the
 *     zustand store, so a JSON dump of the store silently leaves them behind.
 *  2. Restoring has to reject a file that is not a SOMA backup. Replacing the
 *     whole store on any parsed object means picking the wrong file wipes
 *     everything and reports success.
 *  3. Saving has to work inside an iOS home-screen app, where a synthesised
 *     anchor download does nothing at all.
 */

import { allPhotos, putPhotoRecord, type HabitPhoto } from "./habit-photos";

export const BACKUP_FORMAT = "soma-backup";
export const BACKUP_VERSION = 1;

export interface BackupPhoto {
  habitId: string;
  date: string;
  thumb: string;
  display: string;
  ts: number;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
  photos: BackupPhoto[];
}

export interface BackupSummary {
  exportedAt: string;
  sessions: number;
  loggedDays: number;
  habits: number;
  photos: number;
  customExercises: number;
  customFoods: number;
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read image"));
    r.readAsDataURL(b);
  });

const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();

export async function buildBackup(data: Record<string, unknown>): Promise<Backup> {
  const rows = await allPhotos();
  const photos: BackupPhoto[] = [];
  for (const p of rows) {
    photos.push({
      habitId: p.habitId,
      date: p.date,
      ts: p.ts,
      thumb: await blobToDataUrl(p.thumb),
      display: await blobToDataUrl(p.display),
    });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    photos,
  };
}

export type ParseResult =
  | { ok: true; backup: Backup; summary: BackupSummary }
  | { ok: false; reason: string };

/**
 * Strict on purpose. The old check accepted any parsed object, so restoring an
 * unrelated JSON file replaced history with {} and said "Restored".
 */
export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "That file is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "That file does not contain a backup." };
  }

  const b = parsed as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT) {
    return { ok: false, reason: "That is not a SOMA backup file." };
  }
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: `That backup was written by a newer version of SOMA (v${String(b.version)}).`,
    };
  }
  if (!b.data || typeof b.data !== "object") {
    return { ok: false, reason: "That backup is missing its data." };
  }

  const d = b.data as Record<string, any>;
  const photos = Array.isArray(b.photos) ? b.photos : [];
  return {
    ok: true,
    backup: { ...(b as Backup), photos },
    summary: {
      exportedAt: b.exportedAt ?? "unknown date",
      sessions: Object.keys(d.history ?? {}).length,
      loggedDays: Object.keys(d.nutrition ?? {}).length,
      habits: Array.isArray(d.habits) ? d.habits.length : 0,
      photos: photos.length,
      customExercises: Array.isArray(d.customExercises) ? d.customExercises.length : 0,
      customFoods: Array.isArray(d.customFoods) ? d.customFoods.length : 0,
    },
  };
}

/** Writes the photo half of a backup back into IndexedDB. */
export async function restorePhotos(photos: BackupPhoto[]): Promise<number> {
  let n = 0;
  for (const p of photos) {
    try {
      const row: HabitPhoto = {
        key: `${p.habitId}:${p.date}`,
        habitId: p.habitId,
        date: p.date,
        ts: p.ts,
        thumb: await dataUrlToBlob(p.thumb),
        display: await dataUrlToBlob(p.display),
      };
      await putPhotoRecord(row);
      n++;
    } catch {
      // One unreadable image must not abort the rest of the restore.
    }
  }
  return n;
}

/**
 * Hands the file to the user.
 *
 * An anchor download is inert inside an iOS home-screen app — which is exactly
 * where this app is installed — so the share sheet is tried first. That is the
 * route to Files, iCloud Drive or AirDrop on the device the data lives on.
 */
export async function saveBackupFile(json: string, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([json], filename, { type: "application/json" });

  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: "SOMA backup" });
      return "shared";
    } catch (err) {
      // A cancelled share is a decision, not a failure to fall through from.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Must be in the document for the click to count in several browsers.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
