/**
 * Looking things up: a word's definition, a book's cover and author.
 *
 * This is the only part of SOMA that reaches the network, and it is worth
 * being precise about what that does and does not mean. Nothing is uploaded.
 * No account exists. These are anonymous GETs to two public reference APIs,
 * and the answer is copied into the local log and never fetched again. The app
 * remains an offline app that can occasionally ask a library a question.
 *
 * Which makes the failure path the important one. Every lookup here can fail —
 * aeroplane mode, a blocked network, a service that has gone away — and the
 * answer to all of them is the same: say so, and let the user type it. A
 * feature that only works online has no place in an app whose entire premise
 * is that your data lives on your phone.
 *
 * The parsers are deliberately paranoid. Both services return loosely-shaped
 * JSON that changes without notice, and a missing field must produce a missing
 * value rather than a crash or the string "undefined" written into a log the
 * user keeps for years.
 */

/** Long enough for a slow phone connection, short enough not to feel hung. */
export const LOOKUP_TIMEOUT_MS = 8000;

export type LookupResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export interface WordSense {
  partOfSpeech?: string;
  definition: string;
  example?: string;
}

export interface WordLookup {
  word: string;
  phonetic?: string;
  senses: WordSense[];
  /** Where it came from, shown so a definition is never anonymous. */
  source?: string;
}

export interface BookMatch {
  /** Open Library work key, kept so the same book can be found again. */
  key: string;
  title: string;
  author?: string;
  pages?: number;
  year?: number;
  coverUrl?: string;
}

type Fetcher = typeof fetch;

/** A fetch that gives up rather than hanging a screen forever. */
async function getJson(url: string, doFetch: Fetcher, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await doFetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : undefined;
};

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// ------------------------------------------------------------- dictionary --

/**
 * Wiktionary's REST definition endpoint, with Datamuse (WordNet) as the
 * fallback when it cannot answer.
 *
 * dictionaryapi.dev was the original provider and went away; every lookup
 * came back "Could not reach the dictionary" through no fault of the app.
 * Two providers, each queried in turn, means one of them having a bad day
 * is a slower answer rather than a missing one — and both are public,
 * keyless and CORS-open, so the app stays anonymous and offline-first.
 */
export const WIKTIONARY_URL = "https://en.wiktionary.org/api/rest_v1/page/definition";
export const DATAMUSE_URL = "https://api.datamuse.com/words";

/**
 * Pull the useful parts out of a Wiktionary rest_v1/page/definition response.
 *
 * Exported separately from the fetch so the shape-handling can be tested
 * against recorded payloads without a network — which matters, because the
 * network is the part that cannot be tested.
 */
export function parseWord(raw: unknown, fallbackWord: string): WordLookup | null {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const entries = Array.isArray(root?.en) ? root.en : null;
  if (!entries?.length) return null;

  const senses: WordSense[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const pos = str(e.partOfSpeech);
    for (const d of Array.isArray(e.definitions) ? e.definitions : []) {
      const dd = (d ?? {}) as Record<string, unknown>;
      const definition = str(dd.definition);
      if (!definition) continue;
      const examples = Array.isArray(dd.examples) ? dd.examples : [];
      const example = str(examples[0]);
      senses.push({ partOfSpeech: pos, definition, example });
      if (senses.length >= 3) return { word: fallbackWord, senses, source: "Wiktionary" };
    }
  }

  if (!senses.length) return null;
  return { word: fallbackWord, senses, source: "Wiktionary" };
}

/**
 * Pull the useful parts out of a Datamuse response.
 *
 * Datamuse's `md=dp` returns definitions as `"pos\tdefinition"` strings, and
 * `tags` carries the part of speech separately — both are read defensively,
 * because either may be absent on any given entry.
 */
export function parseDatamuse(raw: unknown, fallbackWord: string): WordLookup | null {
  const list = Array.isArray(raw) ? raw : null;
  const entry = list?.[0] && typeof list[0] === "object" ? (list[0] as Record<string, unknown>) : null;
  if (!entry) return null;

  const senses: WordSense[] = [];
  for (const d of Array.isArray(entry.defs) ? entry.defs.slice(0, 3) : []) {
    const parts = String(d).split("\t");
    const pos = str(parts[0]) ?? (Array.isArray(entry.tags) ? str(entry.tags[0]) : undefined);
    const definition = str(parts[1]) ?? str(parts[0]);
    if (definition) senses.push({ partOfSpeech: pos, definition });
  }
  if (!senses.length) return null;
  const word = str(entry.word) ?? fallbackWord;
  return { word, senses, source: "WordNet via Datamuse" };
}

