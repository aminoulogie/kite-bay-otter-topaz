/**
 * How the book looks, and what happens when you tap it.
 *
 * A reading app's settings are not decoration. Type size is the difference
 * between reading on a train and not; a night theme is the difference between
 * reading in bed and putting the phone down. iBooks has had all of this since
 * 2010 and every one of its choices is worth copying — which is why the fonts
 * below are the ones a phone actually has rather than a wish list, and why
 * every number has a floor and a ceiling that keep a page readable at either
 * end of it.
 *
 * Pure, so the clamping and the round-tripping can be tested without a screen.
 */

export type ReaderTheme = "paper" | "sepia" | "night";

export type TurnStyle = "curl" | "slide" | "scroll";

export const TURN_STYLES: { id: TurnStyle; label: string; note: string }[] = [
  { id: "curl", label: "Curl", note: "Folds like paper." },
  { id: "slide", label: "Slide", note: "Pushes across." },
  { id: "scroll", label: "Scroll", note: "One long chapter." },
];

export interface ReaderThemeSpec {
  id: ReaderTheme;
  label: string;
  /** The page. */
  bg: string;
  /** The text. */
  fg: string;
  /** Headings, which sit slightly above the body on every theme. */
  strong: string;
  /** Chapter labels and furniture. */
  faint: string;
  /** A highlighted line, and a selected word. */
  mark: string;
  /** Whether the chrome over the page should be light or dark. */
  dark: boolean;
}

/**
 * Three papers, not a colour picker.
 *
 * Paper for daylight, sepia for a lamp, night for the dark. The middle one is
 * not a novelty: a warm low-contrast page is measurably easier to read for an
 * hour than pure white, which is why every e-reader ships it.
 */
export const READER_THEMES: ReaderThemeSpec[] = [
  {
    id: "paper",
    label: "Paper",
    bg: "#f8f6f1",
    fg: "#1b1a17",
    strong: "#000000",
    faint: "#8a8578",
    mark: "rgba(255, 214, 10, 0.42)",
    dark: false,
  },
  {
    id: "sepia",
    label: "Sepia",
    bg: "#f2e6ce",
    fg: "#3b2f1e",
    strong: "#1f1708",
    faint: "#9a8a6d",
    mark: "rgba(214, 138, 10, 0.34)",
    dark: false,
  },
  {
    id: "night",
    label: "Night",
    bg: "#0b0b0d",
    fg: "#e8e6e2",
    strong: "#ffffff",
    faint: "#77736c",
    mark: "rgba(120, 170, 255, 0.30)",
    dark: true,
  },
];

export function themeSpec(id: ReaderTheme): ReaderThemeSpec {
  return READER_THEMES.find((t) => t.id === id) ?? READER_THEMES[0]!;
}

export interface ReaderFont {
  id: string;
  label: string;
  stack: string;
}

/**
 * Six typefaces the phone already has.
 *
 * Nothing is downloaded. A web font is a request that fails on a plane and a
 * page that reflows after it arrives — and a book is the one screen where a
 * reflow after you have started reading is unforgivable. Every stack ends in
 * a generic so a device without the named face still gets the right KIND of
 * letter rather than falling back to whatever the body font happens to be.
 */
