import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ChevronLeft, ChevronRight, Languages, Loader2, Minus, Plus, Rows3, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getBookFile } from "@/lib/book-files";
import type { EpubArchive } from "@/lib/epub-archive";
import { cleanOffset, locate } from "@/lib/anchor";
import { nthIndexOf } from "@/lib/book-search";
import {
  addMark, cleanMarks, markAt, markColour, removeMark, rowsOf,
  type BookMark, type Row,
} from "@/lib/marks";
import { WordMenu, type Pick } from "@/components/WordMenu";
import {
  ContentsSheet, MarksSheet, PageScrubber, SearchSheet, TopPills,
} from "@/components/BookChrome";
import { LANGUAGES, defaultLanguage, isLanguage } from "@/lib/translate";
import {
  cornerPoint, foldAt, grabbedCorner, matrixCss, polygonCss, type Corner, type Fold,
  type Point,
} from "@/lib/curl";
import { linesIn, stepLine, type Rect } from "@/lib/lines";
import {
  PAGE_GAP, bookProgress, clampPage, damp, isTurning, pageCount, pageForX, pageOffset,
  tapAt, turnFrom,
} from "@/lib/paginate";
import {
  LINE_HEIGHT, MARGIN, READER_FONTS, READER_THEMES, SIZE, TURN_STYLES, cleanReader,
  fontStack, isPaged, step as stepPref, themeSpec, type ReaderPrefs,
} from "@/lib/reader-prefs";
import { getLocalDateKey } from "@/lib/soma";
import { useScrollLock } from "@/lib/use-sheet";
import { useReadingClock } from "@/lib/use-reading-clock";
import { useSoma } from "@/lib/store";
import { capture, cleanSelection, isSelectable } from "@/lib/word-capture";
import { caretAt, spanUnion, wordBounds } from "@/lib/pick-word";
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
  book, startAt, onClose, onChange,
}: {
  book: MindEntry;
  /**
   * Open here instead of where you left off — a highlight asking to be
   * visited. Read once, on the first render: this component is keyed on it,
   * so a different passage arrives as a different reader rather than as a
   * prop that changes under a book already open.
   */
  startAt?: { chapter: number; offset: number };
  onClose: () => void;
  onChange: (patch: Partial<MindEntry>) => void;
}) {
  // The page behind a book does not scroll. It is covered by the reader, and
  // a view underneath that still has somewhere to go puts a scrollbar down
  // the side of the page and takes any drag the reader has not claimed.
  useScrollLock();

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

  /**
   * The book counts its own minutes towards the reading goal.
   *
   * A book that is open on the screen knows when it was being read. Nothing
   * accrues while the file is still being opened or after it has failed to
   * open — staring at a spinner is not reading — and the total is said out
   * loud on the way back to the shelf, because a number that only ever
   * changes while you are looking away is a number nobody trusts.
   */
  const sawReading = useReadingClock(!loading && !error, (min) =>
    toast.success(`${min} min read`),
  );
  const [chrome, setChrome] = useState(true);
  const [showPrefs, setShowPrefs] = useState(false);
  /** True while a finger is scrubbing the page pill — the paper dims behind it. */
  const [scrubbing, setScrubbing] = useState(false);
  const storedLang = useSoma((s) => s.settings.translateTo);
  const readerLang = isLanguage(storedLang)
    ? storedLang
    : defaultLanguage(typeof navigator === "undefined" ? undefined : navigator.language);

  // Where we are, one-based, in pages for a PDF and chapters for an EPUB.
  // Where the book opens: the passage asked for, or where you left off.
  const [at, setAt] = useState(Math.max(1, startAt ? startAt.chapter + 1 : (book.page ?? 1)));
  const [total, setTotal] = useState(book.pages ?? 0);
  /** Page within the current chapter, and the text the rail draws small. */
  const [spread, setSpread] = useState<{
    page: number;
    pages: number;
    html: string;
    label: string;
    box: { w: number; h: number };
  }>({ page: 0, pages: 1, html: "", label: "", box: { w: 0, h: 0 } });
  /** The contents and the searchable book, published by the renderer. */
  const [index, setIndex] = useState<{ titles: string[]; textOf: (i: number) => string }>({
    titles: [],
    textOf: () => "",
  });
  const [panel, setPanel] = useState<"contents" | "search" | "kept" | null>(null);
  /**
   * The words you kept while reading this book.
   *
   * Matched on the source the word menu writes, which is the book's title.
   * Two books with the same title would share a list, and that is the right
   * trade against giving every word a book id it would have to keep in step
   * with a shelf entry that can be deleted and re-imported.
   */
  // Selected as the whole list and filtered here, NOT filtered inside the
  // selector. A selector that builds an array returns a new one every time it
  // is called, which to a subscription means "changed", which means render,
  // which means call the selector — an infinite loop, and the reader never
  // appears at all.
  const mind = useSoma((s) => s.mind);
  const kept = useMemo(
    () => mind.filter((m) => m.kind === "language" && m.source === book.title),
    [mind, book.title],
  );
  const [seek, setSeek] = useState<Seek | undefined>(undefined);
  const nonce = useRef(0);
  /** Send the reader somewhere, chapter and all. */
  const goTo = useCallback((next: Omit<Seek, "nonce">) => {
    nonce.current += 1;
    setAt(next.chapter + 1);
    setSeek({ ...next, nonce: nonce.current });
  }, []);
  /** Characters into the chapter — see lib/anchor.ts for why not a page. */
  const [offset, setOffset] = useState(startAt ? startAt.offset : book.readOffset);
  /** Which line was lit, for anyone reading line by line. */
  const [line, setLine] = useState(startAt ? undefined : book.readLine);

  // Written back on a debounce rather than per turn: one page turn is one
  // localStorage write of the entire diary, and a thumb held on the forward
  // button would do fifty of them.
  const saved = useRef({
    at: book.page ?? 0,
    total: book.pages ?? 0,
    offset: book.readOffset,
    line: book.readLine,
  });
  /**
   * The latest onChange, held in a ref rather than depended on.
   *
   * The shelf passes a fresh arrow function on every render, and a render is
   * caused by any change to the store — so with `onChange` in the deps below,
   * the effect tore down and restarted its timer over and over and the write
   * NEVER happened. The book saved its position once, on opening, and then
   * silently stopped: close it after twenty pages and it reopened at the
   * beginning, with nothing anywhere to say why.
   */
  const latestChange = useRef(onChange);
  const saveRef = useRef({ at, total, offset, line });
  useEffect(() => {
    latestChange.current = onChange;
    saveRef.current = { at, total, offset, line };
  });

  useEffect(() => {
    const now = { at, total, offset, line };
    if (
      saved.current.at === at && saved.current.total === total &&
      saved.current.offset === offset && saved.current.line === line
    ) {
      return;
    }
    const t = setTimeout(() => {
      saved.current = now;
      latestChange.current({
        page: at,
        pages: total || undefined,
        readOffset: offset,
        readLine: line,
      });
    }, 700);
    return () => clearTimeout(t);
  }, [at, total, offset, line]);

  /**
   * A page that changed is somebody reading, whatever moved it.
   *
   * The clock already watches for a pointer, which covers a swipe and a tap on
   * the arrows. This covers the rest — a keyboard turn, a jump from the
   * contents or a search result — and costs nothing when the page has not
   * moved, because a repeated sign of life only pushes the idle wall along.
   */
  useEffect(() => {
    sawReading();
  }, [at, spread.page, sawReading]);

  /**
   * And once more on the way out.
   *
   * A debounce plus a close is a race the close wins: shut the book within
   * 700ms of the last page turn and that turn was never written down. The
   * unmount is the last chance to say where you stopped.
   */
  useEffect(() => {
    return () => {
      const now = saveRef.current;
      if (
        saved.current.at === now.at && saved.current.offset === now.offset &&
        saved.current.line === now.line
      ) {
        return;
      }
      latestChange.current({
        page: now.at,
        pages: now.total || undefined,
        readOffset: now.offset,
        readLine: now.line,
      });
    };
  }, []);

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
      {/* The paper dims while the scrubber is being dragged, the way the
          native reader does — the pill floats over it, the page stays put. */}
      {scrubbing && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[65] bg-black/30" />
      )}
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
          onAnchor={setOffset}
          onLine={setLine}
          startLine={line}
          onMarks={(marks) => onChange({ marks })}
          onIndex={setIndex}
          seek={seek}
        />
      ) : (
        <PdfPages {...common} pager={pager} page={at} onPage={setAt} />
      )}

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-7 animate-spin opacity-50" />
        </div>
      )}

      {/* Two pills at the top and one bar at the bottom. They fade rather
          than unmounting, so the page does not reflow every time you tap it
          and lose your place mid-paragraph.

          The book's title is not up here any more. Five things are, and every
          one of them is something you came to the top of the screen to DO —
          the title is something you already know, and it was taking the room
          they needed. It is on the shelf, and the chapter is at the bottom. */}
      <TopPills
        theme={theme}
        show={chrome}
        onBack={onClose}
        onContents={() => setPanel("contents")}
        onType={() => setShowPrefs(true)}
        onSearch={() => setPanel("search")}
        onKept={() => setPanel("kept")}
      />

      {/* One line of type, one bar of controls, and nothing else.
          The scrubber used to sit in a band of its own above all this, which
          made the foot of the page four rows deep and the thumbnails far
          bigger than anything you would thumb through. It belongs IN the row
          it steers: between the two arrows, the same height as them, so the
          whole of the bottom is one bar. Where it used to be — a line of its
          own — now carries the counter, which is the thing you actually read.
      */}
      <Bar edge="bottom" theme={theme} show={chrome}>
        <div
          className="tabular mb-2 text-center text-[0.68rem] font-bold"
          style={{ color: theme.faint }}
        >
          {epub
            ? `Chapter ${at} of ${total || "?"} · ${spread.page + 1}/${spread.pages}`
            : `Page ${at} of ${total || "?"}`}
        </div>
        <div
          className="mb-2 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: `${theme.fg}22` }}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%`, background: `${theme.fg}99` }}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <RoundButton theme={theme} label="Back" onClick={back}>
            <ChevronLeft className="size-5" />
          </RoundButton>
          {/* Only for an EPUB: a PDF's pages are already pictures, and
              scrubbing them means rendering every one. */}
          {epub && chrome && spread.box.w > 0 ? (
            <PageScrubber
              theme={theme}
              prefs={prefs}
              html={spread.html}
              label={spread.label}
              box={spread.box}
              pages={spread.pages}
              page={spread.page}
              onPick={(n) => pager.current?.to(n)}
              onScrub={setScrubbing}
            />
          ) : (
            <div className="flex-1" />
          )}
          <RoundButton theme={theme} label="Forward" onClick={forward}>
            <ChevronRight className="size-5" />
          </RoundButton>
        </div>
      </Bar>

      {panel === "contents" && (
        <ContentsSheet
          theme={theme}
          titles={index.titles}
          current={at - 1}
          onPick={(i) => goTo({ chapter: i })}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === "search" && (
        <SearchSheet
          theme={theme}
          chapters={total || index.titles.length}
          titles={index.titles}
          textOf={index.textOf}
          onPick={(hit, rank) => goTo({ chapter: hit.chapter, phrase: hit.hit, rank })}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === "kept" && (
        <MarksSheet
          theme={theme}
          marks={cleanMarks(book.marks)}
          words={kept}
          titles={index.titles}
          onPickMark={(m) => goTo({ chapter: m.chapter, offset: m.start, end: m.end })}
          onDropMark={(id) => onChange({ marks: removeMark(cleanMarks(book.marks), id) })}
          onClose={() => setPanel(null)}
        />
      )}

      {showPrefs && (
        <PrefsSheet
          prefs={prefs}
          onChange={setPrefs}
          onClose={() => setShowPrefs(false)}
          epub={epub}
          translateTo={readerLang}
          onLanguage={(code) => patchSettings({ translateTo: code })}
        />
      )}
    </div>
  );
}

