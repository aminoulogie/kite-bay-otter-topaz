import { pickFiles } from "./file-picker.ts";
import { kindOf, titleFromFilename, type BookFileKind } from "./book-files.ts";

/**
 * Importing a book you already have.
 *
 * Everything the shelf needs is inside the file: an EPUB declares its title,
 * author and cover in its package document, and a PDF carries metadata and
 * has a first page that is its cover whether it calls it one or not. So
 * nothing here asks the network, and importing a book works in a tunnel.
 *
 * Reading is all this does. Writing the entry, the bytes and the cover is the
 * shelf's job, because the ORDER matters there: the book goes on the shelf
 * before it is parsed, so tapping import visibly does something on a phone
 * that needs several seconds to open a large PDF.
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

function asError(err: unknown, fallback: string): Error {
  const said = err instanceof Error ? err.message : "";
  return new Error(said && said.length < 160 ? said : fallback);
}

/**
 * Open the system file picker for books.
 *
 * `accept` narrows what the picker OFFERS, not what it will hand over — iOS
 * in particular maps these onto its own type identifiers and is inconsistent
 * about EPUB, so the generic zip and octet-stream forms are listed too rather
 * than have the Files app grey out a book you can see is there. Whatever
 * arrives is checked properly by kindOf.
 */
export function pickBookFiles(): Promise<File[]> {
  return pickFiles({
    accept: [
      ".pdf",
      ".epub",
      "application/pdf",
      "application/epub+zip",
      "application/x-mobipocket-ebook",
      "application/zip",
      "application/octet-stream",
    ].join(","),
    multiple: true,
  });
}
