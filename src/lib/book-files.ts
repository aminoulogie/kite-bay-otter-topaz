import { BOOK_STORE, openBlobDb } from "./habit-photos.ts";

/**
 * The actual book, when the book is a file you own.
 *
 * A PDF is tens of megabytes and an EPUB a few. Neither can go anywhere near
 * the zustand store — that persists to localStorage, which is a ~5MB
 * string-only budget shared with every set you have ever logged. They go in
 * the blob database beside the photos, keyed by the shelf entry's id, so
 * removing a book from the shelf can take its file with it.
 *
 * They are deliberately NOT in the JSON backup. A backup you cannot email to
 * yourself is a backup nobody makes, and one book would be larger than every
 * other thing this app has ever recorded about you put together. The shelf
 * entry — title, author, cover, what page you are on — is backed up like any
 * other reading log; the file is the one thing you already have a copy of,
 * because you imported it from somewhere.
 */

export type BookFileKind = "pdf" | "epub";

export interface BookFile {
  id: string;
  kind: BookFileKind;
  /** The original filename, for showing what a shelf entry came from. */
  name: string;
  blob: Blob;
  bytes: number;
  ts: number;
}

function bookTx<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openBlobDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(BOOK_STORE, mode);
        const req = run(t.objectStore(BOOK_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

/**
 * What kind of book a file is, by its type and then by its name.
 *
 * The MIME type is the better answer and is missing often enough — iOS Files
 * hands over an empty type for an EPUB about half the time — that a reader
 * relying on it alone rejects books it can read perfectly well.
 */
export function kindOf(file: { name?: string; type?: string }): BookFileKind | null {
  const type = (file.type ?? "").toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "application/epub+zip" || type === "application/epub") return "epub";
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".epub")) return "epub";
  return null;
}

/** A filename with its extension and any download cruft taken off. */
export function titleFromFilename(name: string): string {
  return (
    name
      .replace(/\.(pdf|epub)$/i, "")
      .replace(/[_+]+/g, " ")
      // "(z-lib.org)", "(1)", "[retail]" — what a file picks up on its way here.
      .replace(/[([][^)\]]*(?:z-lib|libgen|annas|retail|ebook|\d+)[^)\]]*[)\]]/gi, "")
      .replace(/\s+/g, " ")
      .trim() || name
  );
}

/** Human size, for a shelf that should say what it is holding. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export async function saveBookFile(
  id: string, kind: BookFileKind, name: string, blob: Blob,
): Promise<BookFile> {
  const row: BookFile = { id, kind, name, blob, bytes: blob.size, ts: Date.now() };
  await bookTx("readwrite", (s) => s.put(row));
  return row;
}

export async function getBookFile(id: string): Promise<BookFile | null> {
  return (await bookTx<BookFile | undefined>("readonly", (s) => s.get(id))) ?? null;
}

export async function deleteBookFile(id: string): Promise<void> {
  await bookTx("readwrite", (s) => s.delete(id));
}

/** Which shelf entries have a file behind them, for one lookup per render. */
export async function bookFileIds(): Promise<Set<string>> {
  const keys = await bookTx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
  return new Set(keys.map(String));
}
