import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Highlighter, List, Search, Star, Trash2, X } from "lucide-react";
import { MIN_QUERY, findIn, tally, type Hit } from "@/lib/book-search";
import { markChip, type BookMark } from "@/lib/marks";
import { type themeSpec } from "@/lib/reader-prefs";
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
  const pill = {
    background: theme.dark ? "rgba(58,58,62,0.82)" : "rgba(236,234,228,0.88)",
    color: theme.fg,
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
        className={cn("flex items-center rounded-full px-1 backdrop-blur-xl", show && "pointer-events-auto")}
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
        className={cn("flex items-center rounded-full px-1 backdrop-blur-xl", show && "pointer-events-auto")}
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
