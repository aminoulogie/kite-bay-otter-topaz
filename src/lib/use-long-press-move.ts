import { useCallback, useEffect, useRef, useState } from "react";
import { resetSelectionGuard, restoreSelection, suppressSelection } from "./drag-select";
import { stopDragScroll, updateDragScroll } from "./drag-scroll";

/**
 * Press and hold a row, drag it onto another section, release to move it there.
 *
 * The sibling of useLongPressDrag, which reorders WITHIN one list. This moves
 * an item BETWEEN lists, which is a different question: the drop target is a
 * container rather than a position, so the hit test looks for a marked section
 * instead of a row index.
 *
 * Pointer events rather than HTML5 drag-and-drop, for the same reason as the
 * other hook: Safari on iOS never fires dragstart for touch, so a `draggable`
 * row is completely inert on the phone this app runs on.
 *
 * Mark each droppable section with `data-drop-zone="<id>"`, and spread
 * `handlers(itemId)` onto anything draggable.
 *
 * Suppressing the page's own scroll mid-drag needs a non-passive `touchmove`
 * listener; see the note in use-long-press-drag.ts for why the two obvious
 * approaches — `touch-action` on the row and `preventDefault()` on
 * `pointermove` — cannot work in WebKit.
 */

const HOLD_MS = 300;
/** Enough slack for a finger's wobble, small enough that a scroll still wins. */
const SLIP_PX = 8;

export interface LongPressMove<T> {
  /** The item currently held, or null. */
  dragging: T | null;
  /** The zone it would drop into, for highlighting. */
  over: string | null;
  handlers: (item: T) => { onPointerDown: (e: React.PointerEvent) => void };
}

export function useLongPressMove<T>(
  onMove: (item: T, zone: string) => void,
  onPickUp?: () => void,
): LongPressMove<T> {
  const [dragging, setDragging] = useState<T | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef<T | null>(null);
  const armed = useRef(false);

  // Read inside window listeners, which are attached once and would otherwise
  // close over the first render's values forever.
  const live = useRef({ over, onMove, onPickUp });
  live.current = { over, onMove, onPickUp };

  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const zoneAt = useCallback((x: number, y: number): string | null => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-drop-zone]")) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
        return el.dataset.dropZone ?? null;
      }
    }
    return null;
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!armed.current) {
        // Still deciding whether this is a hold or a scroll.
        if (start.current) {
          const dx = Math.abs(e.clientX - start.current.x);
          const dy = Math.abs(e.clientY - start.current.y);
          if (dx > SLIP_PX || dy > SLIP_PX) {
            clearHold();
            start.current = null;
          }
        }
        return;
      }
      // Held: this gesture is a drag, so stop the page scrolling under it.
      // Only safe once armed, or an ordinary scroll would be swallowed.
      e.preventDefault();
      setOver(zoneAt(e.clientX, e.clientY));
      // With the page's own scrolling suppressed, this is the only way left to
      // reach a meal further down the diary than the screen.
      updateDragScroll(e.clientY, document.elementFromPoint(e.clientX, e.clientY));
    };

    const reset = () => {
      clearHold();
      if (armed.current) restoreSelection();
      stopDragScroll();
      armed.current = false;
      held.current = null;
      start.current = null;
      setDragging(null);
      setOver(null);
    };

    /** Let go deliberately: drop it in whichever section it is over. */
    const up = () => {
      const item = armed.current ? held.current : null;
      const zone = live.current.over;
      reset();
      if (item != null && zone) live.current.onMove(item, zone);
    };

    /**
     * The gesture was taken away: move NOTHING.
     *
     * Cancelling used to run the same code as a release, so a food that lost
     * its pointer to a system gesture jumped to whatever meal the finger was
     * over. On iOS that happened whenever a scroll started under a held row.
     */
    const cancel = () => reset();

    // The one thing that actually stops WebKit scrolling mid-drag.
    const blockTouchScroll = (e: TouchEvent) => {
      if (armed.current && e.cancelable) e.preventDefault();
    };

    // Non-passive so preventDefault can actually stop the scroll mid-drag.
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", blockTouchScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", blockTouchScroll);
      clearHold();
      stopDragScroll();
      // Unmounting mid-drag never sees pointerup, and a page that can never
      // select text again is a worse bug than the one being fixed.
      resetSelectionGuard();
    };
  }, [zoneAt]);

  const handlers = useCallback(
    (item: T) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Left button or touch only — a right-click should open the menu.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        clearHold();
        timer.current = setTimeout(() => {
          armed.current = true;
          held.current = item;
          // Only once the hold has ARMED. Doing it on pointerdown would kill
          // selection for every ordinary tap on the page.
          suppressSelection();
          setDragging(item);
          live.current.onPickUp?.();
        }, HOLD_MS);
      },
    }),
    [],
  );

  return { dragging, over, handlers };
}
