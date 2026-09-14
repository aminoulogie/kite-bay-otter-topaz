import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List, Loader2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBookFile } from "@/lib/book-files";
import type { EpubArchive } from "@/lib/epub-archive";
import { cn } from "@/lib/utils";
import type { MindEntry } from "@/lib/types";

/**
 * Reading the book, rather than logging that you read it.
 *
 * Full screen, black, and nothing on it but the page: a reader with a toolbar
 * pinned to the top is a document viewer, and a document viewer is what makes
 * people read on their phone in some other app and then come here to type in
 * a page number. The controls appear on a tap and go away again.
 *
 * One component for both formats because they are the same reading session
 * with a different renderer behind it. A PDF has pages, an EPUB has chapters
 * that are as long as they are — but both are "where am I, and take me one
 * forward", and both write that position back onto the shelf entry, so the
 * progress bar on the cover is the real one whether you read the book here or
 * on paper.
 */
export function BookReader({
  book, onClose, onChange,
}: {
  book: MindEntry;
  onClose: () => void;
  onChange: (patch: Partial<MindEntry>) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chrome, setChrome] = useState(true);

  // Where we are, one-based, in pages for a PDF and chapters for an EPUB.
  const [at, setAt] = useState(Math.max(1, book.page ?? 1));
  const [total, setTotal] = useState(book.pages ?? 0);

  // Written back on a debounce rather than per turn: one page turn is one
  // localStorage write of the entire diary, and a thumb held on the forward
  // button would do fifty of them.
  const saved = useRef({ at: book.page ?? 0, total: book.pages ?? 0 });
  useEffect(() => {
    if (saved.current.at === at && saved.current.total === total) return;
    const t = setTimeout(() => {
      saved.current = { at, total };
      onChange({ page: at, pages: total || undefined });
    }, 700);
    return () => clearTimeout(t);
  }, [at, total, onChange]);

  const back = () => setAt((n) => Math.max(1, n - 1));
  const forward = () => setAt((n) => (total ? Math.min(total, n + 1) : n + 1));

  // A keyboard is not the point but costs four lines, and Escape has to work
  // or a full-screen layer is a trap on a desktop.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") back();
      else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") forward();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // `back` and `forward` only ever read the setter's own argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, total]);

  const pct = total > 0 ? Math.round((at / total) * 100) : 0;
  const unit = book.fileKind === "epub" ? "chapter" : "page";

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-[#0b0b0d]"
      role="dialog"
      aria-modal="true"
      aria-label={`Reading ${book.title}`}
    >
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm leading-snug text-white/80">{error}</p>
          <Button onClick={onClose}>Back to the shelf</Button>
        </div>
      ) : book.fileKind === "epub" ? (
        <EpubPages
          book={book}
          index={at - 1}
          onReady={(n) => {
            setTotal(n);
            setLoading(false);
            // A book opened for the first time starts at its beginning, and a
            // stored position past the end of a re-imported file is a position
            // that no longer exists.
            setAt((cur) => Math.min(Math.max(1, cur), n));
          }}
          onError={setError}
          onTap={() => setChrome((v) => !v)}
        />
      ) : (
        <PdfPages
          book={book}
          page={at}
          onReady={(n) => {
            setTotal(n);
            setLoading(false);
            setAt((cur) => Math.min(Math.max(1, cur), n));
          }}
          onError={setError}
          onTap={() => setChrome((v) => !v)}
          onBack={back}
          onForward={forward}
        />
      )}

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-7 animate-spin text-white/60" />
        </div>
      )}

      {/* The chrome, which is deliberately two bars and nothing else. It fades
          rather than unmounting, so the page does not reflow every time you
          tap it and lose your place mid-paragraph. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2",
          "bg-gradient-to-b from-black/85 to-transparent px-3 pb-6",
          "pt-[max(12px,env(safe-area-inset-top))] transition-opacity duration-200",
          chrome ? "opacity-100" : "opacity-0",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the book"
          className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[0.78rem] font-bold text-white">{book.title}</div>
          {book.author && (
            <div className="truncate text-[0.62rem] text-white/55">{book.author}</div>
          )}
        </div>
        <span className="size-10 shrink-0" />
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0",
          "bg-gradient-to-t from-black/85 to-transparent px-3 pt-8",
          "pb-[max(12px,env(safe-area-inset-bottom))] transition-opacity duration-200",
          chrome ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="mb-2 h-[3px] w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-white/70" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={at <= 1}
            aria-label={`Previous ${unit}`}
            className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="tabular text-[0.7rem] font-bold text-white/75">
            {total ? `${unit === "page" ? "Page" : "Chapter"} ${at} of ${total}` : `${unit} ${at}`}
          </span>
          <button
            type="button"
            onClick={forward}
            disabled={total > 0 && at >= total}
            aria-label={`Next ${unit}`}
            className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   PDF
   ========================================================================== */

/**
 * A PDF page, drawn to a canvas at the width of the screen.
 *
 * One page at a time rather than a scrolling document. A continuous scroll is
 * the right shape for a PDF on a desktop and the wrong one on a phone: at
 * phone width a page is small enough that where you stopped is a page number,
 * not a scroll position, and a scroll position is what gets lost.
 */
function PdfPages({
  book, page, onReady, onError, onTap, onBack, onForward,
}: {
  book: MindEntry;
  page: number;
  onReady: (total: number) => void;
  onError: (message: string) => void;
  onTap: () => void;
  onBack: () => void;
  onForward: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const doc = useRef<Awaited<ReturnType<typeof import("@/lib/pdf").openPdf>> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const file = await getBookFile(book.id);
        if (!file) throw new Error("The file for this book is not on this device any more.");
        const { openPdf } = await import("@/lib/pdf");
        const opened = await openPdf(await file.blob.arrayBuffer());
        if (!alive) {
          void opened.loadingTask.destroy();
          return;
        }
        doc.current = opened;
        setReady(true);
        onReady(opened.numPages);
      } catch (err) {
        if (alive) onError(messageFor(err, "That PDF would not open."));
      }
    })();
    return () => {
      alive = false;
      // The loading task owns the worker, so this is what actually lets the
      // worker thread and the parsed document go — doc.destroy() is gone.
      void doc.current?.loadingTask.destroy();
      doc.current = null;
    };
    // Opened once per book; `onReady` and `onError` are stable enough that
    // re-running this would mean re-parsing a 40MB file on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  const draw = useCallback(async () => {
    const d = doc.current;
    const box = host.current;
    if (!d || !box) return;
    setDrawing(true);
    try {
      const { renderPage } = await import("@/lib/pdf");
      const width = Math.max(200, box.clientWidth * zoom);
      // The canvas goes in BEFORE the ink does, so a page that is slow to
      // rasterise shows itself filling in rather than leaving the screen black
      // until it is finished.
      const canvas = await renderPage(d, page, width, window.devicePixelRatio || 1, (c) =>
        box.replaceChildren(c),
      );
      if (canvas.parentElement !== box) box.replaceChildren(canvas);
      // Back to the top of the new page. Landing halfway down page 40 because
      // that is where you were on page 39 is the single most disorientating
      // thing a reader can do.
      box.parentElement?.scrollTo({ top: 0 });
      setTrouble(null);
    } catch (err) {
      // A page that will not render is one page, not the book — the reader
      // stays open and the turn can be tried again. But it says so: a reader
      // that silently shows nothing is indistinguishable from a blank page.
      setTrouble(messageFor(err, "That page would not draw."));
    } finally {
      setDrawing(false);
    }
  }, [page, zoom]);

  useEffect(() => {
    if (ready) void draw();
  }, [ready, draw]);

  return (
    <>
      <div className="flex-1 overflow-auto overscroll-contain" onClick={onTap}>
        {/* Clear of both bars. The chrome fades rather than unmounting, so
            without this the first line of every page opens underneath the
            title and the last one under the page counter. */}
        <div
          ref={host}
          className="mx-auto w-full pb-24 pt-[max(64px,calc(env(safe-area-inset-top)+52px))] [&>canvas]:block"
        />
      </div>

      {trouble && (
        <p className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-xs leading-snug text-white/70">
          {trouble}
        </p>
      )}

      {/* Tap zones, on the page itself. A phone held in one hand turns pages
          with the thumb that is already on the screen, not by reaching for a
          button at the bottom. The middle is left alone so tapping the text
          still shows the chrome.

          Unlabelled and out of the tab order on purpose: they are a shortcut
          to the buttons in the bar below, and giving them the same names would
          put two "Next page" controls in front of anyone reading the screen. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onBack}
        className="absolute inset-y-[15%] left-0 w-[22%] opacity-0"
      />
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onForward}
        className="absolute inset-y-[15%] right-0 w-[22%] opacity-0"
      />

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        <ZoomButton label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
          <Plus className="size-4" />
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
          <Minus className="size-4" />
        </ZoomButton>
        {drawing && <Loader2 className="mx-auto size-4 animate-spin text-white/50" />}
      </div>
    </>
  );
}

function ZoomButton({
  label, onClick, children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur"
    >
      {children}
    </button>
  );
}

/* ==========================================================================
   EPUB
   ========================================================================== */

/**
 * One chapter of an EPUB, as flowing text.
 *
 * Reflowed rather than paginated. An EPUB has no pages — it is HTML, and the
 * "page" a reader shows you is one it invented from your font size. Scrolling
 * a chapter is honest about that, works at any text size, and means the app's
 * own typography can carry the book instead of the publisher's stylesheet.
 */
function EpubPages({
  book, index, onReady, onError, onTap,
}: {
  book: MindEntry;
  index: number;
  onReady: (total: number) => void;
  onError: (message: string) => void;
  onTap: () => void;
}) {
  const archive = useRef<EpubArchive | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [title, setTitle] = useState("");
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState(1);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const file = await getBookFile(book.id);
        if (!file) throw new Error("The file for this book is not on this device any more.");
        const { EpubArchive } = await import("@/lib/epub-archive");
        const opened = await EpubArchive.open(await file.blob.arrayBuffer());
        if (!alive) {
          opened.release();
          return;
        }
        archive.current = opened;
        setReady(true);
        onReady(opened.book.chapters.length);
      } catch (err) {
        if (alive) onError(messageFor(err, "That EPUB would not open."));
      }
    })();
    return () => {
      alive = false;
      archive.current?.release();
      archive.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  useEffect(() => {
    if (!ready) return;
    const part = archive.current?.chapter(index);
    setHtml(part?.html ?? "");
    setTitle(part?.title ?? "");
    scroller.current?.scrollTo({ top: 0 });
  }, [ready, index]);

  return (
    <>
      <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain" onClick={onTap}>
        <div
          className="soma-epub mx-auto max-w-[38rem] px-5 pb-24 pt-[max(64px,calc(env(safe-area-inset-top)+52px))]"
          style={{ fontSize: `${size}rem` }}
        >
          {title && (
            <p className="mb-4 text-[0.6rem] font-bold uppercase tracking-[0.16em] text-white/35">
              {title}
            </p>
          )}
          {/* The chapter's own markup, with scripts stripped and every link
              rewritten to the archive — see lib/epub.ts. It is the book's
              text; there is no other way to show it. */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        <ZoomButton label="Larger text" onClick={() => setSize((s) => Math.min(1.6, s + 0.1))}>
          <Plus className="size-4" />
        </ZoomButton>
        <ZoomButton label="Smaller text" onClick={() => setSize((s) => Math.max(0.8, s - 0.1))}>
          <Minus className="size-4" />
        </ZoomButton>
        <ZoomButton label="Contents" onClick={onTap}>
          <List className="size-4" />
        </ZoomButton>
      </div>
    </>
  );
}

function messageFor(err: unknown, fallback: string): string {
  const said = err instanceof Error ? err.message : "";
  return said && said.length < 160 ? said : fallback;
}
