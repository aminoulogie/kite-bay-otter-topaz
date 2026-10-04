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
  const [desk, setDesk] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESK).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESK);
    // Printing lays the page out at paper width, which is narrower than a
    // desk: without this the workstation would swap itself for the phone
    // layout mid-print and the report would print blank.
    let printing = false;
    const before = () => (printing = true);
    const after = () => {
      printing = false;
      setDesk(mq.matches);
    };
    const on = () => !printing && !window.matchMedia("print").matches && setDesk(mq.matches);
    mq.addEventListener("change", on);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      mq.removeEventListener("change", on);
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  if (pref === false) return false;
  return inDesktopApp() || desk;
}
