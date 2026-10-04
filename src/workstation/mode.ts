import { useEffect, useState } from "react";
import { useSoma } from "@/lib/store";

/** Wide enough, with a mouse: a desk, not a phone. */
const DESK = "(min-width: 1100px) and (pointer: fine)";

/** Running inside the Windows app (src-tauri). */
export const inDesktopApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Whether to show the workstation. On by default at a desk — in the Windows
 * app always — and switchable back to the classic layout per device.
 */
export function useWorkstation(): boolean {
  const pref = useSoma((s) => s.settings.workstation);
  const [desk, setDesk] = useState(() => typeof window !== "undefined" && window.matchMedia(DESK).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESK);
    const on = () => setDesk(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (pref === false) return false;
  return inDesktopApp() || desk;
}