/** What a renderer promises the chrome it can do. */
interface Pager {
  back: () => void;
  forward: () => void;
  /** Jump to a page of the chapter on screen. The rail's whole purpose. */
  to: (page: number) => void;
}

/**
 * Somewhere the reader has been asked to go.
 *
 * Declarative rather than a method call, because the destination is only
 * reachable once the chapter it is in has been laid out — and that is two
 * renders and a couple of frames after the chapter is chosen. A prop that
 * says "you are wanted here" can wait for the layout; a function call made
 * the moment a search result is tapped cannot.
 *
 * `phrase` + `rank` rather than a character offset: the nth occurrence of a
 * word in the plain text is the nth in the laid-out chapter, which is a far
 * steadier thing to rely on than two independently counted offsets agreeing.
 */
interface Seek {
  chapter: number;
  phrase?: string;
  rank?: number;
  offset?: number;
  end?: number;
  /** Changes on every request, so asking for the same place twice works. */
  nonce: number;
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

/**
 * Every run of text in the laid-out chapter, in reading order.
 *
 * The bridge between "a place in the text" and "a place on the screen". A
 * Range over one of these reports where the browser actually put it, which is
 * the only authority on which page a sentence ended up on.
 */
function textRuns(host: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent) out.push(node as Text);
    node = walker.nextNode();
  }
  return out;
}

/**
 * How many characters into the chapter a point in the text is.
 *
 * The same counting the reading anchor uses, and it has to be: a highlight and
 * a bookmark are both "this many characters in", and if the two disagreed by a
 * space the highlight would land on the wrong word after a re-import.
 */
function charOffset(host: HTMLElement, node: Node, offset: number): number {
  const runs = textRuns(host);
  let acc = 0;
  for (const run of runs) {
    if (run === node) return acc + Math.max(0, Math.min(offset, run.length));
    acc += run.length;
  }
  return acc;
}

/** The characters back into a Range, so the browser can be asked where they are. */
function rangeOf(host: HTMLElement, start: number, end: number): Range | null {
  const runs = textRuns(host);
  if (!runs.length || end <= start) return null;
  const lens = runs.map((r) => r.length);
  const a = locate(lens, start);
  const b = locate(lens, Math.max(start, end - 1));
  const from = runs[a.index];
  const to = runs[b.index];
  if (!from || !to) return null;
  const range = document.createRange();
  try {
    range.setStart(from, Math.min(a.into, from.length));
    range.setEnd(to, Math.min(b.into + 1, to.length));
  } catch {
    return null;
  }
  return range;
}

/**
 * Where a highlight's ink goes, in the strip's own coordinates.
 *
 * Strip coordinates rather than screen ones, because the same numbers then
 * serve every copy of the chapter the fold keeps: the page you are reading and
 * the two spares either side all lay the text out identically and differ only
 * by how far they are translated. Measure once, draw four times, and a
 * highlight is on the next page before you have finished turning to it.
 */
function markRows(host: HTMLElement, mark: BookMark): Row[] {
  const range = rangeOf(host, mark.start, mark.end);
  if (!range) return [];
  const origin = host.getBoundingClientRect();
  const rects: Row[] = [];
  for (const r of Array.from(range.getClientRects())) {
    rects.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  }
  // A shade taller than the letters, which is what a highlighter does — the
  // ink runs past the x-height rather than stopping at it.
  return rowsOf(rects, 1.5);
}

/** Where a run sits along the laid-out strip, ignoring the current translate. */
function xOf(range: Range, stripLeft: number): number | null {
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return rect.left - stripLeft;
}

/**
 * The character offset of the first text on a page.
 *
 * What gets written down when you stop reading. Taken from the FIRST run that
 * the browser put on this page or later, because that is the first thing your
 * eye lands on when the page comes up.
 */
function offsetOfPage(host: HTMLElement, stripLeft: number, page: number, w: number): number {
  const runs = textRuns(host);
  const range = document.createRange();
  let acc = 0;
  for (const run of runs) {
    const len = run.length;
    if (len > 0) {
      range.selectNodeContents(run);
      const x = xOf(range, stripLeft);
      if (x !== null && pageForX(x, w, PAGE_GAP) >= page) return acc;
    }
    acc += len;
  }
  return acc;
}

/**
 * Which page an offset ended up on, once the chapter has been laid out.
 *
 * Measured one character at a time rather than by the run: a paragraph can
 * span a page break, so asking where the paragraph starts would send you back
 * to the page before the one you were on.
 */
