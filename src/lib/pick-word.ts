/**
 * Choosing a word without asking the browser to select it.
 *
 * iOS always puts its own edit menu over a native selection. Not sometimes,
 * and not only for links: any run of selected text raises Copy / Look Up /
 * Translate, `-webkit-touch-callout` does not suppress it, and nothing a web
 * page can do will move it. So a reader that shows its own bar over a
 * selection is a reader with two bars, one of which is on top of the other —
 * which is what the book had, and why none of its own buttons could be
 * reached.
 *
 * The way out is to stop making a native selection at all. The text is marked
 * unselectable, a press-and-hold finds the word under the finger from the
 * caret position, and the word is drawn by the same highlight layer that
 * draws a marker pen. No Range is ever handed to the browser as a selection,
 * so iOS has nothing to raise a menu about, and the only menu is the book's.
 *
 * The boundary logic is pure, so which characters count as part of a word can
 * be tested without a page to point at.
 */

/**
 * What counts as part of a word.
 *
 * Letters and numbers, plus the marks that live INSIDE words rather than
 * between them: an apostrophe ("Muad'Dib", "don't"), a hyphen ("well-known"),
 * and the combining accents that a decomposed é arrives as. Getting the
 * apostrophe wrong is the difference between looking up "don" and "don't".
 */
export function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}\p{M}'’-]/u.test(ch);
}

/**
 * The word around a position in a string.
 *
 * Returns null where there is no word — a finger in the margin, on a space,
 * or on a full stop. That is a real answer and not a failure: a press there
 * should do nothing rather than pick the nearest word several characters
 * away, which feels like the book guessing.
 *
 * Trailing marks are trimmed off, so pressing on the last letter of a word
 * that ends a sentence does not take the hyphen or apostrophe with it.
 */
export function wordBounds(text: string, at: number): { start: number; end: number } | null {
  if (!text) return null;
  const chars = [...text];
  // An index past the end, or on a space, still belongs to the word just
  // before it: a finger lands after the last letter as often as on it.
  let i = Math.max(0, Math.min(at, chars.length - 1));
  if (!isWordChar(chars[i] ?? "")) {
    if (i > 0 && isWordChar(chars[i - 1] ?? "")) i -= 1;
    else return null;
  }
  let start = i;
  while (start > 0 && isWordChar(chars[start - 1] ?? "")) start -= 1;
  let end = i + 1;
  while (end < chars.length && isWordChar(chars[end] ?? "")) end += 1;
  // A word is letters; one made only of hyphens and apostrophes is not one.
  while (start < end && !/[\p{L}\p{N}]/u.test(chars[start] ?? "")) start += 1;
  while (end > start && !/[\p{L}\p{N}]/u.test(chars[end - 1] ?? "")) end -= 1;
  if (end <= start) return null;
  return { start, end };
}

/** Two picked spans joined, so dragging past a word takes it in. */
export function spanUnion(
  a: { start: number; end: number },
  b: { start: number; end: number },
): { start: number; end: number } {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/**
 * The caret position under a point, whichever name this engine gives it.
 *
 * Safari has `caretRangeFromPoint`; Firefox has `caretPositionFromPoint`;
 * Chrome has both. This is the one piece that cannot be tested without a
 * layout, which is exactly why it is three lines and does nothing else.
 */
export function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range) return { node: range.startContainer, offset: range.startOffset };
  const pos = doc.caretPositionFromPoint?.(x, y);
  return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
}
