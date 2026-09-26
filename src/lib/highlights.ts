/**
 * Every highlight you have ever drawn, out of the books and in one list.
 *
 * A highlight has been readable away from its book since the day the feature
 * was written — `BookMark.text` carries the passage precisely so it can be —
 * and until now nothing outside the reader ever looked. Which made the
 * highlighter a thing you used while reading and never afterwards: to find
 * that paragraph about sleep you had to remember which of nine books it was
 * in, open it, and page through the marks sheet.
 *
 * So this gathers them. The rules that matter:
 *
 * READING ORDER INSIDE A BOOK. Chapter, then character. A book's highlights
 * are an argument in the order the book made it, and sorting them by when you
 * drew them shuffles the argument — you highlight the third chapter again a
 * week after the fifth.
 *
 * MOST RECENT BOOK FIRST. Between books, the one you touched last. The list is
 * read from the top and the top should be the book you are actually in.
 *
 * UNDATED HIGHLIGHTS ARE OLD, NOT MISSING. Marks made before highlights
 * carried a date have none. They sort last on a by-date view and they are
 * never filtered out by a date range, because a highlight you cannot date is
 * still a highlight you made.
 */

import { fold } from "./book-search.ts";
import { MARK_COLOURS, type BookMark } from "./marks.ts";
import type { MindEntry } from "./types.ts";

export interface Highlight extends BookMark {
  bookId: string;
  bookTitle: string;
}

export interface BookHighlights {
  bookId: string;
  title: string;
  rows: Highlight[];
}

/** Only books, only ones carrying marks. */
export function booksWithMarks(mind: readonly MindEntry[]): MindEntry[] {
  return mind.filter((m) => m.kind === "book" && (m.marks?.length ?? 0) > 0);
}

/**
 * Every highlight across every book, newest book first, reading order within.
 *
 * `date` on the entry is the day the book was logged rather than last read, so
 * it is a weak ordering — but it is the only one a book carries, and a wrong
 * order between two books read the same week costs nothing. The order INSIDE a
 * book is the one that has to be right, and that one is exact.
 */
export function gather(mind: readonly MindEntry[]): Highlight[] {
  const books = booksWithMarks(mind).sort((a, b) => (a.date < b.date ? 1 : -1));
  const out: Highlight[] = [];
  for (const book of books) {
    const rows = [...(book.marks ?? [])].sort(
      (a, b) => a.chapter - b.chapter || a.start - b.start,
    );
    for (const m of rows) out.push({ ...m, bookId: book.id, bookTitle: book.title });
  }
  return out;
}

/** Newest first, with the undated at the back where they belong. */
export function byRecent(rows: readonly Highlight[]): Highlight[] {
  return [...rows].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export interface HighlightFilter {
  query?: string;
  colour?: string;
  bookId?: string;
}

/**
 * Narrow the list.
 *
 * The search folds accents the same way the in-book search does, so looking
 * for "melange" finds "mélange" — and it searches the BOOK TITLE as well as
 * the passage, because "that thing in Dune" is how anybody actually looks for
 * a highlight.
 */
export function filterHighlights(
  rows: readonly Highlight[],
  filter: HighlightFilter,
): Highlight[] {
  const q = fold((filter.query ?? "").trim().toLowerCase());
  return rows.filter((r) => {
    if (filter.colour && r.colour !== filter.colour) return false;
    if (filter.bookId && r.bookId !== filter.bookId) return false;
    if (!q) return true;
    return fold(r.text.toLowerCase()).includes(q) || fold(r.bookTitle.toLowerCase()).includes(q);
  });
}

/** The same rows, gathered under the book they came from, order preserved. */
export function groupByBook(rows: readonly Highlight[]): BookHighlights[] {
  const out: BookHighlights[] = [];
  const seen = new Map<string, BookHighlights>();
  for (const r of rows) {
    let group = seen.get(r.bookId);
    if (!group) {
      group = { bookId: r.bookId, title: r.bookTitle, rows: [] };
      seen.set(r.bookId, group);
      out.push(group);
    }
    group.rows.push(r);
  }
  return out;
}

/** How many of each colour, for the filter chips. Colours with none are 0. */
export function tallyByColour(rows: readonly Highlight[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of MARK_COLOURS) out[c.id] = 0;
  for (const r of rows) out[r.colour] = (out[r.colour] ?? 0) + 1;
  return out;
}

/**
 * The list as Markdown, ready to leave the app.
 *
 * Blockquotes rather than bullets: a highlight is somebody else's sentence,
 * and pasting a page of them into notes as your own bullet points is how a
 * quote turns into a thing you think you wrote. The colour is not carried —
 * it means something only to the person who chose it, and five pastel names
 * in a text file is noise.
 */
export function toMarkdown(rows: readonly Highlight[]): string {
  const groups = groupByBook(rows);
  if (groups.length === 0) return "";
  return groups
    .map((g) => {
      const body = g.rows
        .map((r) => r.text.split("\n").map((line) => `> ${line}`).join("\n"))
        .join("\n\n");
      return `## ${g.title}\n\n${body}`;
    })
    .join("\n\n");
}

/** "12 highlights in 3 books", or the singular of either. */
export function summarise(rows: readonly Highlight[]): string {
  const books = new Set(rows.map((r) => r.bookId)).size;
  if (rows.length === 0) return "Nothing highlighted yet";
  const h = `${rows.length} highlight${rows.length === 1 ? "" : "s"}`;
  return `${h} in ${books} book${books === 1 ? "" : "s"}`;
}
