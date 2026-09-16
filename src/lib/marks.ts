/**
 * Highlighting a passage: the colours, and where the ink goes.
 *
 * A highlight is stored as a RANGE OF CHARACTERS in the chapter, not as a
 * rectangle on a screen — the same decision, and for the same reason, as the
 * reading position in lib/anchor.ts. Where a word sits on the page depends on
 * the type size, the font and the width of the phone; which characters it is
 * does not. Store the rectangle and every highlight slides off its word the
 * first time the reader changes the type. Store the characters and it is the
 * same word on a different phone five years later.
 *
 * Drawing them is then a matter of asking the browser where those characters
 * ended up, which is what `rowsOf` is for: a Range over several lines reports
 * one rectangle per line box, and a highlighter pen draws one stroke per line.
 *
 * Pure, so the palette, the overlap rules and the row-merging can be tested
 * without a page to draw them on.
 */

export interface MarkColour {
  id: string;
  label: string;
  /** The swatch in the menu: solid, so the choice is legible on any paper. */
  chip: string;
  /** Over dark text on a pale page. */
  light: string;
  /** Over pale text on a dark page, where the same ink would be a blackout. */
  dark: string;
}

/**
 * Five pastels, and no colour picker.
 *
 * A highlighter is for saying "this one", and after that "this one is a
 * different kind of this one". Five is enough for that and few enough to put
 * in a row under your thumb. They are pale on purpose: a highlight has to sit
 * UNDER the words without swallowing them, which is the whole difference
 * between a marked book and a defaced one.
 *
 * Each carries two inks because a page has two kinds of paper. The same
 * translucent yellow that reads as a soft wash on white reads as a smear of
 * mud on black, so the night ink is thinner and a touch brighter.
 */
export const MARK_COLOURS: MarkColour[] = [
  {
    id: "butter",
    label: "Butter",
    chip: "#ffd98a",
    light: "rgba(255, 209, 112, 0.58)",
    dark: "rgba(255, 203, 90, 0.30)",
  },
  {
    id: "mint",
    label: "Mint",
    chip: "#a6e3c4",
    light: "rgba(140, 224, 189, 0.55)",
    dark: "rgba(104, 226, 176, 0.26)",
  },
  {
    id: "sky",
    label: "Sky",
    chip: "#a8d2ff",
    light: "rgba(146, 198, 255, 0.58)",
    dark: "rgba(116, 178, 255, 0.30)",
  },
  {
    id: "blossom",
    label: "Blossom",
    chip: "#ffb6cd",
    light: "rgba(255, 170, 200, 0.55)",
    dark: "rgba(255, 140, 184, 0.26)",
  },
  {
    id: "lilac",
    label: "Lilac",
    chip: "#cdbaff",
    light: "rgba(198, 176, 255, 0.55)",
    dark: "rgba(176, 146, 255, 0.30)",
  },
];

export const DEFAULT_MARK = MARK_COLOURS[0]!.id;

export function markColour(id: string | undefined, dark: boolean): string {
  const c = MARK_COLOURS.find((m) => m.id === id) ?? MARK_COLOURS[0]!;
  return dark ? c.dark : c.light;
}

export function markChip(id: string | undefined): string {
  return (MARK_COLOURS.find((m) => m.id === id) ?? MARK_COLOURS[0]!).chip;
}

/** One highlight: which chapter, which characters, which colour. */
export interface BookMark {
  id: string;
  /** Index of the chapter, matching MindEntry.page - 1. */
  chapter: number;
  /** Character offsets into the chapter's text, start inclusive, end after. */
  start: number;
  end: number;
  colour: string;
  /** What it said, so the list of highlights can be read away from the book. */
  text: string;
  /**
   * When it was drawn, in epoch milliseconds. Optional, and it has to be:
   * every highlight made before this existed has no date and must not vanish
   * from a list because of it. Undated ones sort as oldest, which is true.
   */
  at?: number;
}

/**
 * A stored highlight, checked before it is trusted.
 *
 * These come back from a backup file, which means they come back from
 * anywhere. A highlight with a end before its start, or a colour this version
 * has never heard of, must not be able to throw while a chapter is painting.
 */
