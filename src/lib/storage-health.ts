/**
 * Keeping the data alive on the device.
 *
 * Everything lives in localStorage and IndexedDB, and by default a browser is
 * free to evict both when it wants space — Safari is the most aggressive about
 * it. Asking for persistent storage is the one call that changes that, and
 * nothing was making it.
 *
 * This does not replace a backup. Persistent storage survives storage
 * pressure; it does not survive "Clear History and Website Data", deleting the
 * app, or losing the phone. It buys durability, not safety.
 */

export type PersistState = "persisted" | "denied" | "unsupported";

export interface StorageHealth {
  state: PersistState;
  usedBytes: number | null;
  quotaBytes: number | null;
}

/**
 * Asks the browser to keep this site's data.
 *
 * Safari grants it silently to sites added to the home screen; a browser tab
 * is usually refused, which is a normal outcome and not an error worth
 * surfacing as a failure.
 */
export async function requestPersistence(): Promise<PersistState> {
  if (!navigator.storage?.persist || !navigator.storage?.persisted) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "persisted";
    return (await navigator.storage.persist()) ? "persisted" : "denied";
  } catch {
    return "unsupported";
  }
}

export async function storageHealth(): Promise<StorageHealth> {
  let state: PersistState = "unsupported";
  if (navigator.storage?.persisted) {
    try {
      state = (await navigator.storage.persisted()) ? "persisted" : "denied";
    } catch {
      state = "unsupported";
    }
  }

  let usedBytes: number | null = null;
  let quotaBytes: number | null = null;
  if (navigator.storage?.estimate) {
    try {
      const e = await navigator.storage.estimate();
      usedBytes = e.usage ?? null;
      quotaBytes = e.quota ?? null;
    } catch {
      /* estimate is advisory; its absence is not a problem to report */
    }
  }
  return { state, usedBytes, quotaBytes };
}

export function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- backups ---

const LAST_BACKUP_KEY = "soma-last-backup";

export function markBackedUp(): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    /* a full or blocked store must not break the export that just succeeded */
  }
}

export function lastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function daysSinceBackup(): number | null {
  const d = lastBackupAt();
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/**
 * Whether to nudge for a backup. Never backed up counts as due — that is the
 * state where the most is at stake and the least is obvious.
 */
export function backupIsDue(afterDays = 7): boolean {
  const n = daysSinceBackup();
  return n === null || n >= afterDays;
}
