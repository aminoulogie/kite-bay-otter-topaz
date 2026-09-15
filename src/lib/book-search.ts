/**
 * Finding a word in a book you already have.
 *
 * All of it local. The chapters are bytes in a ZIP on the phone, so searching
 * them is reading them — no index to build and keep in step, no service to
 * ask, and it works on a plane. A chapter is turned into plain text once and
 * kept for as long as the book is open, which for a novel is a few hundred
 * kilobytes of string and by far the cheapest thing the reader holds.
 *
 * The matching is deliberately forgiving in two ways a reader expects and a
 * naive `indexOf` is not: case, and accents. Someone hunting for "melange"
 * should find "Mélange" at the start of a sentence, because they are the same
 * word and the difference is typography.
 *
 * Pure, so the stripping, the folding and the snippets can be tested against
 * real chapter markup without a book or a screen.
 */

/** Shorter than this matches half the book and helps nobody. */
export const MIN_QUERY = 2;
/** Characters of context either side of a hit. */
export const SNIPPET = 46;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—",
  ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

/**
 * A chapter's markup as the words alone.
 *
 * Whitespace is collapsed exactly as a browser collapses it, and that is not
 * cosmetic: the offsets found here are used to find the same hit again in the
 * LAID-OUT chapter, and the browser's own text nodes have already had their
 * runs of spaces and newlines squeezed to one. Strip the tags without
 * collapsing and every match lands a few characters adrift of its word.
 */
export function plainText(html: string): string {
  return html
    // Anything that is not prose, and its contents with it.
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // A block ending is a word boundary; without this "…end.Next chapter…"
    // becomes one word and is findable as neither.
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|br|section)\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The form two words are compared in: no case, no accents.
 *
 * One character in, one character out, always — which is the whole reason it
 * is written this way rather than with a regex that drops the marks. An index
 * into the folded string has to be an index into the original, or every hit
 * would be reported a few characters to the left of itself in any paragraph
 * containing an accent.
 */
export function fold(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFD")) {
    // Combining marks are dropped by NFD + this filter, which would shorten
    // the string — so they are replaced by the character they decorate having
    // already been emitted, and the mark itself becomes nothing. To keep the
    // lengths equal the mark is kept as a space, which matches nothing.
    out += /\p{M}/u.test(ch) ? "" : ch.toLowerCase();
  }
  return out.length === text.length ? out : foldSlow(text);
}

/** The same fold, one source character at a time, so lengths cannot drift. */
function foldSlow(text: string): string {
  let out = "";
  for (const ch of text) {
    const bare = ch.normalize("NFD").replace(/\p{M}/gu, "");
    out += (bare || ch).toLowerCase().slice(0, 1) || ch;
  }
  return out;
}

export interface Hit {
  /** Which chapter, by index into the reading order. */
  chapter: number;
  /** Characters into the chapter's plain text. */
  at: number;
  /** The words either side, and the words that matched. */
  before: string;
  hit: string;
  after: string;
}

/** Every occurrence in one chapter, in reading order. */
export function findIn(text: string, query: string, chapter: number, limit = 40): Hit[] {
  const q = fold(query.trim());
  if (q.length < MIN_QUERY) return [];
  const hay = fold(text);
  const out: Hit[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(q, from);
    if (at < 0 || out.length >= limit) break;
    const left = Math.max(0, at - SNIPPET);
    const right = Math.min(text.length, at + q.length + SNIPPET);
    out.push({
      chapter,
      at,
      before: (left > 0 ? "…" : "") + text.slice(left, at),
      hit: text.slice(at, at + q.length),
      after: text.slice(at + q.length, right) + (right < text.length ? "…" : ""),
    });
    from = at + q.length;
  }
  return out;
}

/**
 * Where the nth occurrence starts, folded the same way.
 *
 * Used to find a hit again in the chapter the browser has actually laid out.
 * The plain text and the rendered text are the same words in the same order
 * with the same spacing, so the nth match in one is the nth match in the
 * other — which is a far steadier thing to rely on than two independently
 * computed character offsets agreeing.
 */
export function nthIndexOf(haystack: string, needle: string, n: number): number {
  const hay = fold(haystack);
  const q = fold(needle);
  if (!q) return -1;
  let at = -1;
  for (let i = 0; i <= n; i++) {
    at = hay.indexOf(q, at + (i === 0 ? 0 : 1));
    if (at < 0) return -1;
  }
  return at;
}

/** Which occurrence within its chapter a hit is, counting from zero. */
export function rankOf(hits: readonly Hit[], hit: Hit): number {
  let n = 0;
  for (const h of hits) {
    if (h === hit) return n;
    if (h.chapter === hit.chapter) n++;
  }
  return n;
}

/** "3 in this chapter", "none" — what the field says under itself. */
export function tally(count: number, query: string): string {
  if (!query.trim()) return "";
  if (query.trim().length < MIN_QUERY) return `Type ${MIN_QUERY} letters or more.`;
  if (count === 0) return "Nothing found.";
  return count === 1 ? "1 result" : `${count} results`;
}
