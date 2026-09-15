import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Highlighter, List, Search, Star, Trash2, X } from "lucide-react";
import { MIN_QUERY, findIn, tally, type Hit } from "@/lib/book-search";
import { markChip, type BookMark } from "@/lib/marks";
import { fontStack, type themeSpec } from "@/lib/reader-prefs";
import { PAGE_GAP } from "@/lib/paginate";
import type { ReaderPrefs } from "@/lib/reader-prefs";
import type { MindEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The furniture around a book: its contents, its search, and what you kept.
 *
 * All four live here rather than in the reader because none of them is about
 * READING — the reader's file is already the longest in the app and every
 * line of it is about laying out a page and turning it. These are the things
 * you do when you have stopped reading for a moment.
 *
 * They are panels over the page rather than full screens, for the same reason
 * the word menu is a bar: the page is the context. Jumping to a search result
 * is a decision you make by reading the line around it.
 */

/** One sheet, sliding up from the bottom, in the book's own colours. */
function Panel({
  theme, title, onClose, children,
}: {
  theme: ReturnType<typeof themeSpec>;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[88] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{ background: theme.dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)" }}
    >
      <div
        className="soma-expand flex max-h-[82vh] flex-col rounded-t-3xl px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4"
        style={{ background: theme.bg, color: theme.fg }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-base font-extrabold">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5" style={{ color: theme.faint }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ====================================================================== */

/** Every chapter, with the one you are in marked. */
export function ContentsSheet({
  theme, titles, current, onPick, onClose,
}: {
  theme: ReturnType<typeof themeSpec>;
  titles: string[];
  current: number;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const here = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    here.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <Panel theme={theme} title="Contents" onClose={onClose}>
      <ol className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
        {titles.map((t, i) => (
          <li key={i}>
            <button
              ref={i === current ? here : undefined}
              type="button"
              onClick={() => {
                onPick(i);
                onClose();
              }}
              className="flex w-full items-baseline gap-3 rounded-xl px-2 py-2.5 text-left active:scale-[0.99]"
              style={i === current ? { background: `${theme.fg}12` } : undefined}
            >
              <span
                className="w-6 shrink-0 text-[0.68rem] tabular-nums"
                style={{ color: theme.faint }}
              >
                {i + 1}
              </span>
              <span
                className={cn("min-w-0 flex-1 text-[0.86rem] leading-snug", i === current && "font-bold")}
              >
                {t}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ====================================================================== */

/**
 * Find a word anywhere in the book.
 *
 * The search runs over chapters this reader has turned into plain text, one
 * at a time, yielding to the screen between them — a long book is a hundred
 * chapters and doing them all in one go would lock the phone for a second
 * with nothing on screen to say why. Results appear as they are found, which
 * is also the honest way to show a search that takes a moment.
 */
export function SearchSheet({
  theme, chapters, titles, textOf, onPick, onClose,
}: {
  theme: ReturnType<typeof themeSpec>;
  chapters: number;
  titles: string[];
  textOf: (index: number) => string;
  onPick: (hit: Hit, rank: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setHits([]);
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    const found: Hit[] = [];
    let i = 0;
    const step = () => {
      if (!alive) return;
      const until = performance.now() + 12;
      while (i < chapters && performance.now() < until) {
        found.push(...findIn(textOf(i), q, i));
        i++;
      }
      setHits(found.slice(0, 300));
      if (i < chapters) {
        raf = requestAnimationFrame(step);
        return;
      }
      setBusy(false);
    };
    // A beat after the last keystroke, so typing a word does not search each
    // of its prefixes through the whole book.
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(step);
    }, 220);
    let raf = 0;
    return () => {
      alive = false;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [query, chapters, textOf]);

  /** How many hits in this chapter came before this one. */
  const ranked = useMemo(() => {
    const seen = new Map<number, number>();
    return hits.map((h) => {
      const n = seen.get(h.chapter) ?? 0;
      seen.set(h.chapter, n + 1);
      return { hit: h, rank: n };
    });
  }, [hits]);

  return (
    <Panel theme={theme} title="Search" onClose={onClose}>
      <div
        className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2"
        style={{ background: `${theme.fg}10` }}
      >
        <Search className="size-4 shrink-0" style={{ color: theme.faint }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in this book"
          className="min-w-0 flex-1 bg-transparent text-[0.92rem] outline-none"
          style={{ color: theme.fg }}
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => setQuery("")}>
            <X className="size-4" style={{ color: theme.faint }} />
          </button>
        )}
      </div>
      <div className="mb-1.5 text-[0.68rem]" style={{ color: theme.faint }}>
        {busy ? "Searching…" : tally(hits.length, query)}
      </div>
      <ol className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
        {ranked.map(({ hit, rank }, i) => (
          <li key={`${hit.chapter}:${hit.at}:${i}`}>
            <button
              type="button"
              onClick={() => {
                onPick(hit, rank);
                onClose();
              }}
              className="w-full rounded-xl px-2 py-2 text-left active:scale-[0.99]"
            >
              <div
                className="truncate text-[0.6rem] font-semibold uppercase tracking-wide"
                style={{ color: theme.faint }}
              >
                {titles[hit.chapter] ?? `Chapter ${hit.chapter + 1}`}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[0.8rem] leading-snug">
                <span style={{ color: theme.faint }}>{hit.before}</span>
                <mark
                  className="rounded-[3px] px-0.5"
                  style={{ background: theme.mark, color: "inherit" }}
                >
                  {hit.hit}
                </mark>
                <span style={{ color: theme.faint }}>{hit.after}</span>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ====================================================================== */

/**
 * What you kept out of this book: the words, and the passages.
 *
 * One panel for both because they are the same act — you saw something and
 * wanted it later — and splitting them would mean choosing a tab before
 * finding out which kind the thing you half-remember was.
 */
export function MarksSheet({
  theme, marks, words, titles, onPickMark, onDropMark, onClose,
}: {
  theme: ReturnType<typeof themeSpec>;
  marks: BookMark[];
  words: MindEntry[];
  titles: string[];
  onPickMark: (mark: BookMark) => void;
  onDropMark: (id: string) => void;
  onClose: () => void;
}) {
  const empty = marks.length === 0 && words.length === 0;
  return (
    <Panel theme={theme} title="Kept" onClose={onClose}>
      <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1">
        {empty && (
          <p className="py-6 text-center text-[0.8rem] leading-snug" style={{ color: theme.faint }}>
            Nothing kept from this book yet. Select a word or a line and the bar that
            appears will let you highlight it or keep it.
          </p>
        )}

        {marks.length > 0 && (
          <section>
            <h3
              className="mb-1.5 flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wide"
              style={{ color: theme.faint }}
            >
              <Highlighter className="size-3" />
              Highlights
            </h3>
            <ul className="space-y-1">
              {marks.map((m) => (
                <li key={m.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onPickMark(m);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2 py-2 text-left active:scale-[0.99]"
                  >
                    <span
                      className="mt-1 h-3.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: markChip(m.colour) }}
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.82rem] leading-snug">{m.text}</span>
                      <span className="mt-0.5 block text-[0.6rem]" style={{ color: theme.faint }}>
                        {titles[m.chapter] ?? `Chapter ${m.chapter + 1}`}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove the highlight on ${m.text}`}
                    onClick={() => onDropMark(m.id)}
                    className="grid w-9 shrink-0 place-items-center rounded-xl active:scale-95"
                    style={{ color: theme.faint }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {words.length > 0 && (
          <section>
            <h3
              className="mb-1.5 flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wide"
              style={{ color: theme.faint }}
            >
              <Star className="size-3" />
              Words
            </h3>
            <ul className="space-y-1">
              {words.map((w) => (
                <li key={w.id} className="rounded-xl px-2 py-2">
                  <div className="flex items-baseline gap-2">
                    {w.favourite && (
                      <Star className="size-3 shrink-0 self-center fill-current" />
                    )}
                    <span className="truncate text-[0.84rem] font-bold">{w.title}</span>
                    {w.translation && (
                      <span className="truncate text-[0.74rem]" style={{ color: theme.faint }}>
                        {w.translation}
                      </span>
                    )}
                  </div>
                  {w.takeaway && (
                    <div className="mt-0.5 text-[0.72rem] leading-snug" style={{ color: theme.faint }}>
                      {w.takeaway}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Panel>
  );
}

/* ====================================================================== */

/**
 * The chapter, small, to thumb through.
 *
 * A MINIATURE, not a photograph of the real thing shrunk. The obvious build
 * is to take the strip the reader already has — every page of the chapter
 * side by side — and put `transform: scale(0.12)` on it. It works on a
 * desktop and it is blank on a phone, which is the worst kind of wrong.
 *
 * A transform does not change what the browser rasterises: it lays the
 * element out at full size, draws it at full size, and scales the result. The
 * strip is eleven thousand CSS pixels wide, which on a three-times screen is
 * thirty-three thousand device pixels — several times WebKit's maximum
 * texture size. Over that limit it does not draw a smaller version, it draws
 * nothing.
 *
 * So the chapter is laid out AGAIN at a twelfth of the type size, in a twelfth
 * of the box, with a twelfth of the gap. Geometrically similar, so the lines
 * break in nearly the same places and the pages hold nearly the same words —
 * and the whole strip is thirteen hundred pixels wide, which any phone can
 * draw. The text comes out about two pixels tall, which is what a thumbnail
 * is: not words, the shape of words on a page.
 */
export const PageRail = memo(function PageRail({
  theme, prefs, html, label, box, pages, page, onPick,
}: {
  theme: ReturnType<typeof themeSpec>;
  prefs: ReaderPrefs;
  html: string;
  label: string;
  box: { w: number; h: number };
  pages: number;
  page: number;
  onPick: (page: number) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => ({ __html: html }), [html]);
  /** Tall enough to read as a page, short enough to leave the book room. */
  const HEIGHT = 92;
  const scale = box.h ? HEIGHT / box.h : 0.12;
  const cardW = Math.max(18, Math.round(box.w * scale));
  const gapW = Math.max(3, Math.round(PAGE_GAP * scale));
  const stride = cardW + gapW;

  // Keep the page you are on in view, without fighting a finger that is
  // already scrolling: only when the page changed underneath it.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const want = page * stride - el.clientWidth / 2 + cardW / 2;
    el.scrollTo({ left: Math.max(0, want), behavior: "smooth" });
  }, [page, stride, cardW]);

  if (!box.w || pages < 1) return null;

  return (
    <div
      ref={rail}
      className="pointer-events-auto mx-auto mb-2 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl px-3 py-2"
      style={{
        background: theme.dark ? "rgba(70,70,76,0.55)" : "rgba(250,249,246,0.62)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        boxShadow: theme.dark
          ? "inset 0 0.5px 0 rgba(255,255,255,0.20), 0 6px 20px rgba(0,0,0,0.42)"
          : "inset 0 0.5px 0 rgba(255,255,255,0.9), 0 6px 20px rgba(0,0,0,0.16)",
        scrollbarWidth: "none",
      }}
      // The rail scrolls sideways and nothing else; letting the browser treat
      // a drag on it as a page turn would turn the page you are scrubbing past.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative" style={{ height: HEIGHT, width: stride * pages - gapW }}>
        {/* Paper, one piece per page, under everything.
            What makes a thumbnail legible at a twelfth of its size is not the
            words — they are two pixels tall — but the rectangle they sit on. */}
        {Array.from({ length: pages }, (_, i) => (
          <span
            key={`p${i}`}
            aria-hidden
            className="absolute top-0 block rounded-[3px]"
            style={{ left: i * stride, width: cardW, height: HEIGHT, background: theme.bg }}
          />
        ))}

        {/* The chapter, set small. Same columns, same proportions, a twelfth
            of everything — so the pages here are the pages there. */}
        <div
          aria-hidden
          className="absolute left-0 top-0 overflow-hidden"
          style={{ width: stride * pages - gapW, height: HEIGHT }}
        >
          <div
            className="soma-epub"
            style={{
              fontFamily: fontStack(prefs.font),
              fontSize: `${prefs.size * scale}px`,
              lineHeight: prefs.lineHeight,
              color: theme.fg,
              height: `${HEIGHT}px`,
              columnWidth: `${cardW}px`,
              columnGap: `${gapW}px`,
              columnFill: "auto",
              // iOS inflates small text in narrow columns unless told not to,
              // which would break every page boundary in the strip.
              WebkitTextSizeAdjust: "none",
              textSizeAdjust: "none",
            }}
          >
            {label && <p className="soma-epub-label" style={{ color: theme.faint }}>{label}</p>}
            <div dangerouslySetInnerHTML={markup} />
          </div>
        </div>

        {/* A frame per page, over the top. These are what you press, and what
            says which page you are on. */}
        {Array.from({ length: pages }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Page ${i + 1}`}
            aria-current={i === page}
            onClick={() => onPick(i)}
            className="absolute top-0 rounded-[3px]"
            style={{
              left: i * stride,
              width: cardW,
              height: HEIGHT,
              boxShadow:
                i === page
                  ? `0 0 0 2px ${theme.fg}`
                  : `0 0 0 1px ${theme.fg}33`,
              // Every page but the one you are on is held back a little, so
              // the one you are on is found without reading any of them.
              background: i === page
                ? "transparent"
                : theme.dark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.34)",
            }}
          />
        ))}
      </div>
    </div>
  );
});

/** The two pills at the top, the way a book has always had them. */
export function TopPills({
  theme, show, onBack, onContents, onType, onSearch, onKept,
}: {
  theme: ReturnType<typeof themeSpec>;
  show: boolean;
  onBack: () => void;
  onContents: () => void;
  onType: () => void;
  onSearch: () => void;
  onKept: () => void;
}) {
  // Glass, properly.
  //
  // A flat translucent fill is not glass, it is a grey box you can half see
  // through — which is what this was. Real glass does three things at once
  // and needs all three: it BLURS what is behind it, it SATURATES it so the
  // colour underneath still reads through, and it catches a highlight along
  // its top edge where the light lands. The hairline ring is the edge of the
  // pane; the shadow is it floating above the page rather than printed on it.
  //
  // `-webkit-backdrop-filter` is written out because Safari still wants it,
  // and Safari is the only browser this ever runs in.
  const pill: React.CSSProperties = {
    background: theme.dark ? "rgba(70,70,76,0.55)" : "rgba(250,249,246,0.62)",
    backdropFilter: "blur(24px) saturate(180%)",
    WebkitBackdropFilter: "blur(24px) saturate(180%)",
    color: theme.fg,
    boxShadow: theme.dark
      ? "inset 0 0.5px 0 rgba(255,255,255,0.22), inset 0 0 0 0.5px rgba(255,255,255,0.10), 0 6px 20px rgba(0,0,0,0.42)"
      : "inset 0 0.5px 0 rgba(255,255,255,0.9), inset 0 0 0 0.5px rgba(0,0,0,0.07), 0 6px 20px rgba(0,0,0,0.16)",
  };
  const Btn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-full active:scale-90"
    >
      {children}
    </button>
  );
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-[70] flex items-start justify-between gap-2 px-3 transition-opacity duration-200",
        "pt-[max(10px,env(safe-area-inset-top))]",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn("flex items-center rounded-full px-1", show && "pointer-events-auto")}
        style={pill}
      >
        <Btn label="Back to the shelf" onClick={onBack}>
          <ChevronLeftGlyph />
        </Btn>
        <Btn label="Contents" onClick={onContents}>
          <List className="size-[1.15rem]" />
        </Btn>
      </div>
      <div
        className={cn("flex items-center rounded-full px-1", show && "pointer-events-auto")}
        style={pill}
      >
        <Btn label="Type and theme" onClick={onType}>
          <span className="text-[1.05rem] font-semibold leading-none tracking-tight">
            A<span className="text-[0.78rem]">a</span>
          </span>
        </Btn>
        <Btn label="Search this book" onClick={onSearch}>
          <Search className="size-[1.1rem]" />
        </Btn>
        <Btn label="What you kept" onClick={onKept}>
          <Bookmark className="size-[1.1rem]" />
        </Btn>
      </div>
    </div>
  );
}

function ChevronLeftGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.3rem]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
