import { useEffect, useLayoutEffect, useRef } from "react";
import { Check, Clock, Pencil, Trash2 } from "lucide-react";
import {
  CONFIRM_PX, REVEAL_PX, REVEAL_TWO_PX, decideLock, decideRelease, offsetFor, type Lock,
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
 * Passing `onConfirm` adds the mirror gesture: swipe RIGHT to confirm. It is
 * deliberately not symmetrical with delete. Delete parks and reveals a button,
 * because destroying a logged entry deserves a second deliberate tap; confirm
 * is one-shot, because the swipe IS the action and there is nothing to reveal.
 *
 * Passing `onEdit` puts an Edit button in the same tray, to the LEFT of
 * Delete. The destructive one stays furthest out, so a finger that overshoots
 * lands on the harmless button — the opposite arrangement would make the
 * easiest target the one you cannot take back.
 *
 * The arbitration lives in lib/use-swipe-action.ts; this holds the pointer,
 * the transform, and the rule that a delete is always undoable.
 */
export function SwipeRow({
  id,
  openId,
  setOpenId,
  onDelete,
  onEdit,
  editLabel = "Edit",
  onConfirm,
  confirmLabel = "Confirm",
  confirmTone = "accent",
  disabled,
  children,
}: {
  id: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onDelete: () => void;
  /** Present on rows that can be edited. Adds a second button to the tray. */
  onEdit?: () => void;
  editLabel?: string;
  /** Present on rows that can be swiped right. Absent leaves that side inert. */
  onConfirm?: () => void;
  confirmLabel?: string;
  /**
   * How the swipe-right badge looks: the accent tick for "it happened", or a
   * gray clock for "not yet" — sending an eaten food back to the plan.
   */
  confirmTone?: "accent" | "muted";
  /** True while the row is held for a drag, so the two gestures never overlap. */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const open = openId === id;
  const reveal = onEdit ? REVEAL_TWO_PX : REVEAL_PX;
  const wrap = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const editBtn = useRef<HTMLButtonElement>(null);
  const deleteBtn = useRef<HTMLButtonElement>(null);
  const tick = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lock = useRef<Lock>("undecided");
  /** Where the finger has the row right now; null when it is not held. */
  const dragOffset = useRef<number | null>(null);
  const frame = useRef(0);

  /**
   * Put the row and its buttons where `offset` says, straight onto the DOM.
   *
   * The row used to move through React state: every pointer move set state,
   * and every set state re-rendered the row AND whatever it holds — a food
   * line with its macros, a to-do with its input — sixty-odd times a second,
   * which on a phone is what made the swipe stutter. Now a move is a style
   * write on a layer that is already composited, batched to the display's own
   * frame, so it runs at whatever the screen does: 120 on a ProMotion iPhone.
   */
  const paint = (offset: number, animate: boolean) => {
    const ease = "cubic-bezier(.2,.8,.2,1)";
    const el = row.current;
    if (el) {
      el.style.transition = animate ? `transform 220ms ${ease}` : "none";
      el.style.transform = `translate3d(${-offset}px,0,0)`;
    }
    const progress = Math.max(0, Math.min(1, offset / reveal));
    for (const b of [editBtn.current, deleteBtn.current]) {
      if (!b) continue;
      b.style.transition = animate ? `opacity 220ms, transform 220ms ${ease}` : "none";
      b.style.opacity = String(progress);
      b.style.transform = `scale(${0.6 + progress * 0.4})`;
      // Inert until it is most of the way out, so a row mid-swipe cannot be
      // tapped into doing something.
      b.style.pointerEvents = progress >= 0.35 ? "auto" : "none";
    }
    if (tick.current) {
      const c = Math.max(0, Math.min(1, -offset / CONFIRM_PX));
      tick.current.style.transition = animate ? "opacity 180ms, transform 180ms" : "none";
      tick.current.style.opacity = String(c);
      tick.current.style.transform = `scale(${0.6 + c * 0.4})`;
    }
  };

  // Resting position: shut, or parked open. Also what a render puts back, so
  // nothing React does mid-swipe can snap the row away from the finger.
  useLayoutEffect(() => {
    if (dragOffset.current !== null) return;
    paint(open ? reveal : 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reveal]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

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
    const landing = decideRelease(offset, width, reveal);
    dragOffset.current = null;
    cancelAnimationFrame(frame.current);
    // Glide to where it lands from where the finger left it, on this frame —
    // not a render later.
    paint(landing === "open" ? reveal : 0, true);
    if (landing === "delete") {
      setOpenId(null);
      onDelete();
    } else if (landing === "confirm") {
      setOpenId(null);
      onConfirm?.();
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
      // An open row has something on its right too: the closed position. Without
      // the `|| open` a parked row refused every rightward move as a scroll, so
      // the reverse swipe that should shut it went to the page instead and the
      // only way back was to tap somewhere else.
      lock.current = decideLock(dx, dy, !!onConfirm || open);
      // Locked to scrolling: hand the gesture back to the page for good.
      if (lock.current === "scroll") start.current = null;
      if (lock.current !== "swipe") return;
      // Take the pointer so the row keeps receiving moves even if the finger
      // wanders off it, and so a parent scroller stops chasing it.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // An already-open row starts from its parked position rather than from
    // zero, so a second swipe carries on instead of jumping back — and a
    // rightward one walks that same number back down to zero. `allowRight`
    // stays tied to onConfirm so pulling an open row past shut stops at shut
    // rather than sliding on into the confirm side.
    dragOffset.current = offsetFor(dx - (open ? reveal : 0), !!onConfirm, reveal);
    // One write per displayed frame, however many moves the finger sends.
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (dragOffset.current !== null) paint(dragOffset.current, false);
    });
  };

  const onPointerUp = () => {
    if (dragOffset.current != null) finish(dragOffset.current);
    else if (lock.current === "swipe") finish(open ? reveal : 0);
    start.current = null;
    lock.current = "undecided";
  };

  return (
    // Clipped horizontally: the row slides left to uncover the tray, and with
    // nothing to stop it, it slid straight out of the card it lives in and off
    // the side of the screen. `clip` rather than `hidden` so this never
    // becomes a scroll container. The tray sits inside these bounds, so only
    // the escaping row is cut.
    <div ref={wrap} data-no-swipe-nav className="relative [overflow-x:clip]">
      {onConfirm && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-start"
          style={{ width: CONFIRM_PX }}
        >
          <div
            ref={tick}
            aria-label={confirmLabel}
            style={{ opacity: 0, transform: "scale(0.6)", willChange: "transform, opacity" }}
            className={cn(
              "ml-2 grid size-11 shrink-0 place-items-center rounded-full shadow-lg",
              confirmTone === "muted" ? "bg-surface-3 text-muted" : "bg-accent text-accent-ink",
            )}
          >
            {confirmTone === "muted"
              ? <Clock className="size-[1.15rem]" strokeWidth={2.4} />
              : <Check className="size-[1.15rem]" strokeWidth={2.6} />}
          </div>
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 pr-2"
        style={{ width: reveal }}
      >
        {onEdit && (
          <TrayButton
            innerRef={editBtn}
            label={editLabel}
            live={open}
            tone="edit"
            onClick={() => {
              setOpenId(null);
              onEdit();
            }}
          >
            <Pencil className="size-[1.05rem]" strokeWidth={2.4} />
          </TrayButton>
        )}
        <TrayButton
          innerRef={deleteBtn}
          label="Delete"
          live={open}
          tone="delete"
          onClick={() => {
            setOpenId(null);
            onDelete();
          }}
        >
          <Trash2 className="size-[1.15rem]" strokeWidth={2.2} />
        </TrayButton>
      </div>

      <div
        ref={row}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          // Its own compositor layer from the start, so the first frame of a
          // swipe does not pay for promoting it.
          willChange: "transform",
          // Vertical panning stays with the page; sideways is this row's.
          touchAction: "pan-y",
        }}
        className="relative z-[1]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One round button in the tray.
 *
 * It grows in with the swipe rather than sitting at full size waiting to be
 * uncovered, so the gesture and the target read as one thing — and it is inert
 * until it is most of the way out, so a row mid-swipe cannot be tapped into
 * doing something.
 */
function TrayButton({
  innerRef, label, live, tone, onClick, children,
}: {
  innerRef: React.Ref<HTMLButtonElement>;
  label: string;
  /** Parked open: reachable by keyboard and assistive tech. */
  live: boolean;
  tone: "edit" | "delete";
  onClick: () => void;
  children: React.ReactNode;
}) {
  // Opacity, scale and whether it takes taps are written by the row as it
  // moves (see paint), not rendered — so a swipe never re-renders this.
  return (
    <button
      ref={innerRef}
      type="button"
      aria-hidden={!live}
      tabIndex={live ? 0 : -1}
      aria-label={label}
      onClick={onClick}
      style={{ opacity: 0, transform: "scale(0.6)", pointerEvents: "none", willChange: "transform, opacity" }}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full shadow-lg",
        tone === "delete" ? "bg-danger text-white" : "bg-surface-3 text-fg border border-border-strong",
      )}
    >
      {children}
    </button>
  );
}
