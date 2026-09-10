/**
 * Stop a drag from smearing a blue selection across the screen.
 *
 * Both long-press hooks hold the pointer down on text and then move it, which
 * is the browser's definition of "select this". By the time the hold has armed
 * and the row starts following the finger, a selection is usually already
 * under way — so this does three things rather than one:
 *
 *  1. Marks the document so CSS can switch selection off. A class rather than
 *     an inline style: two overlapping drags setting and then restoring
 *     `body.style.userSelect` would leave whichever finished last in charge,
 *     and the loser's restore would re-enable selection mid-drag.
 *  2. Clears the selection that has ALREADY started. The class only prevents
 *     new selections; without this the words highlighted during the 300ms hold
 *     stay highlighted for the whole drag.
 *  3. Cancels `selectstart` outright, which is the one thing that reliably
 *     works in Safari, where user-select on a parent is not always enough once
 *     a selection is in progress.
 *
 * `-webkit-touch-callout` is in the CSS too. Without it a long press on iOS
 * raises the copy/define bubble over the row you are trying to drag.
 */

const CLASS = "soma-dragging";

/** Nested/overlapping drags: the mark lifts when the last one lets go. */
let depth = 0;

const stopSelect = (e: Event) => e.preventDefault();

export function suppressSelection(): void {
  depth++;
  if (depth > 1) return;
  document.documentElement.classList.add(CLASS);
  document.getSelection()?.removeAllRanges();
  document.addEventListener("selectstart", stopSelect);
}

export function restoreSelection(): void {
  depth = Math.max(0, depth - 1);
  if (depth > 0) return;
  document.documentElement.classList.remove(CLASS);
  document.removeEventListener("selectstart", stopSelect);
}

/** Escape hatch for a component unmounting mid-drag, which never sees pointerup. */
export function resetSelectionGuard(): void {
  depth = 0;
  document.documentElement.classList.remove(CLASS);
  document.removeEventListener("selectstart", stopSelect);
}
