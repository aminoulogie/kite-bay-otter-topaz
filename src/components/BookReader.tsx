import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, Minus, Plus, Rows3, Settings2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getBookFile } from "@/lib/book-files";
import type { EpubArchive } from "@/lib/epub-archive";
import { linesIn, stepLine, type Rect } from "@/lib/lines";
import {
  PAGE_GAP, bookProgress, clampPage, isTurning, pageCount, pageOffset, tapAt, turnFrom,
} from "@/lib/paginate";
import {
  LINE_HEIGHT, MARGIN, READER_FONTS, READER_THEMES, SIZE, cleanReader, fontStack,
  step as stepPref, themeSpec, type ReaderPrefs,
} from "@/lib/reader-prefs";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { capture } from "@/lib/word-capture";
import { cn } from "@/lib/utils";
import type { MindEntry } from "@/lib/types";

/**
 * Reading the book, rather than logging that you read it.
 *
 * Full screen, nothing on it but the page: a reader with a toolbar pinned to
 * the top is a document viewer, and a document viewer is what makes people
 * read on their phone in some other app and then come here to type in a page
 * number. The controls appear on a tap and go away again.
 *
 * One component for both formats because they are the same reading session
 * with a different renderer behind it. A PDF has pages on paper; an EPUB has
 * HTML that becomes pages only once someone has chosen a font size. Both are
 * "where am I, and take me one forward", and both write that position back
 * onto the shelf entry, so the progress bar on the cover is the real one
 * whether you read the book here or on paper.
 */
export function BookReader({
  book, onClose, onChange,
}: {
  book: MindEntry;
  onClose: () => void;
  onChange: (patch: Partial<MindEntry>) => void;
}) {
  const stored = useSoma((s) => s.settings.reader);
  const patchSettings = useSoma((s) => s.patchSettings);
  const prefs = useMemo(() => cleanReader(stored), [stored]);
  const setPrefs = useCallback(
    (next: ReaderPrefs) => patchSettings({ reader: cleanReader(next) }),
    [patchSettings],
  );
  const theme = themeSpec(prefs.theme);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chrome, setChrome] = useState(true);
  const [showPrefs, setShowPrefs] = useState(false);

  // Where we are, one-based, in pages for a PDF and chapters for an EPUB.
  const [at, setAt] = useState(Math.max(1, book.page ?? 1));
  const [total, setTotal] = useState(book.pages ?? 0);
  /** Page within the current chapter, for the counter and the progress bar. */
  const [spread, setSpread] = useState({ page: 0, pages: 1 });

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

  /**
   * The renderer's own back and forward.
   *
   * An imperative handle rather than state, because what "forward" means is a
   * question only the renderer can answer: for an EPUB it is the next PAGE,
   * which exists only after the chapter has been laid out at the current font
   * size, and rolls over into the next chapter at the end. Lifting that into
   * this component would mean lifting the measuring with it.
   */
  const pager = useRef<Pager | null>(null);
  const back = useCallback(() => pager.current?.back(), []);
  const forward = useCallback(() => pager.current?.forward(), []);

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
  }, [onClose, back, forward]);

  const epub = book.fileKind === "epub";
  const progress = epub
    ? bookProgress(at - 1, Math.max(1, total), spread.page, spread.pages)
    : total > 0
      ? at / total
      : 0;

  const common = {
    book,
    prefs,
    onReady: (n: number) => {
      setTotal(n);
      setLoading(false);
      // A book opened for the first time starts at its beginning, and a stored
      // position past the end of a re-imported file is one that no longer
      // exists.
      setAt((cur) => Math.min(Math.max(1, cur), n));
    },
    onError: setError,
    onChrome: () => setChrome((v) => !v),
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Reading ${book.title}`}
      style={{ background: theme.bg, color: theme.fg }}
    >
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm leading-snug opacity-80">{error}</p>
          <Button onClick={onClose}>Back to the shelf</Button>
        </div>
      ) : epub ? (
        <EpubPages
          {...common}
          pager={pager}
          chapter={at - 1}
          onChapter={(n) => setAt(n + 1)}
          onSpread={setSpread}
        />
      ) : (
        <PdfPages {...common} pager={pager} page={at} onPage={setAt} />
      )}

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-7 animate-spin opacity-50" />
        </div>
      )}

      {/* Two bars and nothing else. They fade rather than unmounting, so the
          page does not reflow every time you tap it and lose your place
          mid-paragraph. */}
      <Bar
        edge="top"
        theme={theme}
        show={chrome}
        className="flex items-center justify-between gap-2"
      >
        <RoundButton theme={theme} label="Close the book" onClick={onClose}>
          <X className="size-5" />
        </RoundButton>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[0.78rem] font-bold">{book.title}</div>
          {book.author && (
            <div className="truncate text-[0.62rem]" style={{ color: theme.faint }}>
              {book.author}
            </div>
          )}
        </div>
        <RoundButton
          theme={theme}
          label="Type and theme"
          onClick={() => setShowPrefs(true)}
        >
          <Settings2 className="size-[1.15rem]" />
        </RoundButton>
      </Bar>

      <Bar edge="bottom" theme={theme} show={chrome}>
        <div
          className="mb-2 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: `${theme.fg}22` }}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%`, background: `${theme.fg}99` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <RoundButton theme={theme} label="Back" onClick={back}>
            <ChevronLeft className="size-5" />
          </RoundButton>
          <span className="tabular text-[0.68rem] font-bold" style={{ color: theme.faint }}>
            {epub
              ? `Chapter ${at} of ${total || "?"} · ${spread.page + 1}/${spread.pages}`
              : `Page ${at} of ${total || "?"}`}
          </span>
          <RoundButton theme={theme} label="Forward" onClick={forward}>
            <ChevronRight className="size-5" />
          </RoundButton>
        </div>
      </Bar>

      {showPrefs && (
        <PrefsSheet
          prefs={prefs}
          onChange={setPrefs}
          onClose={() => setShowPrefs(false)}
          epub={epub}
        />
      )}
    </div>
  );
}

