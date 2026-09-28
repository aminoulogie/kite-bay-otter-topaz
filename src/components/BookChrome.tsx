import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Highlighter, List, Search, Star, Trash2, X } from "lucide-react";
import { MIN_QUERY, findIn, tally, type Hit } from "@/lib/book-search";
import { markChip, type BookMark } from "@/lib/marks";
import { fontStack, type ReaderPrefs, type themeSpec } from "@/lib/reader-prefs";
import { PAGE_GAP } from "@/lib/paginate";
import type { MindEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { tapTick } from "@/lib/haptics";

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

/**
 * The reader's own glass.
 *
 * The app has a Liquid Glass system and the reader cannot simply use it: those
 * tints are built for one dark chrome, and a book has three papers. A night
 * tint floating over sepia is the thing that reads as "off" — not the blur,
 * the COLOUR, sitting on paper it was never mixed for.
 *
 * So the material is shared and the tint is not. Blur and saturation come from
 * the same custom properties the rest of the app uses, so a pill in a book is
 * made of the same stuff as the dock; the tint is mixed from the page it is
 * floating over. And it is all three things at once, which is what separates
 * glass from a translucent grey box: it blurs what is behind it, it SATURATES
 * it so the colour underneath still reads through, and it catches a highlight
 * along its top edge where the light lands.
 *
 * `-webkit-backdrop-filter` is spelled out because Safari still wants it, and
 * Safari is the only browser this ever runs in.
 */
function readerGlass(theme: ReturnType<typeof themeSpec>): React.CSSProperties {
  return {
    background: theme.dark ? "rgba(70,70,76,0.55)" : "rgba(250,249,246,0.62)",
    backdropFilter: "blur(var(--glass-blur,22px)) saturate(var(--glass-sat,1.8))",
    WebkitBackdropFilter: "blur(var(--glass-blur,22px)) saturate(var(--glass-sat,1.8))",
    color: theme.fg,
    boxShadow: theme.dark
      ? "inset 0 0.5px 0 rgba(255,255,255,0.22), inset 0 0 0 0.5px rgba(255,255,255,0.10), 0 8px 26px rgba(0,0,0,0.46)"
      : "inset 0 0.5px 0 rgba(255,255,255,0.9), inset 0 0 0 0.5px rgba(0,0,0,0.07), 0 8px 26px rgba(0,0,0,0.18)",
  };
}

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
 * The chapters, small, to jump between.
 *
 * One chip per chapter rather than a filmstrip of pages. A page strip on a
 * twenty-eight page chapter is twenty-eight thumbnails to hunt through for
 * something a table of contents already says in one line; and pages are only
 * meaningful inside the chapter you are already in, while the question a
 * reader actually asks at the bottom of a book is "which chapter is next".
 * Chips are also a single slim row that stays clear of the page, where the
 * strip was a second copy of the text sitting under the words you were
 * reading.
 */
export const ChapterRail = memo(function ChapterRail({
  theme, titles, current, onPick,
}: {
  theme: ReturnType<typeof themeSpec>;
  titles: string[];
  current: number;
  onPick: (chapter: number) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);

  // Keep the chapter you are on in view, without fighting a finger that is
  // already scrolling: only when the chapter changed underneath it.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const chip = el.querySelector<HTMLElement>('[aria-current="true"]');
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current, titles.length]);

  return (
    <div
      ref={rail}
      className="pointer-events-auto mx-auto mb-2 max-w-full overflow-x-auto overscroll-x-contain rounded-full px-2 py-1.5"
      style={{
        background: theme.dark ? "rgba(40,40,44,0.92)" : "rgba(240,238,232,0.94)",
        scrollbarWidth: "none",
      }}
      // The rail scrolls sideways and nothing else; letting the browser treat
      // a drag on it as a page turn would turn the page you are scrubbing past.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex w-max items-center gap-1.5">
        {titles.map((t, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Chapter ${i + 1}: ${t}`}
            aria-current={i === current}
            onClick={() => onPick(i)}
            className="flex max-w-[8.5rem] shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.66rem] font-bold leading-none"
            style={
              i === current
                ? { background: theme.fg, color: theme.bg }
                : { background: `${theme.fg}14`, color: theme.faint }
            }
          >
            <span className="tabular-nums opacity-70">{i + 1}</span>
            <span className="truncate">{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

/* ====================================================================== */

/**
 * The page scrubber, in the shape Apple Books settled on.
 *
 * A floating pill over the page: a strip of page thumbnails running under a
 * fixed cursor, and whichever page sits under the cursor is the page. It
 * moves like a film roll — throw it and it coasts, slows, and settles with a
 * page exactly under the cursor, ticking once for every page that passes —
 * and wherever it comes to rest is where you land.
 *
 * The motion is run by hand rather than by native scrolling with snap points:
 * native scrolling let a diagonal swipe drag the strip sideways and up, and
 * could leave the page it reported off-centre from the one it showed.
 *
 * Each thumbnail is the real page, laid out at full size exactly as the
 * reader lays it out and scaled down — so its page breaks are the reader's
 * page breaks. An earlier version set the whole chapter again at a tenth of
 * the type size, and at 1.7px text the browser does not honour the size it
 * is given: the tiny layout broke its pages in different places, ran past
 * the end of the strip, and the pages at the end of a chapter came out blank.
 * Only the thumbnails near the cursor are built, so a long chapter costs the
 * same as a short one.
 */
const THUMB_H = 34;
/** How many thumbnails either side of the cursor are built at once. */
const THUMB_WINDOW = 7;

const PageThumb = memo(function PageThumb({
  i, html, label, prefs, theme, box, scale,
}: {
  i: number;
  html: string;
  label: string;
  prefs: ReaderPrefs;
  theme: ReturnType<typeof themeSpec>;
  box: { w: number; h: number };
  scale: number;
}) {
  const markup = useMemo(() => ({ __html: html }), [html]);
  return (
    <div
      aria-hidden
      className="absolute left-0 top-0 origin-top-left"
      style={{ width: box.w, height: box.h, transform: `scale(${scale})`, background: theme.bg }}
    >
      <div className="h-full w-full overflow-hidden">
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
            transform: `translateX(${-i * (box.w + PAGE_GAP)}px)`,
          }}
        >
          {label && (
            <p className="soma-epub-label" style={{ color: theme.faint }}>
              {label}
            </p>
          )}
          <div dangerouslySetInnerHTML={markup} />
        </div>
      </div>
    </div>
  );
});

export const PageScrubber = memo(function PageScrubber({
  theme, prefs, html, label, box, pages, page, onPick, onScrub, prevTitle, nextTitle, onEdge,
}: {
  theme: ReturnType<typeof themeSpec>;
  prefs: ReaderPrefs;
  html: string;
  label: string;
  box: { w: number; h: number };
  pages: number;
  page: number;
  onPick: (page: number) => void;
  onScrub?: (active: boolean) => void;
  /** The chapters either side, if any: pulling past an end goes to them. */
  prevTitle?: string | null;
  nextTitle?: string | null;
  /** Pulled past an end: step into the chapter next door. */
  onEdge?: (dir: -1 | 1) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const scrubbing = useRef(onScrub);
  scrubbing.current = onScrub;
  const edge = useRef(onEdge);
  edge.current = onEdge;

  const scale = box.h ? THUMB_H / box.h : 0.05;
  const cardW = Math.max(14, Math.round(box.w * scale));
  const gapW = Math.max(4, Math.round(PAGE_GAP * scale));
  const stride = cardW + gapW;

  // The strip holds this chapter's pages and nothing else. Pulling it past
  // either end — further than the rubber band gives — steps into the chapter
  // next door, where there is one; there are no cards for them on the strip.
  const lo = 0;
  const hi = pages - 1;
  const bounds = useRef({ lo, hi });
  bounds.current = { lo, hi };
  const hasPrev = !!prevTitle;
  const hasNext = !!nextTitle;

  /**
   * Where the strip is, in pages (fractional while it moves). Driven by hand
   * rather than by native scrolling: the finger only ever moves it sideways —
   * a diagonal swipe can no longer drag it up and down — and the page under
   * the cursor is always exactly in the middle, whatever the pill's width.
   */
  const pos = useRef(page);
  const [under, setUnder] = useState(page);
  const underRef = useRef(page);
  const drag = useRef<{ x: number; pos: number; id: number; samples: { t: number; x: number }[] } | null>(null);
  const anim = useRef(0);
  const preview = useRef(0);

  const paint = (p: number, ms = 0) => {
    const el = strip.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none";
    el.style.transform = `translate3d(${-(cardW / 2 + p * stride)}px, 0, 0)`;
  };

  const mark = (p: number, live: boolean) => {
    const n = Math.round(p);
    if (n === underRef.current) return;
    underRef.current = n;
    setUnder(n);
    if (!live) return;
    // One detent for every page that passes under the cursor.
    tapTick();
    // The book follows the strip while it moves, a frame at a time.
    cancelAnimationFrame(preview.current);
    if (n >= 0 && n < pages) preview.current = requestAnimationFrame(() => pick.current(n));
  };

  // Follow the reader when the page changes from anywhere else — a turn, a
  // search hit, a chapter jump.
  useLayoutEffect(() => {
    if (drag.current) return;
    cancelAnimationFrame(anim.current);
    pos.current = page;
    underRef.current = page;
    setUnder(page);
    paint(page, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages, stride]);

  useEffect(() => () => {
    cancelAnimationFrame(anim.current);
    cancelAnimationFrame(preview.current);
  }, []);

  /** Coast to a page, ticking for each one it passes, then land there. */
  const coast = (target: number) => {
    const from = pos.current;
    const ms = Math.min(700, 180 + Math.abs(target - from) * 45);
    const began = performance.now();
    cancelAnimationFrame(anim.current);
    const run = (now: number) => {
      const k = Math.min(1, (now - began) / ms);
      const e = 1 - (1 - k) ** 3;
      pos.current = from + (target - from) * e;
      paint(pos.current);
      mark(pos.current, true);
      if (k < 1) {
        anim.current = requestAnimationFrame(run);
        return;
      }
      pos.current = target;
      cancelAnimationFrame(preview.current);
      pick.current(target);
      scrubbing.current?.(false);
    };
    anim.current = requestAnimationFrame(run);
  };

  if (!box.w || pages < 1) return null;

  const from = Math.max(0, under - THUMB_WINDOW);
  const to = Math.min(pages - 1, under + THUMB_WINDOW);
  const outline = theme.dark ? "rgba(235,235,245,0.45)" : "rgba(60,60,67,0.4)";

  return (
    <div className="pointer-events-auto min-w-0 flex-1">
      <div className="rounded-full px-2 py-[7px]" style={readerGlass(theme)}>
        <div
          className="relative overflow-hidden"
          // Horizontal only, and nothing else gets the gesture.
          style={{ height: THUMB_H + 6, touchAction: "none" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            cancelAnimationFrame(anim.current);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, pos: pos.current, id: e.pointerId, samples: [{ t: e.timeStamp, x: e.clientX }] };
            scrubbing.current?.(true);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            const { lo: a, hi: b } = bounds.current;
            let p = d.pos - (e.clientX - d.x) / stride;
            // Past the ends it resists, like a rubber band, instead of stopping dead.
            if (p < a) p = a - (a - p) * 0.45;
            if (p > b) p = b + (p - b) * 0.45;
            pos.current = p;
            paint(p);
            mark(Math.max(a, Math.min(b, p)), true);
            d.samples.push({ t: e.timeStamp, x: e.clientX });
            if (d.samples.length > 6) d.samples.shift();
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            drag.current = null;
            const first = d.samples[0]!;
            const last = d.samples[d.samples.length - 1]!;
            const dt = Math.max(1, last.t - first.t);
            // Pages per ms, then thrown: a flick carries on for a few pages.
            const v = e.timeStamp - last.t > 80 ? 0 : -(last.x - first.x) / dt / stride;
            const { lo: a, hi: b } = bounds.current;
            // Pulled well past the first or last page: the chapter next door.
            if (pos.current < a - 0.6 && hasPrev) {
              // Spring back without landing on a page here: the turn below
              // puts the strip on the new chapter's page.
              pos.current = a;
              paint(a, 220);
              scrubbing.current?.(false);
              edge.current?.(-1);
              return;
            }
            if (pos.current > b + 0.6 && hasNext) {
              // Spring back without landing on a page here: the turn below
              // puts the strip on the new chapter's page.
              pos.current = b;
              paint(b, 220);
              scrubbing.current?.(false);
              edge.current?.(1);
              return;
            }
            const moved = Math.abs(e.clientX - d.x) > 4;
            // A tap on a card goes to that card.
            let target = Math.round(pos.current + v * 220);
            if (!moved) {
              const box = e.currentTarget.getBoundingClientRect();
              target = Math.round(pos.current + (e.clientX - (box.left + box.width / 2)) / stride);
            }
            coast(Math.max(a, Math.min(b, target)));
          }}
          onPointerCancel={() => {
            if (!drag.current) return;
            drag.current = null;
            coast(Math.max(bounds.current.lo, Math.min(bounds.current.hi, Math.round(pos.current))));
          }}
        >
          <div
            ref={strip}
            className="absolute left-1/2 top-[3px] will-change-transform"
            style={{ height: THUMB_H, width: stride * pages }}
          >
            {Array.from({ length: pages }, (_, i) => {
              const on = i === under;
              const near = i >= from && i <= to;
              return (
                <div
                  key={i}
                  className="absolute top-0 overflow-hidden rounded-[3px]"
                  style={{
                    left: i * stride,
                    width: cardW,
                    height: THUMB_H,
                    background: theme.bg,
                    zIndex: on ? 2 : 1,
                    // The page under the cursor gets a quiet grey contour all
                    // the way round; the rest are dimmed.
                    boxShadow: on ? `0 0 0 1.5px ${outline}` : `0 0 0 0.5px ${theme.fg}22`,
                  }}
                >
                  {near && (
                    <PageThumb i={i} html={html} label={label} prefs={prefs} theme={theme} box={box} scale={scale} />
                  )}
                  {!on && (
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{ background: theme.dark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.36)" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
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
  const pill = readerGlass(theme);
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
