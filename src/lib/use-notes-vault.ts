import { useEffect } from "react";
import { mirrorNotes, storedNotesVault, supportsNotesVault } from "./notes-vault";

/** Mirrors the vault every minute while the app is open, if one is connected and allowed. */
export function useNotesVaultLoop() {
  useEffect(() => {
    if (!supportsNotesVault()) return;
    let running = false;
    const tick = async () => {
      if (running || document.hidden) return;
      const h = await storedNotesVault();
      if (!h) return;
      running = true;
      try {
        await mirrorNotes(h);
      } catch (err) {
        console.warn("notes vault:", err);
      } finally {
        running = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 60_000);
    return () => window.clearInterval(id);
  }, []);
}
