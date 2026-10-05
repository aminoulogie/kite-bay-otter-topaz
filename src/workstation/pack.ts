import { useEffect, type RefObject } from "react";

/** Grid row unit and gap, matching .ws-packed in ws.css. */
const ROW = 4;
const GAP = 16;

/**
 * Masonry for the phone's widget grid when it is hosted on a desk.
 *
 * The desktop grid puts cards of different heights side by side, and a CSS
 * grid row is as tall as its tallest card, so every short card left a hole
 * under it. Here each card is given as many 4px rows as its own height needs;
 * the dense grid then slides the next card up into the space. Re-measured
 * whenever a card changes size or the page swaps its contents.
 */
export function usePackedGrids(root: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const seen = new WeakSet<Element>();
    const ro = new ResizeObserver(() => schedule());
    const pack = () => {
      raf = 0;
      for (const grid of el.querySelectorAll<HTMLElement>(".soma-grid")) {
        grid.classList.add("ws-packed");
        for (const item of Array.from(grid.children) as HTMLElement[]) {
          if (!seen.has(item)) {
            seen.add(item);
            ro.observe(item);
          }
          const h = item.getBoundingClientRect().height;
          // The whole grid-row, not just its end: a tile's own row-span class
          // sets the start to a span too, and then the end one is ignored.
          const span = h ? `auto / span ${Math.ceil((h + GAP) / ROW)}` : "auto / span 1";
          if (item.style.gridRow !== span) item.style.gridRow = span;
          item.style.marginBottom = h ? "" : "0";
        }
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(pack);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [root, key]);
}