function pageOfOffset(host: HTMLElement, stripLeft: number, offset: number, w: number): number {
  const runs = textRuns(host);
  if (runs.length === 0) return 0;
  const spot = locate(runs.map((r) => r.length), offset);
  const range = document.createRange();
  for (let i = spot.index; i < runs.length; i++) {
    const run = runs[i]!;
    const from = i === spot.index ? Math.min(spot.into, Math.max(0, run.length - 1)) : 0;
    if (run.length === 0) continue;
    range.setStart(run, from);
    range.setEnd(run, Math.min(run.length, from + 1));
    const x = xOf(range, stripLeft);
    if (x !== null) return pageForX(x, w, PAGE_GAP);
  }
  return 0;
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
  book, prefs, pager, chapter, onReady, onError, onChrome, onChapter, onSpread, onAnchor,
  onLine, startLine, onMarks, onIndex, seek,
}: RendererProps & {
  chapter: number;
  onChapter: (index: number) => void;
  /**
   * What the page rail needs to draw the chapter small: the text itself, the
   * box it is set in, and where you are in it.
   */
  onSpread: (s: {
    page: number;
    pages: number;
    html: string;
    label: string;
    box: { w: number; h: number };
  }) => void;
  /** The book's contents and its searchable text, once it is open. */
  onIndex: (ix: { titles: string[]; textOf: (i: number) => string }) => void;
  seek?: Seek;
  /** Characters into the chapter, written down so the book reopens here. */
  onAnchor: (offset: number) => void;
  onLine: (index: number) => void;
  startLine?: number;
  onMarks: (marks: BookMark[]) => void;
}) {
  const archive = useRef<EpubArchive | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [label, setLabel] = useState("");
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  /** The found phrase, lit until you turn away from it. Never stored. */
  const [found, setFound] = useState<{ start: number; end: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [chapters, setChapters] = useState(0);
  /** Set when a chapter is entered backwards, so it opens on its last page. */
  const landOnLast = useRef(false);
  const paged = isPaged(prefs);

  /**
   * The highlights, and where their ink lands.
   *
   * Measured once per layout rather than once per page, in the strip's own
   * coordinates, because every copy of the chapter the fold keeps lays the
   * text out identically and differs only by how far it is translated. One
   * measurement serves the page you are reading and both spares — which is
   * what puts a highlight on the next page before you have finished turning
   * to it, instead of after.
   */
  const marks = useMemo(() => cleanMarks(book.marks), [book.marks]);
  const mine = useMemo(() => {
    const own = marks.filter((m) => m.chapter === chapter);
    // A search hit is drawn by exactly the same machinery as a highlight, and
    // is simply never written down. It is the page's answer to "here".
    return found
      ? [...own, { id: "found", chapter, start: found.start, end: found.end, colour: "sky", text: "" }]
      : own;
  }, [marks, chapter, found]);
  const [ink, setInk] = useState<Ink[]>([]);

  const addHighlight = useCallback(
    (span: { start: number; end: number; colour: string; text: string }) => {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      // Dated, so the list of highlights outside the book can answer "what
      // have I been marking lately" and not only "what is in this book".
      onMarks(addMark(marks, { id, chapter, at: Date.now(), ...span }));
    },
    [marks, chapter, onMarks],
  );
  const dropHighlight = useCallback(
    (id: string) => onMarks(removeMark(marks, id)),
    [marks, onMarks],
  );

  /**
   * Where you are, in characters into this chapter.
   *
   * The source of truth for the page, not the other way round. Every relayout
   * — a font change, a rotation, a margin nudge — recomputes the page FROM
   * this, which is what keeps your place when the type gets bigger instead of
   * leaving you a page or two adrift.
   */
  const anchor = useRef<number | null>(cleanOffset(book.readOffset) ?? null);
  /** Live finger travel during a turn, in px. Drives the slide. */
  const [dragX, setDragX] = useState<number | null>(null);
  /**
   * Where the fold is, while a page is being folded.
   *
   * `corner` is where the held corner STARTED on the flat page, `at` is where
   * it has been dragged to. Going forward the corner leaves its home and the
   * page folds; going back it is on its way home and the page unfolds — which
   * is why both directions use a corner on the RIGHT, and why there is one
   * piece of geometry rather than two.
   */
  /**
   * Which way a page is being folded, and about which corner.
   *
   * Direction and corner only — NOT where the finger is. That changes sixty
   * times a second, and holding it in state meant a React render, of three
   * copies of a chapter, on every frame of every turn. The frames were going
   * to reconciling a tree that had not changed.
   *
   * So this is set once when a fold starts and cleared when it ends, and
   * every frame in between is written straight onto the four elements that
   * actually move — see paintFold.
   */
  /**
   * The fold in flight: which corner, which way, and off which page.
   *
   * `from` is the page the fold was STARTED on, and it is carried here rather
   * than read live because the page changes one frame before the fold is let
   * go of. Without it the back of the flap re-renders on that frame — an
   * eleven-thousand pixel strip, restyled, while it is hidden and nobody can
   * see it — which is exactly the frame that must be free.
   */
  const [curl, setCurl] = useState<{ corner: Corner; forward: boolean; from: number } | null>(
    null,
  );
  const curling = useRef<number | null>(null);
  /** Where the held corner is right now. Read by the settle, never rendered. */
  const foldAt_ = useRef<Point>({ x: 0, y: 0 });

  /** The surfaces a fold moves. Written to directly, never through React. */
  const flatWrap = useRef<HTMLDivElement>(null);
  const nextSheet = useRef<HTMLDivElement>(null);
  const prevSheet = useRef<HTMLDivElement>(null);
  const flapOuter = useRef<HTMLDivElement>(null);
  const flapClip = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
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
        // The contents and the searchable book, handed to the chrome. The
        // titles are read now because they are cheap and wanted the moment a
        // finger reaches the top-left; the text is a function because it is
        // neither, and nothing should read a hundred chapters to open one.
        onIndex({ titles: opened.titles(), textOf: (i) => opened.plain(i) });
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
  const opened = useRef(chapter);
  useEffect(() => {
    if (!ready) return;
    const part = archive.current?.chapter(chapter);
    // A stored offset belongs to ONE chapter — the one that was open when it
    // was written. Turning the page into a different chapter makes it
    // meaningless, so it is dropped and the new chapter opens at its start
    // (or its end, if that is the way you came in).
    if (chapter !== opened.current) {
      anchor.current = null;
      opened.current = chapter;
    }
    setHtml(part?.html ?? "");
    setLabel(part?.title ?? "");
  }, [ready, chapter]);

  // The page box. Measured rather than assumed, because it is the viewport
  // minus the margins and minus whatever the safe area is on this phone.
  //
  // While the keyboard is up (`soma-kb`, published by useKeyboardInset) the
  // browser reports a shrunken viewport, and measuring it would repaginate the
  // book under the reader's own search sheet — the page would jump with every
  // keystroke. The height is frozen at its last keyboard-free value until the
  // keys are gone, and the next real resize re-measures.
  const fullH = useRef(0);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const kbUp =
        typeof document !== "undefined" && document.documentElement.classList.contains("soma-kb");
      if (!kbUp && r.height > 0) fullH.current = r.height;
      setBox({
        w: Math.round(r.width),
        h: Math.round(kbUp && fullH.current > 0 ? fullH.current : r.height),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Draw the flap once, invisibly, as soon as the chapter has a layout.
   *
   * A layer that has never been painted has to be painted the first time it
   * is shown, and for the flap that means rastering a page of text — which
   * landed on the FIRST frame of every turn, the one frame a gesture cannot
   * afford to drop. So it is painted here instead, at an opacity nobody can
   * see, while nothing is moving and a lost frame costs nothing.
   */
  const warmFlap = useCallback(() => {
    const outer = flapOuter.current;
    const clip = flapClip.current;
    const b = boxRef.current;
    if (!outer || !clip || !b.w) return;
    outer.style.visibility = "visible";
    outer.style.opacity = "0.01";
    outer.style.transform = "none";
    clip.style.clipPath = `polygon(0px 0px, ${b.w}px 0px, ${b.w}px ${b.h}px, 0px ${b.h}px)`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        outer.style.visibility = "hidden";
        outer.style.opacity = "1";
      }),
    );
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

        warmFlap();
        if (last) {
          setPage(count - 1);
          return;
        }
        // The anchor decides, when there is one. `stripLeft` is the strip's
        // own left edge INCLUDING whatever it is currently translated by, so
        // subtracting it gives untranslated coordinates whatever page we are
        // sitting on at the moment of measuring.
        const want = anchor.current;
        if (want !== null) {
          const stripLeft = el.getBoundingClientRect().left;
          setPage(clampPage(pageOfOffset(el, stripLeft, want, box.w), count));
          return;
        }
        setPage((cur) => clampPage(cur, count));
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
    };
  }, [html, box.w, box.h, prefs.size, prefs.lineHeight, prefs.font, paged, prefs.margin, warmFlap]);

  /**
   * Ask the browser where the highlighted characters ended up.
   *
   * After the same double rAF as the page count and for the same reason: the
   * column's layout is not final until the browser has done a pass with the
   * new metrics, and a Range measured before that reports the last size's
   * line boxes — which would put the ink a line above the words.
   */
  useEffect(() => {
    const el = column.current;
    if (!el || !box.w || !mine.length) {
      setInk([]);
      return;
    }
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        const out: Ink[] = [];
        for (const m of mine) {
          const colour = markColour(m.colour, theme.dark);
          for (const r of markRows(el, m)) {
            out.push({ ...r, id: `${m.id}:${Math.round(r.x)}:${Math.round(r.y)}`, colour });
          }
        }
        setInk(out);
      });
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [mine, html, box.w, box.h, prefs.size, prefs.lineHeight, prefs.font, prefs.margin, paged, theme.dark]);

  /**
   * Go where the chrome asked, once the chapter it asked for is on screen.
   *
   * Two things have to have happened first: the chapter has to be the one
   * wanted, and it has to have been laid out — `pages` is the signal for
   * that, since it is set by the measuring pass. Waiting on both is why this
   * is a prop and an effect rather than a method somebody calls.
   */
  useEffect(() => {
    if (!seek || seek.chapter !== chapter) return;
    const el = column.current;
    if (!el || !box.w || !pages) return;
    const id = requestAnimationFrame(() => {
      const runs = textRuns(el);
      const whole = runs.map((r) => r.textContent ?? "").join("");
      let start = seek.offset ?? -1;
      let end = seek.end ?? -1;
      if (seek.phrase) {
        const at = nthIndexOf(whole, seek.phrase, seek.rank ?? 0);
        if (at >= 0) {
          start = at;
          end = at + seek.phrase.length;
        }
      }
      if (start < 0) return;
      const stripLeft = el.getBoundingClientRect().left;
      anchor.current = start;
      setPage(clampPage(pageOfOffset(el, stripLeft, start, box.w), pages));
      setFound(end > start ? { start, end } : null);
    });
    return () => cancelAnimationFrame(id);
  }, [seek, chapter, pages, box.w, html]);

  // What you were looking for stops being lit once you have read past it.
  useEffect(() => {
    if (!found) return;
    const t = setTimeout(() => setFound(null), 6000);
    return () => clearTimeout(t);
  }, [found]);

  /**
   * Write down where you are, once the page has settled.
   *
   * After the turn, not during it: measuring mid-animation reads the page
   * sliding past rather than the one you landed on. Reported up so the shelf
   * entry carries it, which is what makes closing the book and coming back
   * tomorrow land on this sentence.
   */
  useEffect(() => {
    const el = column.current;
    if (!el || !box.w || !pages) return;
    const t = setTimeout(() => {
      const stripLeft = el.getBoundingClientRect().left;
      const at = offsetOfPage(el, stripLeft, page, box.w);
      anchor.current = at;
      onAnchor(at);
    }, 340);
    return () => clearTimeout(t);
  }, [page, pages, box.w, onAnchor]);

  useEffect(() => {
    onSpread({ page, pages, html, label, box });
  }, [page, pages, html, label, box, onSpread]);

  /** Where the strip sits right now: the settled page, plus the finger. */
  const slide = -pageOffset(page, box.w) + (dragX ?? 0);

  /** The chapter, as one object that only changes when the chapter does. */
  const markup = useMemo(() => ({ __html: html }), [html]);

  /**
   * Can this turn be folded, or does it have to slide?
   *
   * Only within a chapter. A fold shows the page underneath, and the page
   * underneath a chapter's last one is in markup that is not loaded — so at a
   * chapter boundary the reader slides instead. It happens once per chapter
   * and is a great deal less work than keeping two chapters laid out at all
   * times for the sake of one page turn in forty.
   */
  const canFold = useCallback(
    (forward: boolean) => prefs.turn === "curl" && (forward ? page < pages - 1 : page > 0),
    [prefs.turn, page, pages],
  );

  const curlRef = useRef(curl);
  useEffect(() => {
    curlRef.current = curl;
  });

  const boxRef = useRef(box);
  useEffect(() => {
    boxRef.current = box;
  });

  /**
   * The page before and the page after, both painted, both ready.
   *
   * There used to be ONE spare copy pointed at whichever neighbour the fold
   * needed. Going forward that was already right, because it had been sitting
   * on the next page all along; going BACK it had to be moved to the previous
   * page and a fresh page of text rastered — at the instant the finger
   * started to move. That is why turning back was the slow direction.
   *
   * Two spares cost one more layout when a chapter opens, and nothing at all
   * when a page turns, which is the trade worth making: a chapter opens once
   * and its pages turn forty times.
   *
   * Which pages they hold is derived, not scheduled. It used to be state
   * updated a frame after a turn, on the theory that the spares should not be
   * repainted on the frame the page changes — and that made them WRONG for a
   * frame or two after every turn. Swipe twice in quick succession and the
   * second fold opened onto the page you had just left, which then swapped
   * for the right one when the turn finished.
   *
   * There is nothing to spread out any more: repointing a spare is a
   * transform, and since the chapter stopped being re-parsed on every render
   * that costs a composite rather than a layout. So they simply follow the
   * page — except while a fold is up, where they are pinned to the page the
   * fold STARTED from. The page underneath changes one frame before the fold
   * is let go of, and following it there would swap the revealed text while
   * the reader is looking straight at it.
   */
  const held = curl ? curl.from : page;
  const neighbours = { next: held + 1, prev: held - 1 };

  /**
   * One frame of the fold, straight onto the DOM.
   *
   * No state, no render, no reconciliation: four style writes and the browser
   * does the rest. Every element it touches is already mounted and already
   * laid out, so nothing here can cost a layout — only the repaint of a
   * page-sized area, which is what a page turn is.
   */
  const paintFold = useCallback(
    (at: Point, c: { corner: Corner; forward: boolean }): Fold | null => {
      const b = boxRef.current;
      const f = foldAt(at, b, c.corner);
      if (!f) return null;
      foldAt_.current = at;
      const flat = polygonCss(f.flat);
      // Going forward the real column is the page being folded; going back it
      // is the page underneath, and the incoming copy is the one clipped.
      if (c.forward) {
        if (flatWrap.current) flatWrap.current.style.clipPath = flat;
      } else if (prevSheet.current) {
        prevSheet.current.style.clipPath = flat;
      }
      if (flapOuter.current) flapOuter.current.style.transform = matrixCss(f.matrix);
      if (flapClip.current) flapClip.current.style.clipPath = polygonCss(f.flap);
      if (sheen.current) sheen.current.style.setProperty("--crease", `${f.angle + 90}deg`);
      return f;
    },
    [],
  );

  /**
   * Bring the flap in or out, and say which spare the fold is uncovering.
   *
   * Both spares are opaque and both sit under the page you are reading, so
   * only their order decides which one a fold reveals — and left at the same
   * z-index, order means DOM order, which put the PREVIOUS page on top. So
   * turning forward peeled the page back to reveal the page before it, and
   * the text only became the next page when the turn finished and the real
   * column moved. That is the swap at the end of a curl: not a page arriving
   * late, a page that was never the right one.
   *
   * Going back, the page arriving lies OVER the one you are on, so it goes
   * above the column; going forward, the page revealed lies under it, so it
   * goes above the other spare and below the column — which is clipped to the
   * unfolded part, and so lets it through exactly where the paper has lifted.
   */
  const showFold = useCallback((on: boolean, forward: boolean) => {
    if (flapOuter.current) flapOuter.current.style.visibility = on ? "visible" : "hidden";
    if (nextSheet.current) nextSheet.current.style.zIndex = on && forward ? "1" : "0";
    if (prevSheet.current) {
      prevSheet.current.style.zIndex = on && !forward ? "2" : "0";
      if (!on || forward) prevSheet.current.style.clipPath = "";
    }
    if (!on && flatWrap.current) flatWrap.current.style.clipPath = "";
  }, []);

  /**
   * Let go of the page and it finishes the turn, or falls back flat.
   *
   * A hand-run animation rather than a CSS transition, because what is being
   * animated is a clip polygon whose VERTEX COUNT changes as the crease
   * crosses a corner of the page — three points, then four, then five. There
   * is no interpolation a browser can do between those, so the frames are
   * computed here and the browser is handed a finished shape each time.
   */
  const settleCurl = useCallback(
    (commit: boolean) => {
      const c = curlRef.current;
      if (!c) return;
      const b = boxRef.current;
      const home = cornerPoint(c.corner, b);
      const from = foldAt_.current;
      // Where the corner is going, and the y matters as much as the x.
      //
      // It used to settle along the row the finger happened to be on, and
      // that meant the crease finished TILTED — so it never actually left the
      // page. Measured on a 353x736 page released halfway up: a completed
      // forward turn still had seventeen per cent of the page lying flat,
      // still showing the page you were leaving, and a completed backward
      // turn had the arriving page covering only ninety-one per cent of the
      // screen. The animation ran out with the fold still on, and the last
      // sixth of the turn happened in one step when the fold was taken away.
      // That is the cut at the end of a curl.
      //
      // Both ends now run to the corner's own row, where the crease is
      // square to the page: carried past the far edge it leaves the page
      // altogether, and brought home it shrinks to nothing against the
      // corner. Either way the last frame of the animation is the first
      // frame of the settled page, and there is nothing left to take away.
      //
      // The extra fifth of a width is what puts the crease properly OFF the
      // edge rather than exactly on it, so nothing of the old page survives
      // as a hairline.
      const away = { x: home.x - 2.2 * b.w, y: home.y };
      // A hair short of the corner: at the corner exactly, the crease is the
      // bisector of a point and itself, which is not a line, and the frame
      // would paint nothing and leave the one before it on screen.
      const landed = { x: home.x, y: home.y - Math.sign(home.y || -1) * 0.5 };
      const done = c.forward ? away : landed;
      const back = c.forward ? landed : away;
      const to = commit ? done : back;
      const began = performance.now();
      const run = (now: number) => {
        const k = Math.min(1, (now - began) / 300);
        // Ease out: a page you let go of carries on and stops.
        const e = 1 - (1 - k) ** 3;
        paintFold({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }, c);
        if (k < 1) {
          curling.current = requestAnimationFrame(run);
          return;
        }
        // Ending the turn takes two frames, and the order is the whole point.
        //
        // The strip carries a 320ms slide, which is switched off whenever a
        // fold is in progress. Hiding the flap, changing the page and
        // clearing the fold all at once meant React rendered one frame with
        // the new page AND no fold — so the slide was live, and the strip
        // ANIMATED to the page the curl had just finished showing you. That
        // is the slide you can still see at the end of a turn, and it is
        // wrong twice over: the page had already arrived, and it arrives
        // again.
        //
        // So: one frame in which the strip moves with the fold still
        // nominally on and no transition, and nobody sees it happen. Then the
        // fold is cleared, by which time the transform is where it is staying
        // and there is nothing left to animate.
        //
        // flushSync is what makes that an ORDER rather than a hope. Left to
        // itself React schedules the page change and commits it whenever it
        // next gets the main thread — which, on a frame that has just
        // finished animating a fold, can be after the frame below has already
        // cleared the fold. Both updates then land in one render, the
        // transition is live for it, and the strip slides. Forcing the commit
        // here means the paint with the new page and no transition has
        // happened before the next frame is even scheduled.
        curling.current = requestAnimationFrame(() => {
          showFold(false, c.forward);
          if (commit) flushSync(() => goRef.current(c.forward ? 1 : -1));
          curling.current = requestAnimationFrame(() => {
            curlRef.current = null;
            setCurl(null);
          });
        });
      };
      curling.current = requestAnimationFrame(run);
    },
    [paintFold, showFold],
  );

  useEffect(() => () => {
    if (curling.current !== null) cancelAnimationFrame(curling.current);
  }, []);

  /**
   * One gesture, two possible animations.
   *
   * The curl wants where the finger IS, because the crease runs through it;
   * the slide only wants how far it has come. Both arrive here, and which one
   * is driven is decided by the setting and by whether there is a page under
   * this one to fold away from.
   */
  const onDrag = useCallback(
    (at: { dx: number; dy: number; x: number; y: number } | null, flick = 0): boolean => {
      if (at === null) {
        setDragX(null);
        const c = curlRef.current;
        if (!c) return false;
        const f = foldAt(foldAt_.current, boxRef.current, c.corner);
        const p = f?.progress ?? 0;
        // A flick finishes the turn however far it got.
        //
        // Distance alone is how this decided before, and it made the fold
        // feel dead: a page would only go if it had been carried nearly half
        // the screen, so a quick push — which is how anyone actually turns a
        // page — bent the corner and let it fall back. Paper does not work
        // like that. Push it hard enough and it goes, wherever you let go.
        //
        // Half a pixel a millisecond is around five hundred a second, which
        // is well above a deliberate slow drag and well below any flick.
        // Below that it is distance again: forward, past the halfway fold and
        // it goes; backward, the page has to have come most of the way home
        // before it stays home.
        settleCurl(
          Math.abs(flick) >= FLICK
            ? c.forward === flick < 0
            : c.forward
              ? p >= 0.45
              : p <= 0.55,
        );
        // Answered rather than left to the caller to work out. The surface
        // has to know, on THIS event, whether the fold has the gesture — and
        // the only other way it could tell was a React prop, which lags the
        // fold by a render. On a quick swipe that render had not happened
        // yet, so the surface turned the page as well: the fold finished the
        // turn and the strip then SLID to the same page behind it. Two page
        // turns for one flick, one of them animated over the other.
        return true;
      }
      const forward = at.dx < 0;
      if (!canFold(forward)) {
        if (curlRef.current) {
          showFold(false, curlRef.current.forward);
          curlRef.current = null;
          setCurl(null);
        }
        setDragX(at.dx);
        return false;
      }
      setDragX(null);
      const corner = grabbedCorner({ x: at.x, y: at.y }, box, true);
      const home = cornerPoint(corner, box);
      // Doubled, so half a screen of drag carries the corner the whole width
      // of the page and finishes the turn. Undoubled, a page took two screens
      // to turn and nobody would ever have seen the far side of one.
      const travel = at.dx * 2;
      // The diagonal eases in with the drag. Mapping the crease straight onto
      // the finger's y means the page arrives already bent at the instant of
      // touch-down, which reads as a glitch rather than as paper.
      const lean = Math.min(1, Math.abs(at.dx) / 70);
      let took = false;
      const open = curlRef.current;
      if (!open || open.corner !== corner || open.forward !== forward) {
        const next = { corner, forward, from: page };
        // The ref leads the state by a render on purpose: the paint below has
        // to land on THIS frame, the one the finger moved on, and cannot wait
        // for React to get round to it.
        curlRef.current = next;
        setCurl(next);
        showFold(true, forward);
        took = true;
      }
      paintFold(
        {
          x: home.x + travel - (forward ? 0 : 2 * box.w),
          y: home.y + (at.y - home.y) * lean,
        },
        curlRef.current ?? { corner, forward, from: page },
      );
      return took || curlRef.current !== null;
    },
    [canFold, box, page, paintFold, settleCurl, showFold],
  );

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

  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  // Published for the chrome's own buttons and the keyboard. In an effect
  // rather than during render: a ref written while rendering is a side effect
  // in a function that is allowed to run twice.
  useEffect(() => {
    pager.current = {
      back: () => go(-1),
      forward: () => go(1),
      to: (n) => setPage(clampPage(n, pages)),
    };
  }, [pager, go, pages]);

  return (
    <ReadingSurface
      book={book}
      prefs={prefs}
      viewportRef={viewport}
      columnRef={column}
      box={box}
      onTurn={go}
      onChrome={onChrome}
      onDrag={onDrag}
      onLine={onLine}
      startLine={startLine}
      page={page}
      pages={pages}
      atStart={chapter === 0}
      atEnd={chapter >= chapters - 1}
      // Only the SLIDE wants edge markers. Left on for the curl they were
      // mounted and unmounted — twenty-seven elements for a long chapter — at
      // both ends of every single turn, which is a good deal of work to do
      // twice for something that is never drawn.
      edges={prefs.turn === "slide" && !curl ? pages - 1 : 0}
      slide={slide}
      turning={dragX !== null}
      folding={!!curl}
      chapter={chapter}
      marks={mine}
      onMark={addHighlight}
      onUnmark={dropHighlight}
    >
      {/* The other page: the one revealed underneath going forward, and the
          one arriving over the top going back. Mounted for as long as curling
          is the chosen style rather than only while a page is in the air —
          laying out a twenty-eight page chapter twice more is real work, and
          the one moment it must not happen is the instant a finger starts to
          move. Hidden costs layout and not paint, which is the trade wanted.

          Nothing below reads the fold: every part of it that changes during a
          turn is written onto these elements by paintFold, sixty times a
          second, without React hearing about it. */}
      {paged && prefs.turn === "curl" && (
        <>
          {/* Visible at all times, and never seen: both sit UNDER the page
              you are reading, which is opaque. Hiding them would have been
              tidier and cost a full raster of a page of text on the first
              frame of every turn — the one frame a gesture cannot afford. */}
          <Sheet
            innerRef={nextSheet}
            html={html}
            label={label}
            prefs={prefs}
            box={box}
            page={neighbours.next}
            style={UNDER_SHEET}
            ink={ink}
          />
          <Sheet
            innerRef={prevSheet}
            html={html}
            label={label}
            prefs={prefs}
            box={box}
            page={neighbours.prev}
            style={UNDER_SHEET}
            ink={ink}
          />

          {/* The flap: the part that has come up off the table, showing its
              BACK. Which is the same paper reflected across the crease — so it
              is the same markup with the fold's matrix on it, and the text
              comes out mirrored for free, because that is what the back of a
              page is. */}
          <div
            ref={flapOuter}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: 3,
              visibility: "hidden",
              transformOrigin: "0 0",
              willChange: "transform",
            }}
          >
            {/* No drop-shadow anywhere near this.
                The obvious way to shadow a folded sheet is a filter on its
                silhouette, and it is the wrong way twice over. CSS applies a
                filter BEFORE a clip-path on the same element, so the browser
                was blurring the entire laid-out chapter — a strip eleven
                thousand pixels wide — and then throwing all but a page of it
                away, sixty times a second. And a blur that size is the single
                most expensive thing a phone's compositor can be asked for.
                The shading below is gradients on a surface that is moving
                anyway, which costs nothing. */}
            <div
              ref={flapClip}
              className="absolute inset-0 overflow-hidden"
              style={{ willChange: "clip-path" }}
            >
              {/* The sheet itself, opaque, because paper is. */}
              <div className="absolute inset-0" style={{ background: theme.bg }} />
              {/* What shows through from the other side. Faint: you can see
                  there is print on it and you cannot read it, which is what a
                  page held up to the light does. */}
              <Sheet
                html={html}
                label={label}
                prefs={prefs}
                box={box}
                page={curl ? (curl.forward ? curl.from : curl.from - 1) : page}
                style={theme.dark ? BACK_SHEET_DARK : BACK_SHEET_LIGHT}
              />
              {/* The curve. A sheet lifted off a table is not flat, and a flat
                  rectangle of paper colour is the one thing that gives it
                  away. The angle arrives as a custom property so a frame of
                  the fold can change it without React rebuilding a gradient
                  string. */}
              <div
                ref={sheen}
                className="absolute inset-0"
                style={{
                  ["--crease" as string]: "90deg",
                  background: `linear-gradient(var(--crease), rgba(0,0,0,${
                    theme.dark ? 0.82 : 0.45
                  }) 0%, rgba(0,0,0,${theme.dark ? 0.3 : 0.1}) 12%, rgba(0,0,0,0) 34%, rgba(255,255,255,${
                    theme.dark ? 0.05 : 0.4
                  }) 100%)`,
                }}
              />
            </div>
          </div>
        </>
      )}

      {/* The real column. Measured, anchored, selected from — the only copy
          the rest of the reader knows about. Clipped to the flat part of the
          sheet only when it is the page being folded. */}
      <div
        ref={flatWrap}
        className={paged ? "absolute inset-0" : "relative"}
        style={paged ? { zIndex: 1, background: theme.bg } : undefined}
      >
      {/* The ink goes under the words, and moves exactly as they do — same
          translate, same transition. Different transitions and a page turn
          drags the highlights across the paper a beat behind the sentences
          they belong to. */}
      <InkLayer
        ink={ink}
        shift={paged ? (curl ? -pageOffset(page, box.w) : slide) : 0}
        transition={
          paged && dragX === null && !curl
            ? "transform 320ms cubic-bezier(.22,.61,.36,1)"
            : "none"
        }
      />
      <div
        className="soma-epub"
        ref={column}
        style={{
          fontFamily: fontStack(prefs.font),
          fontSize: `${prefs.size}px`,
          lineHeight: prefs.lineHeight,
          color: theme.fg,
          ...(paged
            ? {
                height: `${box.h}px`,
                columnWidth: `${box.w}px`,
                columnGap: `${PAGE_GAP}px`,
                columnFill: "auto" as const,
                transform: `translateX(${curl ? -pageOffset(page, box.w) : slide}px)`,
                // No transition while the finger is down, or the paper lags
                // behind it. The settle is a decelerating curve rather than an
                // ease-in-out: a page you let go of carries on and stops, it
                // does not accelerate from nothing. And none at all during a
                // fold, where the strip must not move.
                transition: dragX === null && !curl
                  ? "transform 320ms cubic-bezier(.22,.61,.36,1)"
                  : "none",
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
            there is no other way to show it.

            The object is memoised, and that is not a micro-optimisation: it
            is the single most expensive thing in the reader. React compares
            props by identity, and `dangerouslySetInnerHTML` is an OBJECT — so
            `{{ __html: html }}` written inline is a new object on every
            render, React sees a changed prop, and sets innerHTML again. The
            string is identical; the browser still throws away sixty
            paragraphs and re-parses them. Four times over, because the two
            spare sheets and the back of the flap hold the same chapter. It
            cost the better part of a second on every page turn. */}
        <div dangerouslySetInnerHTML={markup} />
      </div>
      </div>
    </ReadingSurface>
  );
}

/**
 * Another copy of the chapter, showing one page of it.
 *
 * A fold needs three surfaces at once — the page you are leaving, its back,
 * and the page underneath — and an element can only be in one place, so two
 * of them are copies. Identical markup to the real column, down to the
 * chapter label: pagination depends on everything above the text, and a copy
 * that left the label out would break its pages a line earlier than the page
 * it is standing in for.
 *
 * Inert, and hidden from anything reading the screen: there is one book on
 * this page, not three.
 */
/**
 * Style objects for the curl's copies, made once.
 *
 * A fresh object literal is a new prop, and a new prop defeats the memo on
 * Sheet — so passing `style={{ zIndex: 0 }}` inline meant both copies of the
 * chapter re-rendered on the frame a fold began, which is precisely the frame
 * that cannot afford it.
 */
/** Px per ms of sideways travel that counts as a flick rather than a drag. */
const FLICK = 0.5;

const UNDER_SHEET: React.CSSProperties = { zIndex: 0 };
const BACK_SHEET_DARK: React.CSSProperties = { background: "transparent", opacity: 0.16 };
const BACK_SHEET_LIGHT: React.CSSProperties = { background: "transparent", opacity: 0.13 };

/** One highlight stroke, placed along the laid-out strip. */
export interface Ink extends Row {
  id: string;
  colour: string;
}

/**
 * The ink, under the words.
 *
 * Under, and that is the whole reason it is a layer of its own rather than a
 * background on the text: a highlighter goes beneath the letters, and setting
 * a background on the markup would mean touching the markup — which is the
 * chapter, which would have to be re-parsed, which is the one thing this
 * reader has learned not to do.
 *
 * It carries the same translate as the strip beside it, with the same
 * transition, so the ink and the words move as one thing. Give them different
 * transitions and a page turn drags the highlights across the paper a beat
 * behind the sentences they belong to.
 */
const InkLayer = memo(function InkLayer({
  ink, shift, transition,
}: {
  ink?: Ink[];
  shift: number;
  transition?: string;
}) {
  if (!ink?.length) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ transform: `translateX(${shift}px)`, transition }}
    >
      {ink.map((r) => (
        <span
          key={r.id + r.x + r.y}
          className="absolute block"
          style={{
            left: r.x, top: r.y, width: r.w, height: r.h,
            background: r.colour,
            // Rounded like a pen stroke, not like a table cell.
            borderRadius: 3,
          }}
        />
      ))}
    </div>
  );
});

