/**
 * A shelf, rather than a list of titles.
 *
 * A reading log written as rows of text is a log nobody opens. What makes you
 * pick a book back up is seeing it — which means the cover has to be the
 * biggest thing on the card, and the shelf has to be something you sweep a
 * thumb along rather than scroll past on the way to something else.
 *
 * The rules here are about ORDER and about what to draw when there is no
 * artwork, because those are the two things that decide whether a shelf looks
 * like a shelf or like a spreadsheet with pictures.
 */

import type { MindEntry } from "./types.ts";

/** Where a book's cover lives in the photo database. */
export const coverKey = (id: string) => `book:${id}`;

/** Covers are 2:3. Every cover, at every size, or the shelf looks broken. */
export const COVER_RATIO = 2 / 3;

export type ShelfStatus = "reading" | "unread" | "finished";

export function statusOf(book: MindEntry): ShelfStatus {
  if (book.finished) return "finished";
  return (book.page ?? 0) > 0 ? "reading" : "unread";
}

const RANK: Record<ShelfStatus, number> = { reading: 0, unread: 1, finished: 2 };

/**
 * Reading first, then unread, then finished.
 *
 * The book you are actually in the middle of is the one the shelf exists for,
 * so it is never behind a swipe. Finished books stay — a shelf you clear is a
 * shelf with nothing to show for the year — but they sink to the end.
 *
 * Within a group, most recent first. Ties break on title so the order is
 * stable rather than dependent on however the array happened to be built.
 */
export function sortShelf(books: MindEntry[]): MindEntry[] {
  return [...(books ?? [])].sort((a, b) => {
    const r = RANK[statusOf(a)] - RANK[statusOf(b)];
    if (r !== 0) return r;
    const da = a.finished ?? a.date ?? "";
    const db = b.finished ?? b.date ?? "";
    if (da !== db) return da < db ? 1 : -1;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}

export function onlyBooks(entries: MindEntry[]): MindEntry[] {
  return (entries ?? []).filter((m) => m?.kind === "book");
}

/** How far through, 0-100, or null when there is nothing to measure against. */
export function percentOf(book: MindEntry): number | null {
  if (book.finished) return 100;
  const page = Number(book.page) || 0;
  const pages = Number(book.pages) || 0;
  if (pages <= 0 || page <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((page / pages) * 100)));
}

/** The line under the cover. Short, because it sits under a thumbnail. */
export function shelfLabel(book: MindEntry): string {
  if (book.finished) return "Finished";
  const page = Number(book.page) || 0;
  const pages = Number(book.pages) || 0;
  if (page <= 0) return "Not started";
  if (pages > 0) return `${percentOf(book)}%`;
  return `p. ${page}`;
}

/**
 * A stable colour for a book with no artwork.
 *
 * Derived from the title so the same book is the same colour on every device
 * and after every reinstall — a placeholder that changes on reload reads as a
 * glitch. A drawn cover is not a missing cover: a shelf of grey rectangles
 * looks broken, a shelf of coloured spines looks like a shelf.
 */
export function hueFor(title: string): number {
  const s = String(title ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** Up to three words, for a drawn cover that has to read at thumbnail size. */
export function coverWords(title: string): string[] {
  return String(title ?? "")
    .replace(/[:—–-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
}

export type CoverSource =
  | { kind: "local"; url: string }
  | { kind: "remote"; url: string }
  | { kind: "drawn" };

/**
 * Where a cover comes from, in order of how much it can be trusted.
 *
 * Local bytes first: they are in the backup, they work on a plane, and they
 * will still be there when the link is not. The remote URL is the fallback
 * rather than the source, because an `<img>` renders cross-origin art that a
 * `fetch` may not be allowed to read — so a cover can be visible on the phone
 * even when it could not be downloaded and stored.
 */
export function coverSource(local: string | null, remote: string | undefined): CoverSource {
  if (local) return { kind: "local", url: local };
  if (remote && /^https?:\/\//i.test(remote)) return { kind: "remote", url: remote };
  return { kind: "drawn" };
}

export interface ShelfCounts {
  reading: number;
  unread: number;
  finished: number;
  total: number;
}

export function counts(books: MindEntry[]): ShelfCounts {
  const out: ShelfCounts = { reading: 0, unread: 0, finished: 0, total: 0 };
  for (const b of books ?? []) {
    out[statusOf(b)]++;
    out.total++;
  }
  return out;
}

/** "3 finished this year" and nothing when there are none — see the note below. */
export function finishedIn(books: MindEntry[], year: number): number {
  const prefix = `${year}-`;
  return (books ?? []).filter((b) => b.finished?.startsWith(prefix)).length;
}