export async function lookupWord(
  word: string,
  opts: { lang?: string; fetch?: Fetcher; signal?: AbortSignal } = {},
): Promise<LookupResult<WordLookup>> {
  const term = word.trim();
  if (!term) return { ok: false, reason: "Type a word first." };
  const doFetch = opts.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    return { ok: false, reason: "This device cannot reach the dictionary." };
  }

  const lang = (opts.lang || "en").toLowerCase();
  if (lang !== "en") {
    // Wiktionary's REST definition endpoint is English-only per language
    // subdomain; other languages have never been wired here and the fallback
    // below is English too, so refuse plainly rather than answer in the
    // wrong language.
    return { ok: false, reason: "Definitions are available in English for now." };
  }

  const tryFetch = async (url: string): Promise<unknown> => {
    try {
      return await getJson(url, doFetch, opts.signal);
    } catch {
      return undefined; // network failure — let the next provider try
    }
  };

  const wik = await tryFetch(`${WIKTIONARY_URL}/${encodeURIComponent(term)}`);
  const fromWik = wik === undefined ? undefined : parseWord(wik, term);
  if (fromWik) return { ok: true, value: fromWik };

  const dm = await tryFetch(`${DATAMUSE_URL}?sp=${encodeURIComponent(term)}&md=dp&max=1`);
  const fromDm = dm === undefined ? undefined : parseDatamuse(dm, term);
  if (fromDm) return { ok: true, value: fromDm };

  if (wik === undefined && dm === undefined) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return {
      ok: false,
      reason: offline
        ? "You are offline — type the definition and it will be kept."
        : "Could not reach the dictionary. Type it in instead.",
    };
  }
  return { ok: false, reason: `No definition found for "${term}".` };
}

// ------------------------------------------------------------------ books --

export const OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json";
export const OPENLIBRARY_COVER = "https://covers.openlibrary.org/b/id";

/**
 * Open Library serves three sizes and the middle one is not enough.
 *
 * `-M` is about 180px on the long edge. A cover on the shelf is 108 CSS px
 * wide, which is 324 real pixels on a phone, and the one in the sheet is 450 —
 * so the medium file was being blown up two or three times and every cover
 * looked soft. `-L` is the largest available and is what gets fetched now; the
 * photo store keeps up to 1080px, so nothing else was throwing detail away.
 */
export function coverUrl(id: unknown, size: "S" | "M" | "L" = "L"): string | undefined {
  const n = num(id);
  return n ? `${OPENLIBRARY_COVER}/${n}-${size}.jpg` : undefined;
}

/**
 * Point an older, smaller cover link at the large file.
 *
 * Books added before the size was fixed carry a `-M` link AND a `-M` copy of
 * the bytes, so they would stay soft for ever without something that notices.
 * Returns null when there is nothing to upgrade, which is what keeps the fix
 * from running twice on the same book.
 */
export function upgradeCoverUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(`${OPENLIBRARY_COVER}/`)) return null;
  const better = url.replace(/-[SM]\.jpg$/, "-L.jpg");
  return better === url ? null : better;
}

export function parseBooks(raw: unknown, limit = 5): BookMatch[] {
  const docs = (raw as Record<string, unknown>)?.docs;
  if (!Array.isArray(docs)) return [];
  const out: BookMatch[] = [];
  for (const doc of docs) {
    const d = doc as Record<string, unknown>;
    const title = str(d.title);
    const key = str(d.key);
    if (!title || !key) continue;
    out.push({
      key,
      title,
      author: Array.isArray(d.author_name) ? str(d.author_name[0]) : undefined,
      // The MEDIAN across editions, not one edition's count. Editions of the
      // same book differ by hundreds of pages, and a progress bar against the
      // wrong one is worse than no progress bar.
      pages: num(d.number_of_pages_median),
      year: num(d.first_publish_year),
      coverUrl: coverUrl(d.cover_i),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchBooks(
  query: string,
  opts: { fetch?: Fetcher; signal?: AbortSignal; limit?: number } = {},
): Promise<LookupResult<BookMatch[]>> {
  const q = query.trim();
  if (!q) return { ok: false, reason: "Type a title or an author first." };
  const doFetch = opts.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    return { ok: false, reason: "This device cannot reach the catalogue." };
  }

  const limit = opts.limit ?? 5;
  // Only the fields actually used. The unfiltered response is enormous, and
  // this runs on a phone connection.
  const fields = "key,title,author_name,cover_i,number_of_pages_median,first_publish_year";
  try {
    const raw = await getJson(
      `${OPENLIBRARY_SEARCH}?q=${encodeURIComponent(q)}&limit=${limit}&fields=${fields}`,
      doFetch,
      opts.signal,
    );
    const books = parseBooks(raw, limit);
    if (!books.length) return { ok: false, reason: `Nothing found for "${q}".` };
    return { ok: true, value: books };
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return {
      ok: false,
      reason: offline
        ? "You are offline — add the book by hand and it will be kept."
        : "Could not reach the catalogue. Add the book by hand instead.",
    };
  }
}

// --------------------------------------------------------------- progress --

/** How far through, as a percentage. Null when there is nothing to divide by. */
export function readProgress(page?: number, pages?: number): number | null {
  const p = Number(page) || 0;
  const total = Number(pages) || 0;
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((p / total) * 100)));
}

/** "142 of 254 · 56%", or what is known of it. */
export function progressLabel(page?: number, pages?: number): string {
  const pct = readProgress(page, pages);
  const p = Number(page) || 0;
  if (pct == null) return p > 0 ? `page ${p}` : "not started";
  return `${p} of ${pages} · ${pct}%`;
}
