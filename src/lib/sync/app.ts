import { useSoma } from "@/lib/store";
import { SyncEngine, type SyncMeta } from "./engine";

/** This device's sync settings and bookkeeping. Never synced, never in a backup. */
const META_KEY = "soma-sync-v1";

/** Filled in once the relay is deployed; until then it is typed in Settings. */
export const DEFAULT_SYNC_URL = "";

export const syncEngine = new SyncEngine({
  read: () => {
    const st = useSoma.getState();
    const part = useSoma.persist.getOptions().partialize;
    return (part ? part(st) : st) as Record<string, unknown>;
  },
  write: (next) => useSoma.setState(next as Partial<ReturnType<typeof useSoma.getState>>),
  load: () => {
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? (JSON.parse(raw) as SyncMeta) : null;
    } catch {
      return null;
    }
  },
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
});
