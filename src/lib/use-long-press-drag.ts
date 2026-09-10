import { useCallback, useEffect, useRef, useState } from "react";
import { resetSelectionGuard, restoreSelection, suppressSelection } from "./drag-select";
import { stopDragScroll, updateDragScroll } from "./drag-scroll";

/**
 * Long-press to pick up a row, drag to move it, release to drop.
 *
 * Built on pointer events rather than HTML5 drag-and-drop, which is the whole
 * reason this exists: iOS Safari never fires dragstart/dragover/drop for touch
 * input, so a `draggable` list is completely inert on an iPhone. Since the app
 * runs in a WKWebView on a phone, that is the only place reordering matters.
 *
 * The press has to be held before the drag starts, so a normal scroll through
 * a long list does not pick a row up by accident. Movement beyond a few pixels
 * during that hold cancels it and lets the scroll through.
 *
 * Stopping the page scrolling under a held row is the hard part, and the
 * obvious approaches do not work on the phone this runs on:
 *
 *  - `touch-action: none` set on the row once it is held is too late. The
 *    browser latches touch-action when the gesture BEGINS, so changing it
 *    after a 320ms hold plus a React render has no effect on the touch in
 *    flight. Both call sites did exactly this, and it never once worked.
 *  - `preventDefault()` on `pointermove` does not cancel a touch scroll in
 *    WebKit. Scrolling there is driven by touch events; the pointer events are
 *    a synthesised view of them.
 *
 * What does work is a non-passive `touchmove` listener that preventDefaults
 * while armed. Without it iOS starts scrolling, fires `pointercancel`, and the
 * drag dies mid-gesture — which is precisely what "kinda broken" looked like.
 */

const HOLD_MS = 320;
/** Enough slack to absorb a finger's wobble, small enough that a scroll wins. */
const SLIP_PX = 8;

export interface LongPressDrag {
  /** Index being dragged, or null. */
  dragging: number | null;
  /** Index it would land on, for the drop indicator. */
  over: number | null;
  /** Spread onto each row, along with a data-drag-index attribute. */
  handlers: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
  };
}

export function useLongPressDrag(
  count: number,
  onReorder: (from: number, to: number) => void,
  onPickUp?: () => void,
): LongPressDrag {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const from = useRef<number | null>(null);
  const armed = useRef(false);
  /**
   * Read inside the window listeners, which are attached once. Without this
   * they would close over the first render's values and always see null.
   */
  const live = useRef({ dragging, over, onReorder, onPickUp });
  live.current = { dragging, over, onReorder, onPickUp };

  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Which row the pointer is over, found by hit-testing rather than tracked. */
  const rowAt = useCallback((x: number, y: number): number | null => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-drag-index]")) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
        const i = Number(el.dataset.dragIndex);
        return Number.isFinite(i) ? i : null;
      }
    }
    return null;
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!armed.current) {
        // Still deciding whether this is a press or a scroll.
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
      // The row is held: this gesture is a drag, so stop the page scrolling
      // under it. Only safe once armed, or a scroll would be swallowed.
      e.preventDefault();
      const target = rowAt(e.clientX, e.clientY);
      if (target != null) setOver(target);
      // With the page's own scrolling suppressed, this is the only way left to
      // reach a drop target that is off screen.
      updateDragScroll(e.clientY, document.elementFromPoint(e.clientX, e.clientY));
    };

    const reset = () => {
      clearHold();
      if (armed.current) restoreSelection();
      stopDragScroll();
      armed.current = false;
      from.current = null;
      start.current = null;
      setDragging(null);
      setOver(null);
    };

    /** Let go deliberately: commit wherever the row was dropped. */
    const up = () => {
      const commit = armed.current && from.current != null;
      const to = live.current.over;
      const wasFrom = from.current;
      reset();
      if (commit && to != null && to !== wasFrom) live.current.onReorder(wasFrom!, to);
    };

    /**
     * The gesture was taken away: put everything back and reorder NOTHING.
     *
     * This used to run the same code as a deliberate release, so a cancelled
     * drag committed a move to whatever row the finger happened to be over —
     * silently reordering a programme the user was not even trying to change.
     * On iOS that fired constantly, because a scroll starting under a held row
     * is exactly how the system cancels a pointer.
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
      resetSelectionGuard();
    };
  }, [rowAt]);

  const handlers = useCallback(
    (index: number) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Left button or touch only — a right-click should open the menu.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        clearHold();
        timer.current = setTimeout(() => {
          armed.current = true;
          // Only once the hold has ARMED. Doing it on pointerdown would kill
          // selection for every ordinary tap on the page.
          suppressSelection();
          from.current = index;
          setDragging(index);
          setOver(index);
          live.current.onPickUp?.();
        }, HOLD_MS);
      },
    }),
    [],
  );

  // A list that shrinks under a held row would otherwise drop onto an index
  // that no longer exists.
  useEffect(() => {
    if (dragging != null && dragging >= count) {
      if (armed.current) restoreSelection();
      armed.current = false;
      from.current = null;
      setDragging(null);
      setOver(null);
    }
  }, [count, dragging]);

  return { dragging, over, handlers };
}
