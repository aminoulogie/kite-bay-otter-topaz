import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Highlighter, List, Search, Star, Trash2, X } from "lucide-react";
import { MIN_QUERY, findIn, tally, type Hit } from "@/lib/book-search";
import { markChip, type BookMark } from "@/lib/marks";
import { fontStack, type ReaderPrefs, type themeSpec } from "@/lib/reader-prefs";
import { pageCount } from "@/lib/paginate";
import type { MindEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { tapTick, tickReady } from "@/lib/haptics";

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
        className="soma-expand flex max-h-[82vh] flex-col rounded-t-3xl px-4 pb-[max(18px,var(--safe-bottom,env(safe-area-inset-bottom)))] pt-4"
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

const THUMB_H = 34;
/** Slots either side of the cursor that get a frame drawn. */
const FRAME_WINDOW = 26;

/**
 * One chapter, laid out at full size exactly as the reader lays it out and
 * scaled down to the strip: every one of its pages side by side in ONE
 * element. The gap between columns is widened to the strip's gap, which
 * changes nothing about where the pages break (the column width and height
 * are the reader's), so each column lands on its own slot.
 *
 * One layout per chapter rather than one per thumbnail: a thumbnail per page
 * meant laying the whole chapter out again for every page, which is why only
 * the few nearest the cursor were ever drawn and the rest of the strip was
 * empty.
 */
const ChapterFilm = memo(function ChapterFilm({
  index, left, html, label, prefs, theme, box, scale, gap, onMeasured,
}: {
  index: number;
  left: number;
  html: string;
  label: string;
  prefs: ReaderPrefs;
  theme: ReturnType<typeof themeSpec>;
  box: { w: number; h: number };
  scale: number;
  /** The gap between pages, in the chapter's own (unscaled) pixels. */
  gap: number;
  onMeasured: (index: number, pages: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => ({ __html: html }), [html]);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const measure = () => onMeasured(index, pageCount(node.scrollWidth, box.w, gap));
    measure();
    // Images arrive after the text and can push pages on.
    const imgs = node.querySelectorAll("img");
    imgs.forEach((img) => img.addEventListener("load", measure, { once: true }));
    return () => imgs.forEach((img) => img.removeEventListener("load", measure));
  }, [index, html, label, box.w, box.h, gap, prefs.font, prefs.size, prefs.lineHeight, onMeasured]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 origin-top-left"
      style={{ left, transform: `scale(${scale})` }}
    >
      <div
        ref={el}
        className="soma-epub"
        style={{
          width: `${box.w}px`,
          height: `${box.h}px`,
          fontFamily: fontStack(prefs.font),
          fontSize: `${prefs.size}px`,
          lineHeight: prefs.lineHeight,
          color: theme.fg,
          columnWidth: `${box.w}px`,
          columnGap: `${gap}px`,
          columnFill: "auto",
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
  );
});

/**
 * The page scrubber, in the shape Apple Books settled on: a film strip of
 * every page in the book running under a fixed cursor. Throw it and it
 * coasts, ticking once for each page that passes, and wherever it stops is
 * where you land — in this chapter or any other.
 *
 * Run by hand rather than by native scrolling: native scrolling let a
 * diagonal swipe drag the strip up and down too, and could report a page
 * other than the one in the middle.
 *
 * Chapters near the cursor are laid out for real (see ChapterFilm) and report
 * their true page counts; the rest are counted from their length until they
 * come near. When a count behind the cursor corrects itself the strip is
 * shifted by the same amount, so nothing moves under your finger.
 */
export const PageScrubber = memo(function PageScrubber({
  theme, prefs, box, chapter, page, pages, chapters, partOf, estimate, onPick, onJump, onScrub,
}: {
  theme: ReturnType<typeof themeSpec>;
  prefs: ReaderPrefs;
  box: { w: number; h: number };
  /** The chapter on screen, and its page and real page count. */
  chapter: number;
  page: number;
  pages: number;
  chapters: number;
  /** A chapter's markup and title. */
  partOf: (index: number) => { html: string; title: string } | null;
  /** Pages a chapter not yet laid out is expected to have. */
  estimate: (index: number) => number;
  /** Land on a page of the chapter on screen. */
  onPick: (page: number) => void;
  /** Land on a page of another chapter. */
  onJump: (chapter: number, page: number) => void;
  onScrub?: (active: boolean) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const jump = useRef(onJump);
  jump.current = onJump;
  const scrubbing = useRef(onScrub);
  scrubbing.current = onScrub;

  const scale = box.h ? THUMB_H / box.h : 0.05;
  const cardW = Math.max(14, box.w * scale);
  const gapW = 4;
  const stride = cardW + gapW;
  const gap = gapW / scale;

  // Measured page counts, per chapter, for this layout of the type.
  const typeKey = `${prefs.font}|${prefs.size}|${prefs.lineHeight}|${box.w}x${box.h}`;
  const [measured, setMeasured] = useState<{ key: string; n: Record<number, number> }>({ key: typeKey, n: {} });
  const counts = useMemo(() => {
    const n = measured.key === typeKey ? measured.n : {};
    return Array.from({ length: Math.max(1, chapters) }, (_, i) =>
      i === chapter ? Math.max(1, pages) : n[i] ?? Math.max(1, estimate(i)),
    );
  }, [measured, typeKey, chapters, chapter, pages, estimate]);
  const offsets = useMemo(() => {
    const out = [0];
    for (const c of counts) out.push(out[out.length - 1]! + c);
    return out;
  }, [counts]);
  const total = offsets[offsets.length - 1]!;
  const chapterAt = (g: number) => {
    let lo = 0;
    let hi = counts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid]! <= g) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const view = useRef({ offsets, total, chapterAt, chapter });
  view.current = { offsets, total, chapterAt, chapter };

  /** Where the strip is, in pages of the whole book (fractional mid-move). */
  const here = offsets[chapter]! + Math.min(page, counts[chapter]! - 1);
  const pos = useRef(here);
  const [under, setUnder] = useState(here);
  const underRef = useRef(here);
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
    // Within the chapter on screen the book follows the strip as it moves.
    // Another chapter is only opened where the strip comes to rest: opening
    // every chapter the strip passes would reflow the book dozens of times.
    const v = view.current;
    const c = v.chapterAt(n);
    cancelAnimationFrame(preview.current);
    if (c === v.chapter) preview.current = requestAnimationFrame(() => pick.current(n - v.offsets[c]!));
  };

  const land = (g: number) => {
    const v = view.current;
    const c = v.chapterAt(g);
    const p = g - v.offsets[c]!;
    if (c === v.chapter) pick.current(p);
    else jump.current(c, p);
  };

  // Follow the reader when the page changes from anywhere else, and when a
  // count corrects itself. Never mid-drag: the finger owns the strip then.
  useLayoutEffect(() => {
    if (drag.current || anim.current) return;
    pos.current = here;
    underRef.current = here;
    setUnder(here);
    paint(here, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, stride]);

  useEffect(() => () => {
    cancelAnimationFrame(anim.current);
    cancelAnimationFrame(preview.current);
  }, []);

  const onMeasured = useCallback((index: number, n: number) => {
    setMeasured((cur) => {
      const base = cur.key === typeKey ? cur.n : {};
      if (base[index] === n) return cur;
      // A chapter behind the cursor changed length: move the strip with it,
      // so the page under the finger stays under the finger.
      const v = view.current;
      if (index < v.chapterAt(pos.current) && index !== v.chapter) {
        const old = base[index] ?? Math.max(1, estimate(index));
        const d = n - old;
        if (d) {
          pos.current += d;
          if (drag.current) drag.current.pos += d;
          underRef.current += d;
          paint(pos.current);
        }
      }
      return { key: typeKey, n: { ...base, [index]: n } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeKey, estimate]);

  /** Coast to a page, ticking for each one it passes, then land there. */
  const coast = (target: number) => {
    const from = pos.current;
    const ms = Math.min(700, 180 + Math.abs(target - from) * 40);
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
      anim.current = 0;
      pos.current = target;
      cancelAnimationFrame(preview.current);
      land(target);
      scrubbing.current?.(false);
    };
    anim.current = requestAnimationFrame(run);
  };

  if (!box.w || chapters < 1) return null;

  // Chapters with a page within reach of the cursor, and always the ones
  // either side of it, are laid out; the rest of the strip is empty frames
  // until it gets there.
  const lo = Math.max(0, under - FRAME_WINDOW);
  const hi = Math.min(total - 1, under + FRAME_WINDOW);
  const near = new Set<number>();
  for (let c = chapterAt(lo); c <= chapterAt(hi); c++) near.add(c);
  const mid = chapterAt(under);
  if (mid > 0) near.add(mid - 1);
  if (mid + 1 < chapters) near.add(mid + 1);
  const outline = theme.dark ? "rgba(235,235,245,0.45)" : "rgba(60,60,67,0.4)";
  const slots: number[] = [];
  for (let g = lo; g <= hi; g++) slots.push(g);

  return (
    <div className="pointer-events-auto min-w-0 flex-1">
      <div className="rounded-full px-2 py-[7px]" style={readerGlass(theme)}>
        <div
          className="relative select-none overflow-hidden"
          // Sideways only, and nothing else gets the gesture: not a scroll,
          // not a text selection, not a drag of the thumbnails' own text or
          // pictures — any of which cancels the pointer mid-swipe.
          style={{ height: THUMB_H + 6, touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
          onDragStart={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            tickReady();
            cancelAnimationFrame(anim.current);
            anim.current = 0;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, pos: pos.current, id: e.pointerId, samples: [{ t: e.timeStamp, x: e.clientX }] };
            scrubbing.current?.(true);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            const last = view.current.total - 1;
            let p = d.pos - (e.clientX - d.x) / stride;
            // Past the ends of the book it resists, like a rubber band.
            if (p < 0) p *= 0.35;
            if (p > last) p = last + (p - last) * 0.35;
            pos.current = p;
            paint(p);
            mark(Math.max(0, Math.min(last, p)), true);
            d.samples.push({ t: e.timeStamp, x: e.clientX });
            if (d.samples.length > 6) d.samples.shift();
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            drag.current = null;
            const first = d.samples[0]!;
            const lastS = d.samples[d.samples.length - 1]!;
            const dt = Math.max(1, lastS.t - first.t);
            // Pages per ms, thrown: a flick carries on for a few pages.
            const v = e.timeStamp - lastS.t > 80 ? 0 : -(lastS.x - first.x) / dt / stride;
            const moved = Math.abs(e.clientX - d.x) > 4;
            let target = Math.round(pos.current + v * 240);
            if (!moved) {
              // A tap on a thumbnail goes to that page.
              const r = e.currentTarget.getBoundingClientRect();
              target = Math.round(pos.current + (e.clientX - (r.left + r.width / 2)) / stride);
            }
            coast(Math.max(0, Math.min(view.current.total - 1, target)));
          }}
          onPointerCancel={() => {
            if (!drag.current) return;
            drag.current = null;
            coast(Math.max(0, Math.min(view.current.total - 1, Math.round(pos.current))));
          }}
        >
          <div
            ref={strip}
            className="absolute left-1/2 top-[3px] will-change-transform"
            style={{ height: THUMB_H, width: stride * total }}
          >
            {/* Paper under every page within reach. */}
            {slots.map((g) => (
              <div
                key={`p${g}`}
                className="absolute top-0 rounded-[3px]"
                style={{ left: g * stride, width: cardW, height: THUMB_H, background: theme.bg, boxShadow: `0 0 0 0.5px ${theme.fg}22` }}
              />
            ))}
            {/* The pages themselves: one layout per chapter. */}
            {[...near].map((c) => {
              const part = c === chapter || near.has(c) ? partOf(c) : null;
              if (!part) return null;
              return (
                <div
                  key={`c${c}`}
                  className="absolute top-0 overflow-hidden"
                  style={{ left: offsets[c]! * stride, width: counts[c]! * stride - gapW, height: THUMB_H }}
                >
                  <ChapterFilm
                    index={c}
                    left={0}
                    html={part.html}
                    label={part.title}
                    prefs={prefs}
                    theme={theme}
                    box={box}
                    scale={scale}
                    gap={gap}
                    onMeasured={onMeasured}
                  />
                </div>
              );
            })}
            {/* Every page but the one under the cursor is dimmed; that one
                gets a quiet grey contour all the way round. */}
            {slots.map((g) =>
              g === under ? (
                <div
                  key={`o${g}`}
                  className="pointer-events-none absolute top-0 z-[2] rounded-[3px]"
                  style={{ left: g * stride, width: cardW, height: THUMB_H, boxShadow: `0 0 0 1.5px ${outline}` }}
                />
              ) : (
                <div
                  key={`o${g}`}
                  className="pointer-events-none absolute top-0 rounded-[3px]"
                  style={{
                    left: g * stride,
                    width: cardW,
                    height: THUMB_H,
                    background: theme.dark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.36)",
                  }}
                />
              ),
            )}
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
        "pt-[max(10px,var(--safe-top,env(safe-area-inset-top)))]",
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
