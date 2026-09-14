import { unzip } from "fflate";
import {
  CONTAINER_PATH, chapterHtml, chapterTitle, containerOpfPath, parseOpf, type EpubBook,
} from "./epub.ts";

/**
 * An EPUB, unzipped and ready to read.
 *
 * fflate rather than JSZip: 12KB against 100KB, and the only thing needed
 * here is "give me these bytes out of this archive". The rulebook — which
 * chapter comes next, where the cover is — is lib/epub.ts, which is pure and
 * tested; this is the part that needs an archive and a browser.
 */

const decoder = new TextDecoder();

export class EpubArchive {
  private files: Record<string, Uint8Array>;
  private urls = new Map<string, string>();
  readonly book: EpubBook;
  readonly opfPath: string;

  private constructor(files: Record<string, Uint8Array>, book: EpubBook, opfPath: string) {
    this.files = files;
    this.book = book;
    this.opfPath = opfPath;
  }

  static async open(data: ArrayBuffer): Promise<EpubArchive> {
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(new Uint8Array(data), (err, out) => (err ? reject(err) : resolve(out)));
    });

    const container = files[CONTAINER_PATH];
    if (!container) throw new Error("That file is not an EPUB — it has no container.xml.");
    const opfPath = containerOpfPath(decoder.decode(container));
    if (!opfPath) throw new Error("That EPUB does not say where its contents are.");

    const opf = files[opfPath];
    if (!opf) throw new Error(`That EPUB points at ${opfPath}, which is not in it.`);
    const book = parseOpf(decoder.decode(opf), opfPath);
    if (!book || book.chapters.length === 0) throw new Error("That EPUB has no chapters in it.");

    return new EpubArchive(files, book, opfPath);
  }

  text(path: string): string | null {
    const bytes = this.files[path];
    return bytes ? decoder.decode(bytes) : null;
  }

  blob(path: string): Blob | null {
    const bytes = this.files[path];
    if (!bytes) return null;
    // A fresh ArrayBuffer, not the view: the unzipped output shares one buffer
    // across every entry, and handing that to a Blob hands over the whole book.
    return new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: this.book.byPath.get(path) || "application/octet-stream",
    });
  }

  /**
   * A URL for a file in the archive, made once and kept.
   *
   * Cached rather than created per render: a chapter with forty illustrations
   * re-rendered on every page turn would mint forty object URLs a second and
   * never give one back.
   */
  url(path: string): string | null {
    const had = this.urls.get(path);
    if (had) return had;
    const blob = this.blob(path);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urls.set(path, url);
    return url;
  }

  /** The chapter at this index, as HTML that points at the archive's own bytes. */
  chapter(index: number): { html: string; title: string } | null {
    const ch = this.book.chapters[index];
    if (!ch) return null;
    const xhtml = this.text(ch.path);
    if (xhtml === null) return null;
    return {
      html: chapterHtml(xhtml, ch.path, (p) => this.url(p)),
      title: chapterTitle(xhtml, `Chapter ${index + 1}`),
    };
  }

  coverBlob(): Blob | null {
    return this.book.coverPath ? this.blob(this.book.coverPath) : null;
  }

  /** Every object URL handed out, given back. Called when the reader closes. */
  release(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
