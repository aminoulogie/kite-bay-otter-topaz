import { coverKey } from "./shelf.ts";
import { kindOf, saveBookFile, titleFromFilename, type BookFileKind } from "./book-files.ts";
import { savePhoto } from "./habit-photos.ts";

/**
 * Importing a book you already have.
 *
 * Everything the shelf needs is inside the file: an EPUB declares its title,
 * author and cover in its package document, and a PDF carries metadata and
 * has a first page that is its cover whether it calls it one or not. So
 * nothing here asks the network, and importing a book works in a tunnel.
 *
 * Every step past the first is best effort and independent. A book whose
 * metadata is unreadable still goes on the shelf under its filename, because
 * the alternative — a failed import, and a file you own that you cannot read
 * — is far worse than a shelf entry you have to rename.
 *
 * The heavy readers are dynamically imported here rather than at the top, so
 * a phone that never opens a PDF never downloads pdf.js.
 */

export interface ImportedBook {
  kind: BookFileKind;
  name: string;
  title: string;
  author?: string;
  /** Pages for a PDF, chapters for an EPUB. Both drive the same progress bar. */
  units?: number;
  cover?: Blob;
}

/** What the file says about itself, before anything is written down. */
export async function readBookFile(file: File): Promise<ImportedBook> {
  const kind = kindOf(file);
  if (!kind) throw new Error("That is not a PDF or an EPUB.");
  const fallback = titleFromFilename(file.name);
  const data = await file.arrayBuffer();

  if (kind === "epub") {
    try {
      const { EpubArchive } = await import("./epub-archive.ts");
      const archive = await EpubArchive.open(data);
      const out: ImportedBook = {
        kind,
        name: file.name,
        title: archive.book.title?.trim() || fallback,
        author: archive.book.author?.trim() || undefined,
        units: archive.book.chapters.length,
        cover: archive.coverBlob() ?? undefined,
      };
      archive.release();
      return out;
    } catch (err) {
      // A malformed EPUB is worth refusing, not papering over: the reader
      // cannot show a book it cannot unzip, so putting it on the shelf would
      // be promising something that will never open.
      throw asError(err, "That EPUB could not be read.");
    }
  }

  const { openPdf, pdfAuthor, pdfCover, pdfTitle } = await import("./pdf.ts");
  let doc;
  try {
    doc = await openPdf(data);
  } catch (err) {
    throw asError(err, "That PDF could not be read.");
  }
  try {
    return {
      kind,
      name: file.name,
      title: (await pdfTitle(doc)) ?? fallback,
      author: await pdfAuthor(doc),
      units: doc.numPages,
      cover: (await pdfCover(doc)) ?? undefined,
    };
  } finally {
    void doc.loadingTask.destroy();
  }
}

/**
 * Write the file and its cover down, once the shelf entry exists.
 *
 * Split from the reading on purpose: the entry has to be created first so the
 * file and the cover have an id to be filed under, and an import that fails
 * halfway should leave a book on the shelf rather than orphaned bytes in a
 * database nothing points at.
 */
export async function storeBookFile(
  id: string, date: string, file: File, read: ImportedBook,
): Promise<void> {
  await saveBookFile(id, read.kind, file.name, file);
  if (read.cover && read.cover.size > 0) {
    try {
      await savePhoto(coverKey(id), date, read.cover);
    } catch {
      // No cover. The shelf draws its own from the title, which is what it
      // does for every book the lookup cannot find artwork for.
    }
  }
}

function asError(err: unknown, fallback: string): Error {
  const said = err instanceof Error ? err.message : "";
  return new Error(said && said.length < 160 ? said : fallback);
}

/**
 * Open the system file picker for books.
 *
 * `accept` narrows what the picker offers rather than what it will accept —
 * iOS Files in particular will hand over anything — so the kind is checked
 * again on the way in.
 */
export function pickBookFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.epub,application/pdf,application/epub+zip";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };

    input.addEventListener("change", () => done(Array.from(input.files ?? [])));
    // There is no cancel event on a file input. Focus returning to the window
    // means the picker closed; if nothing arrived by then, it was dismissed.
    window.addEventListener("focus", () => setTimeout(() => done([]), 400), { once: true });
    input.click();
  });
}