/** What a renderer promises the chrome it can do. */
interface Pager {
  back: () => void;
  forward: () => void;
}

type PagerRef = { current: Pager | null };

interface RendererProps {
  book: MindEntry;
  prefs: ReaderPrefs;
  pager: PagerRef;
  onReady: (total: number) => void;
  onError: (message: string) => void;
  onChrome: () => void;
}

/* ==========================================================================
   EPUB
   ========================================================================== */

/**
 * A chapter, cut into pages you swipe between.
 *
 * The whole trick is CSS multi-column. Give the text a column exactly as wide
 * as the screen and a fixed height, and the browser lays the chapter out into
 * as many side-by-side columns as it needs; a page turn is then a horizontal
 * translate by one column. It is instant, the text is never re-laid-out
 * mid-swipe, and it is how iBooks, Kindle and epub.js all do it.
 *
 * Scrolling is still there for anyone who wants it — a scroll is honest about
 * an EPUB having no pages of its own — but paged is the default, because a
 * page you turn is what makes a phone feel like a book rather than a website.
 *
 * The arithmetic is in lib/paginate.ts, which is where it can be tested. This
 * holds the DOM, the measuring, and the gesture.
 */
function EpubPages({
  book, prefs, pager, chapter, onReady, onError, onChrome, onChapter, onSpread,
}: RendererProps & {
  chapter: number;
  onChapter: (index: number) => void;
  onSpread: (s: { page: number; pages: number }) => void;
}) {
  const archive = useRef<EpubArchive | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [label, setLabel] = useState("");
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [chapters, setChapters] = useState(0);
  /** Set when a chapter is entered backwards, so it opens on its last page. */
  const landOnLast = useRef(false);
  const theme = themeSpec(prefs.theme);

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
        setChapters(opened.book.chapters.length);
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
    // Opened once per book. Re-running would re-unzip the whole archive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // The chapter's markup. Changing font size does NOT come through here: the
  // HTML is the same, only its layout changes, and re-parsing a chapter to
  // make the type one point bigger would blank the screen every tap.
  useEffect(() => {
    if (!ready) return;
    const part = archive.current?.chapter(chapter);
    setHtml(part?.html ?? "");
    setLabel(part?.title ?? "");
  }, [ready, chapter]);

  // The page box. Measured rather than assumed, because it is the viewport
  // minus the margins and minus whatever the safe area is on this phone.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * How many pages this chapter came to, at this size, in this box.
   *
   * Re-run on every change that can reflow the text. The double rAF is not
   * superstition: the column layout is not final until the browser has done a
   * layout pass with the new font metrics, and measuring before that reports
   * the previous size's page count — which lands you on page nine of a book
   * that now has four.
   */
  useEffect(() => {
    const el = column.current;
    if (!el || !box.w) return;
    let raf = 0;
    let raf2 = 0;
    raf = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const count = pageCount(el.scrollWidth, box.w);
        // Read BEFORE the setState, not inside it. A functional updater runs
        // when React gets round to it, and the line that clears the flag runs
        // immediately — so the updater always saw `false` and a chapter
        // entered backwards opened at its first page instead of its last.
        const last = landOnLast.current;
        landOnLast.current = false;
        setPages(count);
        setPage((cur) => (last ? count - 1 : clampPage(cur, count)));
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
    };
  }, [html, box.w, box.h, prefs.size, prefs.lineHeight, prefs.font, prefs.paged]);

  useEffect(() => {
    onSpread({ page, pages });
  }, [page, pages, onSpread]);

  /**
   * One page forward or back, rolling over into the next chapter.
   *
   * Written against the current page rather than inside a setState updater.
   * An updater has to be pure — React is allowed to run it twice — and the
   * chapter change is a call into the component above, so putting it there
   * meant the roll-over was quietly dropped and the book stopped dead on the
   * last page of chapter one.
   */
  const go = useCallback(
    (delta: 1 | -1) => {
      const next = page + delta;
      if (next >= 0 && next < pages) {
        setPage(next);
        return;
      }
      if (delta > 0 && chapter + 1 < chapters) {
        setPage(0);
        onChapter(chapter + 1);
        return;
      }
      if (delta < 0 && chapter > 0) {
        // The chapter behind you opens at its END, because that is where you
        // were standing when you walked backwards out of it.
        landOnLast.current = true;
        onChapter(chapter - 1);
      }
    },
    [page, pages, chapter, chapters, onChapter],
  );

  // Published for the chrome's own buttons and the keyboard. In an effect
  // rather than during render: a ref written while rendering is a side effect
  // in a function that is allowed to run twice.
  useEffect(() => {
    pager.current = { back: () => go(-1), forward: () => go(1) };
  }, [pager, go]);

  return (
    <ReadingSurface
      book={book}
      prefs={prefs}
      viewportRef={viewport}
      columnRef={column}
      box={box}
      onTurn={go}
      onChrome={onChrome}
      page={page}
      pages={pages}
    >
      <div
        className="soma-epub"
        ref={column}
        style={{
          fontFamily: fontStack(prefs.font),
          fontSize: `${prefs.size}px`,
          lineHeight: prefs.lineHeight,
          color: theme.fg,
          ...(prefs.paged
            ? {
                height: `${box.h}px`,
                columnWidth: `${box.w}px`,
                columnGap: `${PAGE_GAP}px`,
                columnFill: "auto" as const,
                transform: `translateX(-${pageOffset(page, box.w)}px)`,
                transition: "transform 260ms cubic-bezier(.2,.8,.2,1)",
              }
            : {}),
        }}
      >
        {label && (
          <p
            className="soma-epub-label"
            style={{ color: theme.faint }}
          >
            {label}
          </p>
        )}
        {/* The chapter's own markup, with scripts stripped and every link
            rewritten to the archive — see lib/epub.ts. It is the book's text;
            there is no other way to show it. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </ReadingSurface>
  );
}

/* ==========================================================================
   The surface: gestures, word capture and line focus
   ========================================================================== */

/**
 * Everything that happens ON the page, as opposed to in it.
 *
 * Shared rather than written twice because a swipe, a highlighted word and a
 * lit line are the same three behaviours whether the page underneath is an
 * EPUB column or a rendered PDF — and the one thing a reader must never do is
 * behave differently depending on what the book happens to be stored as.
 */
function ReadingSurface({
  book, prefs, viewportRef, columnRef, box, onTurn, onChrome, page, pages, children,
}: {
  book: MindEntry;
  prefs: ReaderPrefs;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  columnRef: React.RefObject<HTMLDivElement | null>;
  box: { w: number; h: number };
  onTurn: (delta: 1 | -1) => void;
  onChrome: () => void;
  page: number;
  pages: number;
  children: React.ReactNode;
}) {
  const theme = themeSpec(prefs.theme);
  const addMind = useSoma((s) => s.addMind);
  const removeMind = useSoma((s) => s.removeMind);

  const drag = useRef<{ x: number; y: number; turning: boolean } | null>(null);
  const [lines, setLines] = useState<Rect[]>([]);
  const [line, setLine] = useState(0);
  /** Set when a page is entered backwards, so it opens on its last line. */
  const landOnLastLine = useRef(false);

  /**
   * A word you highlighted is a word you wanted.
   *
   * Filed the moment the selection settles, with no dialog in the way — the
   * request was "as soon as a word is highlighted it goes to the words
   * section", and a confirmation step is the thing that stops you collecting
   * words at all. It is undoable for a few seconds, which is the right shape
   * for an action that costs nothing and happens often.
   *
   * The sentence around it comes too. A word alone is a flashcard you will
   * fail; the same word in the line you met it in is a memory — and the text
   * is already on the screen, so it is free.
   */
  useEffect(() => {
    const file = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const host = columnRef.current;
      if (!host || !host.contains(range.commonAncestorContainer)) return;

      const block =
        range.startContainer.parentElement?.closest("p, li, blockquote, h1, h2, h3, div")
          ?.textContent ?? "";
      const got = capture(sel.toString(), block);
      if (!got) return;

      sel.removeAllRanges();
      const id = addMind({
        date: getLocalDateKey(new Date()),
        kind: "language",
        title: got.word,
        example: got.example,
        source: book.title,
      } as Omit<MindEntry, "id">);
      toast.success(`“${got.word}” added to your words`, {
        description: got.example,
        action: { label: "Undo", onClick: () => removeMind(id) },
      });
    };

    // `selectionchange` fires on every pixel the handle moves. Filing on each
    // of them would put the whole drag in the word book one prefix at a time,
    // so the word is taken once the selection has stopped moving.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(file, 420);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [addMind, removeMind, book.title, columnRef]);

  /**
   * The lines on the page, measured from the text the browser actually drew.
   *
   * There is no such thing as a line in HTML — a paragraph is one box, and
   * where it breaks depends on the font, the size and the width. But a Range
   * over a paragraph reports one client rect per line box, which is the
   * browser telling you exactly what it did.
   */
  const measureLines = useCallback(() => {
    const host = columnRef.current;
    const port = viewportRef.current;
    if (!host || !port || !prefs.lineFocus) {
      setLines([]);
      return;
    }
    const rects: Rect[] = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.textContent?.trim()) {
        const r = document.createRange();
        r.selectNodeContents(node);
        for (const rect of Array.from(r.getClientRects())) {
          rects.push({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom });
        }
      }
      node = walker.nextNode();
    }
    const view = port.getBoundingClientRect();
    const onPage = linesIn(rects, {
      left: view.left - 2,
      right: view.right + 2,
      top: view.top - 2,
      bottom: view.bottom + 2,
    });
    // Stored relative to the viewport, not the window. The overlay lives
    // inside it, and converting at draw time would mean reading the DOM
    // during render — which is both impure and wrong the moment anything
    // scrolls between the measurement and the paint.
    const local = onPage.map((l) => ({
      top: l.top - view.top,
      bottom: l.bottom - view.top,
      left: l.left - view.left,
      right: l.right - view.left,
    }));
    setLines(local);
    // A page you walked backwards into opens at its LAST line, for the same
    // reason a chapter you walked backwards into opens at its last page: that
    // is where you were standing.
    setLine(landOnLastLine.current ? Math.max(0, local.length - 1) : 0);
    landOnLastLine.current = false;
  }, [columnRef, viewportRef, prefs.lineFocus]);

  useEffect(() => {
    if (!prefs.lineFocus) {
      setLines([]);
      return;
    }
    // After the page has settled: a translate is animated, and measuring
    // mid-transition lights a line that is still sliding past.
    const t = setTimeout(measureLines, 300);
    return () => clearTimeout(t);
  }, [measureLines, prefs.lineFocus, page, pages, box.w, box.h, prefs.size, prefs.font]);

  const advance = useCallback(
    (delta: 1 | -1) => {
      const next = stepLine(line, delta, lines.length);
      if (next === null) {
        if (delta < 0) landOnLastLine.current = true;
        onTurn(delta);
        return;
      }
      setLine(next);
    },
    [line, lines.length, onTurn],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, turning: false };
  };

  /**
   * Swipe or select, decided while the finger is still moving.
   *
   * They are the same shape — a horizontal drag across a line of text — and a
   * browser resolves the ambiguity in favour of selecting, so a swipe arrives
   * with a paragraph highlighted and the page does not turn. Deciding at the
   * moment the gesture crosses the turn threshold, and clearing the selection
   * from then on, is what makes a page turn a page turn.
   *
   * On a phone this rarely fires at all: iOS does not select by dragging, it
   * selects after a press and hold, and it sends a pointercancel when it
   * takes the gesture over for that.
   */
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !prefs.paged) return;
    if (!d.turning && isTurning(e.clientX - d.x, e.clientY - d.y, box.w || 1)) {
      d.turning = true;
    }
    if (d.turning) document.getSelection()?.removeAllRanges();
  };

  const onPointerCancel = () => {
    // iOS taking the gesture over for its own selection handles.
    drag.current = null;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const from = drag.current;
    drag.current = null;
    if (!from) return;

    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    const turn = prefs.paged && from.turning ? turnFrom(dx, dy, box.w || 1) : "stay";
    if (turn !== "stay") {
      document.getSelection()?.removeAllRanges();
      return onTurn(turn === "next" ? 1 : -1);
    }
    // A selection owns the rest of the gesture: letting go of a highlight
    // must not also turn the page or move the line.
    if (!document.getSelection()?.isCollapsed) return;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;

    const rect = viewportRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);

    // In line mode a tap moves the line. ANY tap: that is the whole gesture,
    // and having to aim at the lit line would make reading a series of small
    // targets. The left sixth steps back, so losing your place costs one tap
    // rather than a re-read.
    if (prefs.lineFocus && lines.length > 0) {
      advance(tapAt(x, box.w) === "prev" ? -1 : 1);
      return;
    }
    // Otherwise it is iBooks' arrangement: the outer sixth turns a page, the
    // middle shows the bars.
    const where = tapAt(x, box.w);
    if (where === "next" && prefs.paged) onTurn(1);
    else if (where === "prev" && prefs.paged) onTurn(-1);
    else onChrome();
  };

  const lit = lines[line];

  return (
    <div
      className="relative flex-1 overflow-hidden"
      style={{
        paddingLeft: prefs.margin,
        paddingRight: prefs.margin,
        paddingTop: "max(58px, calc(env(safe-area-inset-top) + 46px))",
        paddingBottom: "max(58px, calc(env(safe-area-inset-bottom) + 46px))",
      }}
    >
      <div
        ref={viewportRef}
        className={cn("relative h-full", prefs.paged ? "overflow-hidden" : "overflow-y-auto")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // A page with selected text on it is a page the browser will happily
        // pick up and DRAG, and once a native drag starts the pointer events
        // stop: no pointerup, no page turn, and a reader that goes dead after
        // a few swipes with no error anywhere. Text in a book is for reading,
        // not for dragging into another window.
        onDragStart={(e) => e.preventDefault()}
        style={{ touchAction: prefs.paged ? "pan-y" : "auto" }}
      >
        {children}

        {/* Line focus lives INSIDE the viewport, so it is clipped with the
            page and needs no coordinate juggling: the page dims above and
            below the lit line, and the line itself keeps the paper's own
            mark colour. Two shades rather than a cut-out mask, which reads
            identically and costs one element instead of an SVG. */}
        {prefs.lineFocus && lit && (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{ height: Math.max(0, lit.top - 2), background: theme.bg, opacity: 0.8 }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{ top: lit.bottom + 2, background: theme.bg, opacity: 0.8 }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 rounded-[4px]"
              style={{ top: lit.top - 2, height: lit.bottom - lit.top + 4, background: theme.mark }}
            />
          </>
        )}
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
  book, prefs, pager, page, onReady, onError, onChrome, onPage,
}: RendererProps & { page: number; onPage: (n: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const doc = useRef<Awaited<ReturnType<typeof import("@/lib/pdf").openPdf>> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const theme = themeSpec(prefs.theme);

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
        setCount(opened.numPages);
        setReady(true);
        onReady(opened.numPages);
      } catch (err) {
        if (alive) onError(messageFor(err, "That PDF would not open."));
      }
    })();
    return () => {
      alive = false;
      // The loading task owns the worker, so this is what actually lets the
      // worker thread and the parsed document go.
      void doc.current?.loadingTask.destroy();
      doc.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  const draw = useCallback(async () => {
    const d = doc.current;
    const boxEl = host.current;
    if (!d || !boxEl) return;
    setDrawing(true);
    try {
      const { renderPage } = await import("@/lib/pdf");
      const width = Math.max(200, boxEl.clientWidth * zoom);
      // The canvas goes in BEFORE the ink does, so a page that is slow to
      // rasterise shows itself filling in rather than leaving the screen blank
      // until it is finished.
      const canvas = await renderPage(d, page, width, window.devicePixelRatio || 1, (c) =>
        boxEl.replaceChildren(c),
      );
      if (canvas.parentElement !== boxEl) boxEl.replaceChildren(canvas);
      boxEl.parentElement?.scrollTo({ top: 0 });
      setTrouble(null);
    } catch (err) {
      // A page that will not render is one page, not the book — but it says
      // so: a reader that silently shows nothing is a blank page.
      setTrouble(messageFor(err, "That page would not draw."));
    } finally {
      setDrawing(false);
    }
  }, [page, zoom]);

  useEffect(() => {
    if (ready) void draw();
  }, [ready, draw]);

  useEffect(() => {
    pager.current = {
      back: () => onPage(Math.max(1, page - 1)),
      forward: () => onPage(count ? Math.min(count, page + 1) : page + 1),
    };
  }, [pager, page, count, onPage]);

  return (
    <>
      <div className="relative flex-1 overflow-auto overscroll-contain" onClick={onChrome}>
        {/* Clear of both bars: the chrome fades rather than unmounting, so
            without this the top of every page opens underneath the title. */}
        <div
          ref={host}
          className="mx-auto w-full [&>canvas]:block"
          style={{
            paddingTop: "max(64px, calc(env(safe-area-inset-top) + 52px))",
            paddingBottom: "6rem",
          }}
        />
      </div>

      {trouble && (
        <p className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-xs leading-snug opacity-70">
          {trouble}
        </p>
      )}

      {/* Tap zones on the page itself. A phone held in one hand turns pages
          with the thumb already on the screen. Unlabelled and out of the tab
          order: they are a shortcut to the buttons in the bar below, and
          naming them would put two "Forward" controls on the screen. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => onPage(Math.max(1, page - 1))}
        className="absolute inset-y-[15%] left-0 w-[22%] opacity-0"
      />
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => onPage(count ? Math.min(count, page + 1) : page + 1)}
        className="absolute inset-y-[15%] right-0 w-[22%] opacity-0"
      />

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        <RoundButton theme={theme} label="Zoom in" small onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
          <Plus className="size-4" />
        </RoundButton>
        <RoundButton theme={theme} label="Zoom out" small onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
          <Minus className="size-4" />
        </RoundButton>
        {drawing && <Loader2 className="mx-auto size-4 animate-spin opacity-50" />}
      </div>
    </>
  );
}

/* ==========================================================================
   Chrome
   ========================================================================== */

function Bar({
  edge, theme, show, className, children,
}: {
  edge: "top" | "bottom";
  theme: ReturnType<typeof themeSpec>;
  show: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const fade = theme.dark ? "0,0,0" : "255,255,255";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 px-3 transition-opacity duration-200",
        edge === "top"
          ? "top-0 pb-6 pt-[max(12px,env(safe-area-inset-top))]"
          : "bottom-0 pt-8 pb-[max(12px,env(safe-area-inset-bottom))]",
        show ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{
        background:
          edge === "top"
            ? `linear-gradient(to bottom, rgba(${fade},0.92), rgba(${fade},0))`
            : `linear-gradient(to top, rgba(${fade},0.92), rgba(${fade},0))`,
      }}
    >
      {children}
    </div>
  );
}

function RoundButton({
  theme, label, onClick, small, disabled, children,
}: {
  theme: ReturnType<typeof themeSpec>;
  label: string;
  onClick: () => void;
  small?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pointer-events-auto grid shrink-0 place-items-center rounded-full backdrop-blur disabled:opacity-30",
        small ? "size-9" : "size-11",
      )}
      style={{ background: `${theme.fg}18`, color: theme.fg }}
    >
      {children}
    </button>
  );
}