const Sheet = memo(function Sheet({
  innerRef, html, label, prefs, box, page, style, ink,
}: {
  /** So a fold can write its clip straight onto this, without a render. */
  innerRef?: React.Ref<HTMLDivElement>;
  html: string;
  label: string;
  prefs: ReaderPrefs;
  box: { w: number; h: number };
  page: number;
  style?: React.CSSProperties;
  /** Highlight strokes in strip coordinates, shared with every other copy. */
  ink?: Ink[];
}) {
  const theme = themeSpec(prefs.theme);
  const markup = useMemo(() => ({ __html: html }), [html]);
  return (
    <div
      ref={innerRef}
      aria-hidden
      // Clipped to its own box: a column strip is many times wider than the
      // page it is showing, and leaving it unbounded is many times the paint.
      className="pointer-events-none absolute inset-0 select-none overflow-hidden"
      // Opaque, because a page is. Without the paper behind it the sheet
      // under this one reads straight through and you get two pages of text
      // printed on top of each other.
      style={{ background: theme.bg, ...style }}
    >
      <InkLayer ink={ink} shift={-pageOffset(Math.max(0, page), box.w)} />
      <div
        className="soma-epub"
        style={{
          fontFamily: fontStack(prefs.font),
          fontSize: `${prefs.size}px`,
          lineHeight: prefs.lineHeight,
          color: theme.fg,
          height: `${box.h}px`,
          columnWidth: `${box.w}px`,
          columnGap: `${PAGE_GAP}px`,
          columnFill: "auto",
          transform: `translateX(${-pageOffset(Math.max(0, page), box.w)}px)`,
        }}
      >
        {label && <p className="soma-epub-label" style={{ color: theme.faint }}>{label}</p>}
        <div dangerouslySetInnerHTML={markup} />
      </div>
    </div>
  );
});

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
  book, prefs, viewportRef, columnRef, box, onTurn, onChrome, onDrag, onLine,
  startLine, page, pages, atStart, atEnd, edges, slide, turning, folding, children,
  chapter, marks, onMark, onUnmark,
}: {
  book: MindEntry;
  prefs: ReaderPrefs;
  /** Which chapter is on screen, so a highlight knows where it belongs. */
  chapter: number;
  /** This chapter's highlights, for spotting one the selection landed on. */
  marks: BookMark[];
  onMark: (span: { start: number; end: number; colour: string; text: string }) => void;
  onUnmark: (id: string) => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  columnRef: React.RefObject<HTMLDivElement | null>;
  box: { w: number; h: number };
  onTurn: (delta: 1 | -1) => void;
  onChrome: () => void;
  /**
   * Where the finger is during a turn, or null when there is not one.
   *
   * Both the travel and the position, because the two page styles want
   * different things from the same gesture: a slide needs how far, a curl
   * needs where — the crease runs through the finger, so a curl started low
   * on the page folds a different corner from one started high.
   */
  /**
   * Returns true when the fold has taken the gesture and owns its ending.
   * `flick` is the finger's horizontal speed at release, in px per ms.
   */
  onDrag?: (
    at: { dx: number; dy: number; x: number; y: number } | null,
    flick?: number,
  ) => boolean | void;
  /** Which line is lit, written down so the book reopens on it. */
  onLine?: (index: number) => void;
  /** The line to open on, once this page's lines have been measured. */
  startLine?: number;
  page: number;
  pages: number;
  /** Whether this is the first or last page of the whole book. */
  atStart?: boolean;
  atEnd?: boolean;
  /** How many page boundaries the strip has, for the sliding paper edges. */
  edges?: number;
  /** The strip's current translate, so the edges move in lockstep with it. */
  slide?: number;
  /** True while a turn is in progress, which is when the edges show. */
  turning?: boolean;
  /**
   * True while a page is being FOLDED rather than slid.
   *
   * The fold decides its own ending — how far it has come is a question about
   * a crease, not about how far a finger travelled — so the release handler
   * below stands aside and lets the curl finish the turn.
   */
  folding?: boolean;
  children: React.ReactNode;
}) {
  const theme = themeSpec(prefs.theme);
  const paged = isPaged(prefs);
  const removeMind = useSoma((s) => s.removeMind);
  // Whether there is anything beyond this page. Only the very front and back
  // of the BOOK resist — every other end-of-chapter carries on into the next.
  const atBookStart = page === 0 && atStart;
  const atBookEnd = page === pages - 1 && atEnd;

  const drag = useRef<
    {
      x: number; y: number; turning: boolean; at: number; lastX: number; vx: number;
      held: boolean; picking: boolean;
    } | null
  >(null);
  /** The press-and-hold timer, cancelled by movement or by letting go. */
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hold.current) clearTimeout(hold.current);
  }, []);
  const [lines, setLines] = useState<Rect[]>([]);
  const [line, setLine] = useState(0);
  /** Set when a page is entered backwards, so it opens on its last line. */
  const landOnLastLine = useRef(false);
  /** The stored line, used once — after that you are reading, not resuming. */
  const resumeLine = useRef(startLine);

  /**
   * A word you put your finger on, and what you meant by it.
   *
   * This used to file the word in the word book the moment the selection
   * settled, and nothing else — one action, chosen for you, taken before you
   * could say otherwise. That is right for the thing you do most often and
   * wrong for every other thing you might have meant, so the selection now
   * asks: copy it, highlight it, look it up, translate it, keep it.
   *
   * The sentence around it still comes along, because a word alone is a
   * flashcard you will fail and the same word in the line you met it in is a
   * memory — and the text is already on the screen, so it is free.
   */
  const [pick, setPick] = useState<Pick | null>(null);
  const [kept, setKept] = useState(false);
  /** A translation fetched before the word was kept, so keeping it carries it. */
  const gotTranslation = useRef<{ text: string; to: string } | null>(null);

  /** The span the finger has picked out, in characters into the chapter. */
  const [held, setHeld] = useState<{ start: number; end: number } | null>(null);
  const holdFrom = useRef<{ start: number; end: number } | null>(null);

  /**
   * The word under a point on the page, as characters into the chapter.
   *
   * Goes through the caret rather than through a selection, because the whole
   * purpose of this is never to make a selection — see lib/pick-word.ts for
   * why iOS leaves no other way to own the menu over a word.
   */
  const wordUnder = useCallback(
    (clientX: number, clientY: number) => {
      const host = columnRef.current;
      if (!host) return null;
      const caret = caretAt(clientX, clientY);
      if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
      if (!host.contains(caret.node)) return null;
      const text = caret.node.textContent ?? "";
      const within = wordBounds(text, caret.offset);
      if (!within) return null;
      const base = charOffset(host, caret.node, 0);
      return { start: base + within.start, end: base + within.end };
    },
    [columnRef],
  );

  /** Put the menu over whatever is currently held. */
  const offerHeld = useCallback(
    (span: { start: number; end: number }) => {
      const host = columnRef.current;
      const port = viewportRef.current;
      if (!host || !port) return;
      const range = rangeOf(host, span.start, span.end);
      if (!range) return;
      const raw = range.toString();
      if (!isSelectable(raw)) return;
      const block =
        range.startContainer.parentElement?.closest("p, li, blockquote, h1, h2, h3, div")
          ?.textContent ?? "";
      // `capture` answers the narrower question — is this a vocabulary word —
      // and that decides only whether the two word-scale actions are offered.
      // A sentence is not a word and is exactly what you highlight.
      const got = capture(raw, block);
      const text = cleanSelection(raw);
      const r = range.getBoundingClientRect();
      const view = port.getBoundingClientRect();
      gotTranslation.current = null;
      setKept(
        !!got &&
          useSoma
            .getState()
            .mind.some(
              (m) =>
                m.kind === "language" && (m.title ?? "").toLowerCase() === got.word.toLowerCase(),
            ),
      );
      setPick({
        text: got?.word ?? text,
        example: got?.example,
        word: !!got,
        at: { x: r.left - view.left, y: r.top - view.top, w: r.width, h: r.height },
        start: span.start,
        end: span.end,
        mark: markAt(marks, chapter, span.start),
      });
    },
    [columnRef, viewportRef, marks, chapter],
  );

  /**
   * Press and hold to pick a word; keep holding and drag to take in more.
   *
   * The press is what starts it, not a tap — a tap turns the page, and the two
   * must never be the same gesture. Holding still for a third of a second is
   * the signal, which is the same one iOS uses for its own selection and
   * therefore the one a thumb already knows.
   */
  const onHold = useCallback(
    (clientX: number, clientY: number) => {
      const w = wordUnder(clientX, clientY);
      if (!w) return false;
      holdFrom.current = w;
      setHeld(w);
      offerHeld(w);
      return true;
    },
    [wordUnder, offerHeld],
  );

  /**
   * The picked word, drawn.
   *
   * The browser is not selecting anything, so nothing is highlighted unless
   * the book highlights it. One stroke per line, in the paper's own mark
   * colour, positioned against the viewport exactly as the line-focus overlay
   * is — and recomputed whenever the span changes, which while a finger is
   * dragging is every few words.
   */
  const [holdRects, setHoldRects] = useState<Row[]>([]);
  /** Where the two ends of the held span are, for the grab handles. */
  const [holdEnds, setHoldEnds] = useState<{ a: Row; b: Row } | null>(null);
  useEffect(() => {
    const host = columnRef.current;
    const port = viewportRef.current;
    if (!held || !host || !port) {
      setHoldRects([]);
      setHoldEnds(null);
      return;
    }
    const range = rangeOf(host, held.start, held.end);
    if (!range) {
      setHoldRects([]);
      setHoldEnds(null);
      return;
    }
    const view = port.getBoundingClientRect();
    const raw = Array.from(range.getClientRects())
      .filter((r) => r.width > 0.5 && r.height > 0.5)
      .map((r) => ({ x: r.left - view.left, y: r.top - view.top, w: r.width, h: r.height }));
    setHoldRects(rowsOf(raw, 1.5));
    // The ends come from the RAW rectangles rather than the merged rows: a
    // handle belongs at the first and last character, and merging has already
    // thrown away which of several boxes on a line came first.
    const first = raw[0];
    const last = raw[raw.length - 1];
    setHoldEnds(first && last ? { a: first, b: last } : null);
  }, [held, columnRef, viewportRef, page]);

  /**
   * The two handles, and what dragging one does.
   *
   * iOS gives a native selection two grab handles and takes the menu away in
   * exchange; this reader has neither, so it draws its own. Dragging an end
   * moves it to the WORD under the finger rather than the character, because
   * a handle on a phone covers about four letters and character precision
   * with a thumb is a promise no one can keep.
   */
  const dragEnd = useRef<"a" | "b" | null>(null);
  const grabHandle = (which: "a" | "b") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragEnd.current = which;
  };
  const moveHandle = (e: React.PointerEvent) => {
    if (!dragEnd.current || !held) return;
    e.stopPropagation();
    const w = wordUnder(e.clientX, e.clientY);
    if (!w) return;
    const next =
      dragEnd.current === "a"
        ? { start: Math.min(w.start, held.end - 1), end: held.end }
        : { start: held.start, end: Math.max(w.end, held.start + 1) };
    if (next.start === held.start && next.end === held.end) return;
    setHeld(next);
    offerHeld(next);
  };
  const dropHandle = (e: React.PointerEvent) => {
    if (!dragEnd.current) return;
    e.stopPropagation();
    dragEnd.current = null;
  };

  const onHoldMove = useCallback(
    (clientX: number, clientY: number) => {
      const from = holdFrom.current;
      if (!from) return;
      const w = wordUnder(clientX, clientY);
      if (!w) return;
      const span = spanUnion(from, w);
      setHeld((cur) => (cur && cur.start === span.start && cur.end === span.end ? cur : span));
      offerHeld(span);
    },
    [wordUnder, offerHeld],
  );

  const done = useCallback(() => {
    holdFrom.current = null;
    setHeld(null);
    setPick(null);
  }, []);

  /**
   * Which language a word gets translated into.
   *
   * Taken from the phone the first time and then kept, because being asked on
   * every word is how a feature stops being used. Written back on first use
   * rather than at startup, so a reader who never translates anything never
   * acquires a setting they did not ask for.
   */
  const storedLang = useSoma((s) => s.settings.translateTo);
  const translateTo = isLanguage(storedLang)
    ? storedLang
    : defaultLanguage(typeof navigator === "undefined" ? undefined : navigator.language);

  const copyPick = useCallback(() => {
    const text = pick?.text;
    if (!text) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied");
      } catch {
        toast.error("This phone would not let the app copy.");
      }
    })();
    done();
  }, [pick?.text, done]);

  /**
   * Keep the word: file it, or star the one already filed.
   *
   * Starring rather than adding again, because the same word met twice in a
   * book is one word. The entry it lands on is the same kind the word book
   * already reads, so a word kept here is in the spaced-repetition queue by
   * tonight without a line of code that knows about either.
   */
  const keepPick = useCallback(() => {
    const got = pick;
    if (!got) return;
    const store = useSoma.getState();
    const already = store.mind.find(
      (m) => m.kind === "language" && (m.title ?? "").toLowerCase() === got.text.toLowerCase(),
    );
    const said = gotTranslation.current;
    if (already) {
      const next = !already.favourite;
      store.updateMind(already.id, {
        favourite: next,
        ...(said ? { translation: said.text, translatedTo: said.to } : {}),
      });
      setKept(next);
      toast.success(next ? `“${got.text}” kept` : `“${got.text}” unkept`);
    } else {
      const id = store.addMind({
        date: getLocalDateKey(new Date()),
        kind: "language",
        title: got.text,
        example: got.example,
        source: book.title,
        favourite: true,
        ...(said ? { translation: said.text, translatedTo: said.to } : {}),
      } as Omit<MindEntry, "id">);
      setKept(true);
      toast.success(`“${got.text}” added to your words`, {
        description: got.example,
        action: { label: "Undo", onClick: () => removeMind(id) },
      });
    }
    done();
  }, [pick, book.title, removeMind, done]);

  const notedTranslation = useCallback(
    (text: string, to: string) => {
      gotTranslation.current = { text, to };
      const store = useSoma.getState();
      if (!isLanguage(store.settings.translateTo)) store.patchSettings({ translateTo: to });
      const word = pick?.text ?? "";
      const already = store.mind.find(
        (m) => m.kind === "language" && (m.title ?? "").toLowerCase() === word.toLowerCase(),
      );
      if (already) store.updateMind(already.id, { translation: text, translatedTo: to });
    },
    [pick?.text],
  );

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
    // is where you were standing. A book you have just OPENED goes to the
    // line it was closed on, once and once only — after the first page it is
    // reading rather than resuming.
    const resume = resumeLine.current;
    resumeLine.current = undefined;
    setLine(
      landOnLastLine.current
        ? Math.max(0, local.length - 1)
        : resume !== undefined
          ? Math.min(Math.max(0, resume), Math.max(0, local.length - 1))
          : 0,
    );
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

  useEffect(() => {
    if (prefs.lineFocus && lines.length > 0) onLine?.(line);
  }, [line, lines.length, prefs.lineFocus, onLine]);

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
    // Press and hold to pick a word. A third of a second is the same signal
    // iOS uses for its own selection, so it is the one a thumb already knows
    // — and it is long enough that a tap to turn the page never trips it.
    if (hold.current) clearTimeout(hold.current);
    const hx = e.clientX;
    const hy = e.clientY;
    hold.current = setTimeout(() => {
      hold.current = null;
      const d = drag.current;
      // Only if the finger actually stayed still. A swipe that happens to
      // last a third of a second is a swipe.
      if (!d || d.turning || d.held) return;
      if (Math.abs(d.lastX - d.x) > 8) return;
      if (onHold(hx, hy)) {
        d.held = true;
        d.picking = true;
      }
    }, 320);
    drag.current = {
      x: e.clientX, y: e.clientY, turning: false,
      at: e.timeStamp, lastX: e.clientX, vx: 0, picking: false,
      // Was there already something selected when this gesture began?
      //
      // If there was, the gesture belongs to the SELECTION — on a phone that
      // is a finger on one of the two handles, dragging it to take in another
      // word. It is not a page turn and must not be treated as one, and this
      // is the bug that made the whole selection menu unusable on a phone:
      // the turn threshold is fourteen pixels, a handle moves further than
      // that immediately, and the first thing a turn does is clear the
      // selection. So the menu appeared and vanished, over and over, and
      // nothing in it could be pressed.
      held: !(document.getSelection()?.isCollapsed ?? true),
    };
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
    if (!d || !paged) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // Speed, smoothed. One pair of samples is mostly noise — pointer events
    // arrive in bursts and two of them can share a millisecond — so each
    // reading is folded into the last, which leaves the number steady and
    // still responsive to the last thing the finger did.
    const gap = e.timeStamp - d.at;
    if (gap > 0) {
      d.vx = d.vx * 0.6 + ((e.clientX - d.lastX) / gap) * 0.4;
      d.at = e.timeStamp;
      d.lastX = e.clientX;
    }
    // Once a word is held, the finger is choosing words, not turning pages.
    if (d.picking) {
      onHoldMove(e.clientX, e.clientY);
      return;
    }
    // A gesture that began on a selection stays with the selection.
    if (d.held) return;
    // Moved far enough to be a swipe: it is not a press any more.
    if (hold.current && Math.hypot(dx, dy) > 8) {
      clearTimeout(hold.current);
      hold.current = null;
    }
    if (!d.turning && isTurning(dx, dy, box.w || 1, paged)) d.turning = true;
    if (!d.turning) return;
    document.getSelection()?.removeAllRanges();
    // The page goes where the finger goes. This is the whole difference
    // between a reader that turns pages and one that plays an animation at
    // you: you are moving the paper, and you can change your mind halfway and
    // put it back.
    const free = dx < 0 ? page < pages - 1 || !atBookEnd : page > 0 || !atBookStart;
    const rect = viewportRef.current?.getBoundingClientRect();
    onDrag?.({
      dx: damp(dx, free),
      dy,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    });
  };

  const onPointerCancel = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    // iOS taking the gesture over for its own selection handles.
    drag.current = null;
    onDrag?.(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    const from = drag.current;
    drag.current = null;
    // Stale speed is worse than none: a finger held still for a moment before
    // letting go has not flicked anything, whatever it was doing before that.
    const still = from && e.timeStamp - from.at > 90;
    const folded = onDrag?.(null, still ? 0 : (from?.vx ?? 0));
    if (!from) return;
    // Letting go of a selection handle is not a tap on the page: it must not
    // turn a page, show the bars, or move the lit line.
    if (from.held) return;
    // A fold is already on its way somewhere; a second opinion about the same
    // gesture would turn two pages. `folded` is the fold answering for itself
    // on this event; `folding` is the same fact a render later, and is kept
    // for the gesture that started before this one finished.
    if (folded || folding) return;

    // With a word held, the next tap anywhere on the page puts the menu away
    // and does nothing else — it does not also turn the page or raise the
    // bars. This is the job the backdrop used to do before it was removed for
    // swallowing the handles; doing it here instead means the page underneath
    // is never covered by anything, which is what let the handles work.
    if (pick) {
      done();
      return;
    }

    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    const turn = paged && from.turning ? turnFrom(dx, dy, box.w || 1, paged) : "stay";
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
    if (where === "next" && paged) onTurn(1);
    else if (where === "prev" && paged) onTurn(-1);
    else onChrome();
  };

  const lit = lines[line];

  return (
    <div
      // `isolate` is load-bearing. The fold stacks its own layers — the page
      // being turned at 1, the flap at 3 — and a `relative` box with no
      // stacking context of its own does not contain them: they join the
      // READER's stack, where they outrank anything sitting at z-auto. Which
      // meant the page was painted over the bottom bar, and the page rail
      // inside it was invisible while measuring as perfectly present.
      className="relative isolate flex-1 overflow-hidden"
      style={{
        paddingLeft: prefs.margin,
        paddingRight: prefs.margin,
        paddingTop: "max(58px, calc(env(safe-area-inset-top) + 46px))",
        paddingBottom: "max(58px, calc(env(safe-area-inset-bottom) + 46px))",
      }}
    >
      {/* The gutter. Always there, on both sides, because a page in a book is
          never a rectangle of even light — it curves away at the binding and
          at the cut edge. Two very soft gradients are enough to say "this is
          a page in something" rather than "this is a div". */}
      {paged && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 right-0 z-10"
          style={{
            background: theme.dark
              ? "linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 5%, rgba(0,0,0,0) 95%, rgba(0,0,0,0.5) 100%)"
              : "linear-gradient(90deg, rgba(0,0,0,0.09) 0%, rgba(0,0,0,0) 5%, rgba(0,0,0,0) 95%, rgba(0,0,0,0.09) 100%)",
          }}
        />
      )}

      <div
        ref={viewportRef}
        className={cn("relative h-full", paged ? "overflow-hidden" : "overflow-y-auto")}
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
        style={{
          // NONE, not "pan-y". A paged reader has nothing to scroll — the
          // viewport is already clipped — so `pan-y` was not describing a
          // behaviour, it was handing every vertical drag to the browser:
          // it scrolled the tab behind the book (which is the scrollbar that
          // appeared down the right-hand side), and it made the browser hold
          // on to the start of every gesture while it worked out whether it
          // wanted it, which is why swipes went missing.
          touchAction: paged ? "none" : "pan-y",
          overscrollBehavior: "contain",
        }}
      >
        {children}

        {/* The edge of the paper.
            A bar of shadow at every page boundary, carried on a strip that
            moves with the text, so turning a page sweeps a real edge across
            the screen instead of cross-fading one block of words into
            another. This is the whole of the effect: a page turn you can see
            the seam of reads as paper, and one you cannot reads as a slide
            deck. It fades in only while a turn is happening — a shadow
            sitting still on a page you are reading is just a smudge. */}
        {paged && (edges ?? 0) > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-full"
            style={{
              transform: `translateX(${slide ?? 0}px)`,
              transition: turning ? "none" : "transform 320ms cubic-bezier(.22,.61,.36,1)",
            }}
          >
            {Array.from({ length: edges ?? 0 }, (_, i) => (
              <span
                key={i}
                className="absolute inset-y-0 block"
                style={{
                  left: (i + 1) * (box.w + PAGE_GAP) - PAGE_GAP / 2 - 18,
                  width: 36,
                  background: theme.dark
                    ? "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 48%, rgba(255,255,255,0.05) 52%, rgba(0,0,0,0) 100%)"
                    : "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 48%, rgba(255,255,255,0.5) 52%, rgba(0,0,0,0) 100%)",
                  opacity: turning ? 1 : 0,
                  transition: "opacity 220ms",
                }}
              />
            ))}
          </div>
        )}

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

        {/* The word you are holding. Not a selection — the book's own mark,
            because the browser has been told this text is not selectable and
            therefore draws nothing at all. */}
        {holdRects.map((r, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute block rounded-[3px]"
            style={{
              left: r.x, top: r.y, width: r.w, height: r.h,
              // The mark colour, laid down twice. It is mixed to sit UNDER
              // text as a highlighter, and a selection has to be plainly
              // visible rather than tasteful — two coats of the page's own
              // ink is a stronger tint without introducing a colour the book
              // does not already use. (Two gradient layers, because CSS will
              // composite those and will not composite two flat colours.)
              background: `linear-gradient(${theme.mark}, ${theme.mark}), linear-gradient(${theme.mark}, ${theme.mark})`,
            }}
          />
        ))}

        {/* The grab handles. Drawn, because there is no selection for the
            browser to draw them on — a bar at each end with a knob outside
            the line, which is the shape a thumb already knows. */}
        {holdEnds && (
          <>
            {(["a", "b"] as const).map((which) => {
              const r = which === "a" ? holdEnds.a : holdEnds.b;
              const x = which === "a" ? r.x : r.x + r.w;
              return (
                <span
                  key={which}
                  role="slider"
                  tabIndex={-1}
                  aria-label={which === "a" ? "Start of the selection" : "End of the selection"}
                  aria-valuenow={which === "a" ? (held?.start ?? 0) : (held?.end ?? 0)}
                  onPointerDown={grabHandle(which)}
                  onPointerMove={moveHandle}
                  onPointerUp={dropHandle}
                  onPointerCancel={dropHandle}
                  className="absolute z-[62] touch-none"
                  // A generous target around a thin mark: the bar is two
                  // pixels and the thing you can put a thumb on is twenty-two.
                  style={{
                    left: x - 11,
                    top: r.y - (which === "a" ? 13 : 2),
                    width: 22,
                    height: r.h + 15,
                  }}
                >
                  <span
                    className="absolute rounded-full"
                    style={{
                      left: 10,
                      top: which === "a" ? 11 : 0,
                      width: 2,
                      height: r.h + 4,
                      background: theme.fg,
                    }}
                  />
                  <span
                    className="absolute size-[11px] rounded-full"
                    style={{
                      left: 5.5,
                      top: which === "a" ? 2 : r.h + 4,
                      background: theme.fg,
                      boxShadow: theme.dark
                        ? "0 1px 3px rgba(0,0,0,0.7)"
                        : "0 1px 3px rgba(0,0,0,0.35)",
                    }}
                  />
                </span>
              );
            })}
          </>
        )}

        {pick && (
          <WordMenu
            pick={pick}
            theme={theme}
            box={box}
            translateTo={translateTo}
            saved={kept}
            onCopy={copyPick}
            onMark={(colour) => {
              onMark({ start: pick.start, end: pick.end, colour, text: pick.text });
              done();
            }}
            onUnmark={(id) => {
              onUnmark(id);
              done();
            }}
            onSave={keepPick}
            onTranslated={notedTranslation}
          />
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
      to: (n) => onPage(Math.max(1, count ? Math.min(count, n + 1) : n + 1)),
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
        "pointer-events-none absolute inset-x-0 z-[70] px-3 transition-opacity duration-200",
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
  prefs, onChange, onClose, epub, translateTo, onLanguage,
}: {
  prefs: ReaderPrefs;
  onChange: (next: ReaderPrefs) => void;
  onClose: () => void;
  epub: boolean;
  translateTo: string;
  onLanguage: (code: string) => void;
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
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TURN_STYLES.map((t) => (
                <Toggle
                  key={t.id}
                  on={prefs.turn === t.id}
                  onClick={() => onChange({ ...prefs, turn: t.id })}
                  title={t.label}
                  note={t.note}
                />
              ))}
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

        {/* Which language the menu's translate button reaches for. Here
            rather than in the app's settings because it is a fact about
            reading, and this is the sheet you are already in when you notice
            it is wrong. */}
        <div className="mt-3 rounded-2xl border border-border bg-surface-2 px-3 py-2.5">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Languages className="size-4 shrink-0" />
            Translate into
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                aria-pressed={l.code === translateTo}
                onClick={() => onLanguage(l.code)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold",
                  l.code === translateTo
                    ? "border-accent bg-accent/15 text-accent-text"
                    : "border-border text-muted",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[0.65rem] leading-snug text-faint">
          Select a word while you read and a bar appears over it: copy it, highlight it in
          one of five pastels, look it up, translate it, or keep it. Kept words are on the
          Reading tab, under the shelf.
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
