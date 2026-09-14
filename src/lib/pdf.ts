/**
 * PDF rendering, loaded only when a PDF is opened.
 *
 * pdf.js is over a megabyte with its worker, which is more than the whole of
 * the rest of this app. Nobody who never imports a PDF should pay for it, so
 * it is behind a dynamic import and nothing at the top level of any module
 * touches it — that is the only thing keeping it out of the initial bundle.
 *
 * The worker is imported with ?url so Vite emits it as an asset and serves it
 * from this origin. The CDN path pdf.js documents is not an option: the app
 * has to open a book on a plane, and a worker fetched from unpkg is a reader
 * that only works with a signal.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfLib = typeof import("pdfjs-dist");

let libPromise: Promise<PdfLib> | null = null;

/**
 * The LEGACY build, both for the library and for its worker.
 *
 * Not a fallback and not a mistake. Modern pdf.js is compiled against the
 * newest JavaScript it can find — the current release calls
 * `Map.prototype.getOrInsertComputed`, which is months old — and on anything
 * that does not have it, a PDF opens, reports the right page count, and then
 * throws when it tries to draw. A reader that is silently blank on last
 * year's phone is not a reader. The legacy build is the same code with those
 * methods polyfilled, and the only cost is a few hundred kilobytes in a
 * chunk nobody who never opens a PDF downloads.
 *
 * The two must match: a modern worker under a legacy main thread fails the
 * same way, one process further out where the message is worse.
 */
async function lib(): Promise<PdfLib> {
  if (libPromise) return libPromise;
  libPromise = (async () => {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfLib;
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return libPromise;
}

/**
 * Where pdf.js's own data files are served from.
 *
 * It keeps four folders of them outside its bundle — the base-14 font
 * programmes, the Adobe CMaps, the wasm image decoders, one ICC profile — and
 * fetches whichever it needs while rendering. Left unset it goes looking on
 * the network, which here means a document that opens, reports its page count,
 * and then silently draws nothing behind a proxy or on a plane.
 *
 * BASE_URL, not a leading slash: the same build is served from the root inside
 * the app shell and from a repository sub-path on Pages.
 */
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await lib();
  // A copy, because pdf.js transfers the buffer to its worker and leaves the
  // caller holding a detached one — which matters here, where the same bytes
  // come out of IndexedDB and may be opened twice in a session.
  return pdfjs.getDocument({
    data: data.slice(0),
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
    // The fonts and cmaps are next to the page, not on the internet. This
    // stops pdf.js reaching for anything else it was not given.
    useSystemFonts: false,
  }).promise;
}

/**
 * One page, drawn to a canvas at the width it will be shown.
 *
 * Rendered at the device's pixel ratio rather than at CSS pixels: a page
 * rasterised at 1x and then scaled up by the screen is exactly the blur that
 * made the book covers look wrong, and text is far less forgiving of it than
 * a photograph.
 */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  cssWidth: number,
  ratio: number,
  /** Called with the empty canvas, so a caller can show it filling in. */
  onCanvas?: (canvas: HTMLCanvasElement) => void,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = (cssWidth / base.width) * Math.min(ratio, 3);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser will not give the page a canvas to draw on.");
  onCanvas?.(canvas);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** The book's own title, if it carries one, for a shelf entry that is not a filename. */
export async function pdfTitle(doc: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as { Title?: unknown; Author?: unknown } | undefined;
    const title = typeof info?.Title === "string" ? info.Title.trim() : "";
    // Plenty of PDFs carry a "Title" that is the LaTeX job name or the path it
    // was printed from. One with a slash in it is not a title.
    return title && title.length > 1 && !title.includes("/") ? title : undefined;
  } catch {
    return undefined;
  }
}

export async function pdfAuthor(doc: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as { Author?: unknown } | undefined;
    const author = typeof info?.Author === "string" ? info.Author.trim() : "";
    return author && author.length > 1 ? author : undefined;
  } catch {
    return undefined;
  }
}

/** The first page as an image, which is a PDF's cover whether it says so or not. */
export async function pdfCover(doc: PDFDocumentProxy): Promise<Blob | null> {
  try {
    const canvas = await renderPage(doc, 1, 600, 1);
    return await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
  } catch {
    return null;
  }
}
