import { useEffect, useState } from "react";
import { SIDE_STORES_RESTORED } from "./side-stores";

/**
 * A counter that changes whenever a restore has rewritten the side stores.
 *
 * The screens owning those keys read them once into `useState`, which is right
 * for every other path — nothing else edits them from outside the screen. A
 * restore does, and without this the calendar kept drawing the pre-restore
 * membership bands, and the meal builder the pre-restore recipes, until the app
 * was force-quit. Depend on this in an effect that re-reads.
 */
export function useSideStoreRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((n) => n + 1);
    window.addEventListener(SIDE_STORES_RESTORED, bump);
    return () => window.removeEventListener(SIDE_STORES_RESTORED, bump);
  }, []);
  return rev;
}