export function cleanMark(value: unknown): BookMark | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const id = typeof v.id === "string" && v.id ? v.id : null;
  const chapter = Number(v.chapter);
  const start = Number(v.start);
  const end = Number(v.end);
  if (!id) return null;
  if (!Number.isFinite(chapter) || chapter < 0) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(start, end);
  if (to <= from) return null;
  const text = typeof v.text === "string" ? v.text : "";
  const colour = MARK_COLOURS.some((m) => m.id === v.colour) ? (v.colour as string) : DEFAULT_MARK;
  const stamp = Number(v.at);
  const at = Number.isFinite(stamp) && stamp > 0 ? Math.round(stamp) : undefined;
  return {
    id, chapter: Math.round(chapter), start: Math.round(from), end: Math.round(to), colour, text,
    ...(at === undefined ? {} : { at }),
  };
}

export function cleanMarks(value: unknown): BookMark[] {
  if (!Array.isArray(value)) return [];
  const out: BookMark[] = [];
  for (const raw of value) {
    const m = cleanMark(raw);
    if (m) out.push(m);
  }
  return out;
}

/** Whether two spans in the same chapter touch at all. */
export function overlaps(a: BookMark, b: { chapter: number; start: number; end: number }): boolean {
  return a.chapter === b.chapter && a.start < b.end && b.start < a.end;
}

/**
 * Add a highlight, absorbing anything it lands on.
 *
 * Highlighting a phrase that already contains a highlighted word should leave
 * ONE highlight in the new colour, not two stacked inks reading as a third
 * colour nobody chose. So an overlapping mark is swallowed and its span joined
 * — which is also what makes re-marking in a different colour work: the same
 * words, one ink, the last one you picked.
 */
export function addMark(list: readonly BookMark[], mark: BookMark): BookMark[] {
  let { start, end } = mark;
  const kept: BookMark[] = [];
  for (const m of list) {
    if (overlaps(m, { chapter: mark.chapter, start, end })) {
      start = Math.min(start, m.start);
      end = Math.max(end, m.end);
      continue;
    }
    kept.push(m);
  }
  kept.push({ ...mark, start, end });
  return kept.sort((a, b) => (a.chapter - b.chapter) || (a.start - b.start));
}

export function removeMark(list: readonly BookMark[], id: string): BookMark[] {
  return list.filter((m) => m.id !== id);
}

/** The highlight covering a character, if any. Used to rub one out again. */
export function markAt(
  list: readonly BookMark[],
  chapter: number,
  offset: number,
): BookMark | null {
  return list.find((m) => m.chapter === chapter && offset >= m.start && offset < m.end) ?? null;
}

export interface Row {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Turn a Range's client rectangles into one stroke per line.
 *
 * The browser hands back a rectangle per line box, and sometimes several per
 * line — a line with a bold word in it comes back in three pieces, and a line
 * ending in a space comes back with a sliver on the end. Drawn as they are,
 * that is a highlighter with a stutter: visible seams inside a word, and a
 * rounded cap in the middle of a line.
 *
 * So rectangles sharing a line are merged into one, and hairline fragments —
 * the empty rect at a line break, the zero-width one at a node boundary — are
 * dropped. Lines are matched by their vertical middle rather than by equality,
 * because a superscript on a line reports a taller box on the same line.
 */
export function rowsOf(rects: readonly Row[], pad = 0): Row[] {
  const real = rects.filter((r) => r.w > 0.5 && r.h > 0.5);
  const rows: Row[] = [];
  for (const r of real) {
    const mid = r.y + r.h / 2;
    const row = rows.find((o) => mid >= o.y && mid <= o.y + o.h);
    if (!row) {
      rows.push({ ...r });
      continue;
    }
    const left = Math.min(row.x, r.x);
    const right = Math.max(row.x + row.w, r.x + r.w);
    const top = Math.min(row.y, r.y);
    const bottom = Math.max(row.y + row.h, r.y + r.h);
    row.x = left;
    row.y = top;
    row.w = right - left;
    row.h = bottom - top;
  }
  if (!pad) return rows;
  return rows.map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }));
}
