import { useEffect } from "react";
import { useSoma } from "@/lib/store";
import { syncEngine } from "@/lib/sync/app";

/**
 * Runs sync in the background while it is switched on: at start, every 20
 * seconds, when the app comes back to the front, and a moment after anything
 * changes.
 */
export function SyncRunner() {
  useEffect(() => {
    let changed = 0;
    const run = () => {
      if (syncEngine.meta()) void syncEngine.sync();
    };
    run();
    const tick = window.setInterval(run, 20_000);
    const onShow = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onShow);
    const unsub = useSoma.subscribe(() => {
      window.clearTimeout(changed);
      changed = window.setTimeout(run, 2_000);
    });
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(changed);
      document.removeEventListener("visibilitychange", onShow);
      unsub();
    };
  }, []);
  return null;
}
