import { useSoma } from "@/lib/store";
import { collectSideStores, restoreSideStores } from "@/lib/side-stores";
import { getLocalDateKey } from "@/lib/soma/dates";
import { SyncEngine, trimHistory, type SyncHistoryEntry, type SyncMeta } from "./engine";
import { sideChanged, sideFields, sideFromFields, SIDE_FIELDS, SYNC_SCHEMA, withDevice, type DeviceInfo } from "./side";

/** This device's sync settings and bookkeeping. Never synced, never in a backup. */
const META_KEY = "soma-sync-v1";
/** The other devices' versions, as last synced. Bookkeeping, not data. */
const DEVICES_KEY = "soma-sync-devices";
/** What recent pulls replaced, so one can be undone. Per device. */
const HISTORY_KEY = "soma-sync-history";

/** The relay (server/sync), deployed by .github/workflows/sync-server.yml. Can be changed in Settings. */
export const DEFAULT_SYNC_URL = "https://soma-sync.aminemedlassal.workers.dev";

function loadMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}

export function loadDevices(): DeviceInfo[] {
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as DeviceInfo[]) : [];
  } catch {
    return [];
  }
}

function deviceKind(): DeviceInfo["kind"] {
  const g = globalThis as { Capacitor?: { isNativePlatform?: () => boolean }; __TAURI_INTERNALS__?: unknown };
  if (g.Capacitor?.isNativePlatform?.()) return "phone";
  if (g.__TAURI_INTERNALS__) return "desktop";
  return "browser";
}

/** This device as the others see it. */
export function thisDevice(): DeviceInfo | null {
  const meta = loadMeta();
  if (!meta) return null;
  return { id: meta.device, version: __APP_VERSION__, schema: SYNC_SCHEMA, kind: deviceKind(), seen: getLocalDateKey() };
}

export const syncEngine = new SyncEngine({
  read: () => {
    const st = useSoma.getState();
    const part = useSoma.persist.getOptions().partialize;
    const me = thisDevice();
    return {
      ...((part ? part(st) : st) as Record<string, unknown>),
      ...sideFields(collectSideStores()),
      ...(me ? { syncDevices: withDevice(loadDevices(), me) } : {}),
    };
  },
  write: (next) => {
    const rest: Record<string, unknown> = { ...next };
    for (const k of SIDE_FIELDS) delete rest[k];
    if (Array.isArray(rest.syncDevices)) {
      try {
        localStorage.setItem(DEVICES_KEY, JSON.stringify(rest.syncDevices));
      } catch {
        /* only a warning depends on it */
      }
      window.dispatchEvent(new Event("soma-sync-meta"));
    }
    delete rest.syncDevices;

    const side = sideFromFields(next);
    const current = collectSideStores();
    if (side && sideChanged(side, current)) {
      const written = restoreSideStores({ ...current, ...side }, "replace");
      if (written) rest.programs = written.programs ?? [];
      if (written?.activeProgramId) rest.activeProgramId = written.activeProgramId;
    }
    useSoma.setState(rest as Partial<ReturnType<typeof useSoma.getState>>);
  },
  load: loadMeta,
  save: (meta) => {
    try {
      if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
      else localStorage.removeItem(META_KEY);
    } catch {
      /* storage full or blocked: the next run retries */
    }
    window.dispatchEvent(new Event("soma-sync-meta"));
  },
  fetch: (...a) => fetch(...a),
  loadHistory: () => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(v) ? (v as SyncHistoryEntry[]) : [];
    } catch {
      return [];
    }
  },
  saveHistory: (h) => {
    // If storage is tight, keep fewer entries rather than none, and never
    // let the undo buffer be what fills the disk under the real data.
    let saved = false;
    for (let list = h; list.length && !saved; list = trimHistory(list.slice(1))) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
        saved = true;
      } catch {
        /* try with fewer */
      }
    }
    if (!saved) {
      try {
        localStorage.removeItem(HISTORY_KEY);
      } catch {
        /* nothing to free */
      }
    }
    window.dispatchEvent(new Event("soma-sync-meta"));
  },
});
