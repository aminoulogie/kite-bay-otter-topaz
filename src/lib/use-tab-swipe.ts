import { useEffect, useRef } from "react";

/**
 * Swipe the page sideways to move to the next or previous tab.
 *
 * This is the fifth horizontal gesture in the app, and the only one that fires
 * from anywhere on the screen, so most of the work here is knowing when NOT to
 * run. It stands down for:
 *
 *   - the left and right screen edges, which belong to the drawer and the
 *     calendar panel. iOS also claims the left edge for its own back gesture.
 *   - anything inside a horizontal scroller — the dock, the muscle pills, the
 *     database table, a chart. Marked with data-no-swipe-nav, and detected by
 *     scrollWidth for the ones nobody remembered to mark.
 *   - a food row mid swipe-to-delete, which captures the pointer and marks the
 *     body while it is dragging.
 *   - anything inside an open sheet or dialog: a gesture in a modal must not
 *     change what is behind it.
 *
 * Touch events rather than pointer events, unlike the row swipe. A pointer
 * listener on window sees the synthetic mouse events some browsers emit after
 * a touch and would fire twice; touch* is also what the two edge-swipe hooks
 * already use, so the four gestures read the same input.
 */

/** Travel before a swipe counts, in pixels. */
const MIN_TRAVEL = 70;
/** How much more horizontal than vertical it has to be. */
const RATIO = 1.6;
/** Edge strips reserved for the drawer and the calendar. */
const EDGE = 32;
/** Slower than this is a drag, not a flick, and is ignored. */
const MIN_VELOCITY = 0.15;

function inNoSwipeZone(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.dataset?.noSwipeNav != null) return true;
    if (el.getAttribute?.("role") === "dialog") return true;
    // An unmarked horizontal scroller: the gesture is already spoken for.
    if (el.scrollWidth > el.clientWidth + 4) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function useTabSwipe(onSwipe: (step: number) => void, enabled = true) {
  const cb = useRef(onSwipe);
  cb.current = onSwipe;

  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      // Two fingers is a pinch or a system gesture, never a tab change.
      if (!t || e.touches.length > 1) return;
      const w = window.innerWidth;
      tracking =
        t.clientX > EDGE && t.clientX < w - EDGE && !inNoSwipeZone(e.target);
      startX = t.clientX;
      startY = t.clientY;
      startedAt = e.timeStamp;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      const ms = Math.max(1, e.timeStamp - startedAt);
      if (Math.abs(dx) < MIN_TRAVEL) return;
      if (Math.abs(dx) < dy * RATIO) return;
      if (Math.abs(dx) / ms < MIN_VELOCITY) return;
      cb.current(dx < 0 ? 1 : -1);
    };

    const onCancel = () => {
      tracking = false;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled]);
}