/**
 * Type, spacing and paper.
 *
 * One sheet with everything in it, the way iBooks does — not a settings page
 * three taps away. Changing the size of the type is something you do WHILE
 * reading, in response to the light in the room, and a control you have to go
 * and find is a control you stop using.
 */
function PrefsSheet({
  prefs, onChange, onClose, epub,
}: {
  prefs: ReaderPrefs;
  onChange: (next: ReaderPrefs) => void;
  onClose: () => void;
  epub: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Type and theme"
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 text-fg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-base font-extrabold">Type and theme</div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <Stepper
          label="Size"
          value={`${prefs.size}px`}
          onLess={() => onChange(stepPref(prefs, "size", -1))}
          onMore={() => onChange(stepPref(prefs, "size", 1))}
          atMin={prefs.size <= SIZE.min}
          atMax={prefs.size >= SIZE.max}
        />
        <Stepper
          label="Line spacing"
          value={prefs.lineHeight.toFixed(1)}
          onLess={() => onChange(stepPref(prefs, "lineHeight", -1))}
          onMore={() => onChange(stepPref(prefs, "lineHeight", 1))}
          atMin={prefs.lineHeight <= LINE_HEIGHT.min}
          atMax={prefs.lineHeight >= LINE_HEIGHT.max}
        />
        <Stepper
          label="Margins"
          value={`${prefs.margin}px`}
          onLess={() => onChange(stepPref(prefs, "margin", -1))}
          onMore={() => onChange(stepPref(prefs, "margin", 1))}
          atMin={prefs.margin <= MARGIN.min}
          atMax={prefs.margin >= MARGIN.max}
        />

        <div className="mt-4 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
          Paper
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {READER_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ ...prefs, theme: t.id })}
              aria-pressed={prefs.theme === t.id}
              className={cn(
                "rounded-2xl border-2 px-2 py-3 text-center",
                prefs.theme === t.id ? "border-accent" : "border-border",
              )}
              style={{ background: t.bg, color: t.fg }}
            >
              <div className="font-display text-base font-extrabold">Aa</div>
              <div className="mt-0.5 text-[0.6rem] font-bold">{t.label}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
          Typeface
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {READER_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange({ ...prefs, font: f.id })}
              aria-pressed={prefs.font === f.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left",
                prefs.font === f.id ? "border-accent bg-accent/10" : "border-border bg-surface-2",
              )}
              style={{ fontFamily: f.stack }}
            >
              <span className="text-sm font-semibold">{f.label}</span>
              <span className="text-base">Aa</span>
            </button>
          ))}
        </div>

        {epub && (
          <>
            <div className="mt-4 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
              Turning
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Toggle
                on={prefs.paged}
                onClick={() => onChange({ ...prefs, paged: true })}
                title="Pages"
                note="Swipe to turn, like a book."
              />
              <Toggle
                on={!prefs.paged}
                onClick={() => onChange({ ...prefs, paged: false })}
                title="Scroll"
                note="One long chapter."
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => onChange({ ...prefs, lineFocus: !prefs.lineFocus })}
          aria-pressed={prefs.lineFocus}
          className={cn(
            "mt-3 flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left",
            prefs.lineFocus ? "border-accent bg-accent/10" : "border-border bg-surface-2",
          )}
        >
          <Rows3 className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-bold">Line by line</span>
            <span className="mt-0.5 block text-[0.68rem] leading-snug text-muted">
              Lights one line and dims the rest. Tap anywhere for the next line; tap the
              left edge to go back. Runs off the end of a page and turns it.
            </span>
          </span>
        </button>

        <p className="mt-3 text-[0.65rem] leading-snug text-faint">
          Highlight a word while you read and it goes straight into your words, with the
          sentence it came from. They are on the Reading tab, under the shelf.
        </p>
      </div>
    </div>
  );
}

function Stepper({
  label, value, onLess, onMore, atMin, atMax,
}: {
  label: string;
  value: string;
  onLess: () => void;
  onMore: () => void;
  atMin: boolean;
  atMax: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-center gap-2">
        <span className="tabular w-12 text-right text-xs text-muted">{value}</span>
        <Button size="icon" variant="ghost" onClick={onLess} disabled={atMin} aria-label={`${label} smaller`}>
          <Minus className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onMore} disabled={atMax} aria-label={`${label} bigger`}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  on, onClick, title, note,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-2xl border px-3 py-2.5 text-left",
        on ? "border-accent bg-accent/10" : "border-border bg-surface-2",
      )}
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-0.5 block text-[0.65rem] leading-snug text-muted">{note}</span>
    </button>
  );
}

function messageFor(err: unknown, fallback: string): string {
  const said = err instanceof Error ? err.message : "";
  return said && said.length < 160 ? said : fallback;
}
