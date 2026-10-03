import { useEffect, useRef } from "react";

/**
 * A side panel that follows the finger.
 *
 * The old edge hooks waited for the finger to lift and then played a fixed
 * animation, so the panel lagged the gesture and jumped. Here the panel is
 * moved on every touchmove (writes go straight to the element's style, no
 * React render in the loop, so it runs at the display's 120 Hz), and on
 * release it settles open or shut from where it is, by distance and speed.
 *
 * Opening starts within `edge` px of the panel's side. Closing works by
 * dragging anywhere on the open panel back the way it came; anything that
 * scrolls sideways inside opts out with `data-no-swipe-close`.
 */
export function useDragPanel({
  side, open, setOpen, enabled = true, edge = 24,
}: {
  side: "left" | "right";
  open: boolean;
  setOpen: (open: boolean) => void;
  enabled?: boolean;
  edge?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const setRef = useRef(setOpen);
  setRef.current = setOpen;

  useEffect(() => {
    if (!enabled) return;
    const dir = side === "left" ? -1 : 1; // which way "hidden" is

    let active = false;
    let locked: "x" | "y" | null = null;
    let fromOpen = false;
    let startX = 0;
    let startY = 0;
    let width = 1;
    let offset = 0; // 0 = fully open, width = fully hidden
    let samples: { x: number; t: number }[] = [];

    const apply = (px: number, animate: boolean) => {
      const p = panelRef.current;
      const b = backdropRef.current;
      if (!p) return;
      const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
      // Tailwind 4's translate-x-* classes use the `translate` property, so
      // that is the one to override (a `transform` would add to it).
      p.style.transition = animate ? `translate 320ms ${ease}` : "none";
      p.style.translate = `${dir * px}px 0`;
      if (b) {
        b.style.transition = animate ? `opacity 320ms ${ease}` : "none";
        b.style.opacity = String(1 - px / width);
        b.style.pointerEvents = "none";
      }
    };

    const release = () => {
      const p = panelRef.current;
      const b = backdropRef.current;
      // Hand control back to the classes once they match the state.
      const clear = () => {
        for (const el of [p, b]) {
          if (!el) continue;
          el.style.transition = "";
          el.style.translate = "";
          el.style.opacity = "";
          el.style.pointerEvents = "";
        }
      };
      window.setTimeout(clear, 340);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const p = panelRef.current;
      if (!p) return;
      const target = e.target as Element | null;
      if (openRef.current) {
        if (!p.contains(target) || target?.closest?.("[data-no-swipe-close], input, textarea, [role=dialog] [role=dialog]")) return;
        fromOpen = true;
      } else {
        const atEdge = side === "left" ? t.clientX <= edge : t.clientX >= window.innerWidth - edge;
        if (!atEdge) return;
        fromOpen = false;
      }
      active = true;
      locked = null;
      startX = t.clientX;
      startY = t.clientY;
      width = p.getBoundingClientRect().width || window.innerWidth;
      samples = [{ x: t.clientX, t: e.timeStamp }];
    };

    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!locked) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        locked = Math.abs(dx) > Math.abs(dy) * 1.1 ? "x" : "y";
        if (locked === "y") {
          active = false;
          return;
        }
      }
      e.preventDefault();
      // Distance travelled towards "open" (positive) for this side.
      const towardOpen = side === "left" ? dx : -dx;
      offset = fromOpen
        ? Math.min(width, Math.max(0, -towardOpen))
        : Math.min(width, Math.max(0, width - towardOpen));
      apply(offset, false);
      samples.push({ x: t.clientX, t: e.timeStamp });
      if (samples.length > 6) samples.shift();
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      if (locked !== "x") return;
      const a = samples[0]!;
      const z = samples[samples.length - 1]!;
      const v = (z.x - a.x) / Math.max(1, z.t - a.t); // px/ms
      const vOpen = side === "left" ? v : -v;
      const shouldOpen = Math.abs(vOpen) > 0.35 ? vOpen > 0 : offset < width / 2;
      apply(shouldOpen ? 0 : width, true);
      if (shouldOpen !== openRef.current) setRef.current(shouldOpen);
      release();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [side, enabled, edge]);

  return { panelRef, backdropRef };
}
