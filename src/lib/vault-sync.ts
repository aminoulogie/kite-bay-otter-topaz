import { getVaultHandle, setVaultHandle, clearVaultHandle } from "./habit-photos.ts";

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
