import { useEffect, useRef } from "react";

/**
 * The parts of a modal sheet that are easy to forget.
 *
 * Escape closes it, focus moves inside on open and returns to the opener on
 * close, and the page behind stops scrolling. None of that shows in a
 * screenshot, which is why it went missing: the sheets worked by touch and
 * were unusable with a keyboard or VoiceOver.
 */

/**
 * How many sheets currently want the page locked.
 *
 * A counter rather than each sheet remembering the previous value, because
 * sheets nest — the calendar opens, a day card opens on top of it — and
 * save/restore gets this wrong in a way that is easy to miss. Each sheet's
 * effect re-runs whenever its onClose identity changes, and if that happened
 * while an inner sheet held the lock, the outer sheet captured "hidden" as the
 * value to restore and the page stayed frozen after everything had closed.
 *
 * Counting means the lock lifts exactly when the last sheet leaves, regardless
 * of order or re-renders.
 */
let lockCount = 0;

function lockScroll(): () => void {
  if (lockCount === 0) document.body.style.overflow = "hidden";
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) document.body.style.overflow = "";
  };
}

/** Open sheets, innermost last. Only the last one answers Escape. */
const escapeStack: { close: () => void }[] = [];

if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !escapeStack.length) return;
    e.preventDefault();
    escapeStack[escapeStack.length - 1]!.close();
  });
}

export function useSheet(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  // Scroll lock and focus are tied to the sheet's LIFETIME, so this effect has
  // no dependencies: re-running it because a parent re-rendered would release
  // and retake the lock for no reason, which is how the previous version broke.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const release = lockScroll();

    // Focus the sheet itself, not its first control: landing on a destructive
    // button because it happens to come first is worse than landing nowhere.
    ref.current?.focus({ preventScroll: true });

    return () => {
      release();
      // Only reclaim focus if it is still inside the sheet, so a deliberate
      // move elsewhere is not undone on close.
      if (ref.current?.contains(document.activeElement)) opener?.focus?.();
    };
  }, []);

  // Escape closes the INNERMOST sheet only.
  //
  // stopPropagation does not achieve that: every sheet listens on document, so
  // the listeners are siblings rather than nested, and one calling stop does
  // nothing to the others — pressing Escape over a day card closed the card and
  // the calendar underneath it in the same keystroke.
  //
  // A stack makes the ordering explicit instead of depending on registration
  // order, which is not something to rely on for correctness.
  useEffect(() => {
    const entry = { close: onClose };
    escapeStack.push(entry);
    return () => {
      const i = escapeStack.indexOf(entry);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [onClose]);

  return ref;
}
