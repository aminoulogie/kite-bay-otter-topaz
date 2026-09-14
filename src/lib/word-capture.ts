/**
 * A word you highlighted, on its way to the word book.
 *
 * Selecting text on a phone is imprecise — the handles land on a space, take
 * the comma after the word, or grab a whole line when you meant one word — so
 * the raw selection is never what you want filed. This tidies it, decides
 * whether it is worth filing at all, and pulls out the sentence it came from.
 *
 * The sentence matters more than it looks. A word on its own is a flashcard
 * you will fail; the same word in the line you met it in is a memory. It
 * costs nothing to keep, because the text is already on the screen.
 */

/** Beyond this it is a passage, not a word. */
export const MAX_WORDS = 6;
export const MAX_CHARS = 90;
/** Room for the sentence, without keeping half a chapter. */
export const MAX_SENTENCE = 220;

/**
 * Punctuation and quote marks that belong to the page, not to the word.
 *
 * Includes the typographic forms, because a book uses curly quotes and em
 * dashes and a stripper that only knows ASCII leaves "  word,"  behind.
 */
const EDGE = /^[\s"'“”‘’«»\-–—.,;:!?()[\]{}…*_]+|[\s"'“”‘’«»\-–—.,;:!?()[\]{}…*_]+$/g;

export function cleanSelection(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(EDGE, "")
    .trim();
}

/**
 * Whether this selection should become a word.
 *
 * A tap that selects nothing, a stray drag across a paragraph, and a number
 * are all things the reader will hand over and none of them belong in a
 * vocabulary list.
 */
export function isCapturable(text: string): boolean {
  const clean = cleanSelection(text);
  if (clean.length < 2 || clean.length > MAX_CHARS) return false;
  if (clean.split(/\s+/).length > MAX_WORDS) return false;
  // At least one letter. Catches "42", "—", "1789" and page numbers.
  return /\p{L}/u.test(clean);
}

/**
 * The sentence the selection sits in, out of the block it came from.
 *
 * Boundaries are the ordinary three plus a newline, and an abbreviation will
 * occasionally cut one short — "Dr. Yueh said" becomes two. That is a fair
 * trade for not shipping a sentence tokeniser to read a paragraph, and the
 * failure mode is a slightly short example rather than a wrong one.
 */
export function sentenceAround(block: string, selected: string): string | undefined {
  const text = block.replace(/\s+/g, " ").trim();
  const needle = cleanSelection(selected);
  if (!text || !needle) return undefined;

  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return undefined;

  const before = text.slice(0, at);
  const start = Math.max(
    before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "),
  );
  const from = start < 0 ? 0 : start + 2;

  const after = text.slice(at + needle.length);
  const ends = [after.indexOf("."), after.indexOf("!"), after.indexOf("?")].filter((i) => i >= 0);
  const to = ends.length ? at + needle.length + Math.min(...ends) + 1 : text.length;

  const sentence = text.slice(from, to).trim();
  // Compared with its own punctuation stripped: "Melange." as a line of its
  // own is the word again, and an example that repeats the word teaches
  // nothing that the word did not already say.
  if (!sentence || cleanSelection(sentence).toLowerCase() === needle.toLowerCase()) {
    return undefined;
  }
  return sentence.length > MAX_SENTENCE ? `${sentence.slice(0, MAX_SENTENCE - 1).trimEnd()}…` : sentence;
}

/** What the word book should be told, or null if this is not worth filing. */
export interface CapturedWord {
  word: string;
  example?: string;
}

export function capture(selected: string, block: string): CapturedWord | null {
  if (!isCapturable(selected)) return null;
  const word = cleanSelection(selected);
  return { word, example: sentenceAround(block, selected) };
}
