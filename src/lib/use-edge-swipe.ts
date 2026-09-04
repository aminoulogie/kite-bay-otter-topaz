import { useEffect } from "react";

/**
 * Opens on a rightward swipe that STARTS near the left edge.
 *
 * Edge-anchored on purpose: the views contain horizontally scrollable strips
 * (meal chips, the year heatmap), and a gesture that fired anywhere would
 * fight them. Requiring the touch to begin in the first `edge` pixels keeps
 * the two from overlapping.
 *
 * The vertical check matters just as much — without it, any downward scroll
 * with a slight rightward drift opens the drawer.
 */
export function useEdgeSwipe(onOpen: () => void, enabled = true, edge = 28) {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      tracking = t.clientX <= edge;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // Travel far enough right, and mostly horizontally.
      if (dx > 60 && dx > dy * 1.5) onOpen();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [onOpen, enabled, edge]);
}

/**
 * Opens on a LEFTWARD swipe that starts near the right edge.
 *
 * The mirror of useEdgeSwipe, and right-anchored for two separate reasons.
 * iOS reserves the left edge for its own back gesture, so anchoring there
 * would fight the system. And the views hold horizontally scrollable strips —
 * the muscle-group pills, the database table — which a gesture firing anywhere
 * on screen would hijack mid-scroll.
 *
 * The vertical ratio check is what stops a downward scroll with a little
 * leftward drift from opening it.
 */
export function useRightEdgeSwipe(onOpen: () => void, enabled = true, edge = 28) {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      tracking = t.clientX >= window.innerWidth - edge;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = startX - t.clientX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > 60 && dx > dy * 1.5) onOpen();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [onOpen, enabled, edge]);
}
