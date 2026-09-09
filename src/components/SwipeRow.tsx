import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  REVEAL_PX, decideLock, decideRelease, offsetFor, type Lock,
} from "@/lib/use-swipe-action";
import { cn } from "@/lib/utils";

/**
 * A row that slides left to reveal a round Delete button.
 *
 * Round rather than a full-height red panel: the row is a floating rounded
 * card on a dark ground, and a square block butting against it reads as a
 * different design language wedged in beside it. A circle that scales in as
 * the row moves belongs to the same surface.
 *
 * Only one row is open at a time, which is why `openId` is passed in rather
 * than kept here: two open rows would leave a delete button stranded behind
 * whichever one the user forgot about, and the next tap in that area would
 * destroy something they were not looking at.
 *
 * The wrapper is marked data-no-swipe-nav. Without it the page's tab swipe
 * also fires on the same gesture, so swiping a food row deleted nothing and
 * navigated to the next tab instead — two gestures for one finger, and the
 * one that owns the row has to win.
 *
 * The arbitration lives in lib/use-swipe-action.ts; this holds the pointer,
 * the transform, and the rule that a delete is always undoable.
 */
export function SwipeRow({
  id,
  openId,
  setOpenId,
  onDelete,
  disabled,
  children,
}: {
  id: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onDelete: () => void;
  /** True while the row is held for a drag, so the two gestures never overlap. */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const open = openId === id;
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lock = useRef<Lock>("undecided");

  // A row left open while the finger moves on to something else should shut,
  // the same as tapping away from it does.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpenId(null);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open, setOpenId]);

  const finish = (offset: number) => {
    const width = wrap.current?.offsetWidth ?? 0;
    const landing = decideRelease(offset, width);
    setDragOffset(null);
    if (landing === "delete") {
      setOpenId(null);
      onDelete();
    } else if (landing === "open") {
      setOpenId(id);
    } else if (open) {
      setOpenId(null);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    // Left button or touch only — a right-click should open the menu.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    lock.current = "undecided";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || !start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    if (lock.current === "undecided") {
      lock.current = decideLock(dx, dy);
      // Locked to scrolling: hand the gesture back to the page for good.
      if (lock.current === "scroll") start.current = null;
      if (lock.current !== "swipe") return;
      // Take the pointer so the row keeps receiving moves even if the finger
      // wanders off it, and so a parent scroller stops chasing it.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // An already-open row starts from its parked position rather than from
    // zero, so a second swipe carries on instead of jumping back.
    setDragOffset(offsetFor(dx - (open ? REVEAL_PX : 0)));
  };

  const onPointerUp = () => {
    if (dragOffset != null) finish(dragOffset);
    else if (lock.current === "swipe") finish(open ? REVEAL_PX : 0);
    start.current = null;
    lock.current = "undecided";
  };

  const offset = dragOffset ?? (open ? REVEAL_PX : 0);
  const swiping = dragOffset != null;
  // The button grows in with the swipe rather than sitting there at full size
  // waiting to be uncovered, so the gesture and the target feel like one thing.
  const progress = Math.max(0, Math.min(1, offset / REVEAL_PX));

  return (
    <div ref={wrap} data-no-swipe-nav className="relative">
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end"
        style={{ width: REVEAL_PX }}
      >
        <button
          type="button"
          aria-hidden={progress < 0.35}
          tabIndex={progress < 0.35 ? -1 : 0}
          aria-label="Delete"
          onClick={() => {
            setOpenId(null);
            onDelete();
          }}
          style={{
            opacity: progress,
            transform: `scale(${0.6 + progress * 0.4})`,
            transition: swiping ? "none" : "opacity 180ms, transform 180ms",
          }}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full bg-danger text-white shadow-lg",
            progress >= 0.35 && "pointer-events-auto",
          )}
        >
          <Trash2 className="size-[1.15rem]" strokeWidth={2.2} />
        </button>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translate3d(${-offset}px,0,0)`,
          // No transition while the finger is down, or the row lags behind it.
          transition: swiping ? "none" : "transform 180ms cubic-bezier(.2,.8,.2,1)",
          // Vertical panning stays with the page until the swipe has committed.
          touchAction: lock.current === "swipe" ? "none" : "pan-y",
        }}
        className="relative z-[1]"
      >
        {children}
      </div>
    </div>
  );
}
