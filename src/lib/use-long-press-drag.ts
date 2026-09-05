import { useCallback, useEffect, useRef, useState } from "react";

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
    };

    const up = () => {
      clearHold();
      if (armed.current && from.current != null) {
        const to = live.current.over;
        if (to != null && to !== from.current) live.current.onReorder(from.current, to);
      }
      armed.current = false;
      from.current = null;
      start.current = null;
      setDragging(null);
      setOver(null);
    };

    // Non-passive so preventDefault can actually stop the scroll mid-drag.
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      clearHold();
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
      armed.current = false;
      from.current = null;
      setDragging(null);
      setOver(null);
    }
  }, [count, dragging]);

  return { dragging, over, handlers };
}