export const READER_FONTS: ReaderFont[] = [
  { id: "new-york", label: "New York", stack: 'ui-serif, "New York", Georgia, serif' },
  { id: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { id: "iowan", label: "Iowan", stack: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' },
  { id: "palatino", label: "Palatino", stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { id: "system", label: "San Francisco", stack: 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif' },
  { id: "avenir", label: "Avenir", stack: '"Avenir Next", Avenir, "Segoe UI", ui-sans-serif, sans-serif' },
];

export function fontStack(id: string): string {
  return (READER_FONTS.find((f) => f.id === id) ?? READER_FONTS[0]!).stack;
}

export interface ReaderPrefs {
  theme: ReaderTheme;
  /** A READER_FONTS id. */
  font: string;
  /** Body size in px. */
  size: number;
  /** Unitless, the way a line height should be. */
  lineHeight: number;
  /** Side margin in px — the white space either side of the column. */
  margin: number;
  /**
   * How a page gives way to the next one.
   *
   * "curl" folds it like paper, "slide" pushes it across, "scroll" admits
   * that an EPUB has no pages and lets you scroll the chapter. It replaced a
   * `paged` boolean, which is still read on the way in so nobody's setting is
   * lost — see cleanReader.
   */
  turn: TurnStyle;
  /** Light one line at a time and dim the rest. */
  lineFocus: boolean;
}

export const SIZE = { min: 14, max: 30, step: 1, default: 18 } as const;
export const LINE_HEIGHT = { min: 1.2, max: 2.2, step: 0.1, default: 1.7 } as const;
export const MARGIN = { min: 8, max: 56, step: 8, default: 20 } as const;

export const DEFAULT_READER: ReaderPrefs = {
  theme: "night",
  font: "new-york",
  size: SIZE.default,
  lineHeight: LINE_HEIGHT.default,
  margin: MARGIN.default,
  turn: "curl",
  lineFocus: false,
};

/** Whether this style cuts the chapter into pages at all. */
export function isPaged(prefs: ReaderPrefs): boolean {
  return prefs.turn !== "scroll";
}

function clamp(value: unknown, range: { min: number; max: number }, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(range.max, Math.max(range.min, n));
}

/**
 * A stored preference object, made safe.
 *
 * These ride in the backup and therefore come back from a file someone may
 * have edited, from an older version of the app, or from a phone whose
 * settings predate half these fields. A reader that will not open because its
 * font id is unknown is a worse outcome than a reader in the wrong font.
 */
export function cleanReader(value: unknown): ReaderPrefs {
  // `paged` is not a field any more, but a stored preference may still carry
  // it, so the type here is "whatever was in the file" rather than the type
  // this version happens to use.
  const v = (value ?? {}) as Partial<Record<keyof ReaderPrefs | "paged", unknown>>;
  const theme = READER_THEMES.some((t) => t.id === v.theme)
    ? (v.theme as ReaderTheme)
    : DEFAULT_READER.theme;
  const font = READER_FONTS.some((f) => f.id === v.font)
    ? (v.font as string)
    : DEFAULT_READER.font;
  return {
    theme,
    font,
    size: Math.round(clamp(v.size, SIZE, SIZE.default)),
    // One decimal place: 1.7000000000000002 is what repeated stepping gives
    // you, and it reaches the backup file as exactly that.
    lineHeight: Math.round(clamp(v.lineHeight, LINE_HEIGHT, LINE_HEIGHT.default) * 10) / 10,
    margin: Math.round(clamp(v.margin, MARGIN, MARGIN.default)),
    // `turn` replaced a `paged` boolean. A stored `false` meant scrolling and
    // still does; anything else from before this existed gets the new default,
    // which is the whole reason the old key is still read here.
    turn: TURN_STYLES.some((t) => t.id === v.turn)
      ? (v.turn as TurnStyle)
      : v.paged === false
        ? "scroll"
        : DEFAULT_READER.turn,
    lineFocus: v.lineFocus === true,
  };
}

/** One press of the bigger/smaller control, clamped at both ends. */
export function step(
  prefs: ReaderPrefs,
  key: "size" | "lineHeight" | "margin",
  direction: 1 | -1,
): ReaderPrefs {
  const range = key === "size" ? SIZE : key === "lineHeight" ? LINE_HEIGHT : MARGIN;
  return cleanReader({ ...prefs, [key]: prefs[key] + range.step * direction });
}

/** True when nothing has been changed from what the app ships with. */
export function isDefaultReader(prefs: ReaderPrefs): boolean {
  const a = cleanReader(prefs);
  return (Object.keys(DEFAULT_READER) as (keyof ReaderPrefs)[]).every(
    (k) => a[k] === DEFAULT_READER[k],
  );
}
