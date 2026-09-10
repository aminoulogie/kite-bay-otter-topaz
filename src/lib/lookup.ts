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

export const DICTIONARY_URL = "https://api.dictionaryapi.dev/api/v2/entries";

/**
 * Pull the useful parts out of a dictionaryapi.dev response.
 *
 * Exported separately from the fetch so the shape-handling can be tested
 * against recorded payloads without a network — which matters, because the
 * network is the part that cannot be tested.
 */
export function parseWord(raw: unknown, fallbackWord: string): WordLookup | null {
  const list = Array.isArray(raw) ? raw : null;
  if (!list?.length) return null;

  const senses: WordSense[] = [];
  let phonetic: string | undefined;
  let source: string | undefined;
  let word = fallbackWord;

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    word = str(e.word) ?? word;
    phonetic ??= str(e.phonetic);
    if (!phonetic && Array.isArray(e.phonetics)) {
      for (const p of e.phonetics) {
        const t = str((p as Record<string, unknown>)?.text);
        if (t) {
          phonetic = t;
          break;
        }
      }
    }
    if (!source && Array.isArray(e.sourceUrls)) source = str(e.sourceUrls[0]);

    for (const meaning of Array.isArray(e.meanings) ? e.meanings : []) {
      const m = meaning as Record<string, unknown>;
      const pos = str(m.partOfSpeech);
      for (const d of Array.isArray(m.definitions) ? m.definitions : []) {
        const def = str((d as Record<string, unknown>)?.definition);
        if (!def) continue;
        senses.push({
          partOfSpeech: pos,
          definition: def,
          example: str((d as Record<string, unknown>)?.example),
        });
      }
    }
  }

  if (!senses.length) return null;
  // Three is plenty for a flashcard. A word with nine senses listed in full is
  // a dictionary page, not something you will review in ten seconds.
  return { word, phonetic, senses: senses.slice(0, 3), source };
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
  try {
    const raw = await getJson(
      `${DICTIONARY_URL}/${encodeURIComponent(lang)}/${encodeURIComponent(term)}`,
      doFetch,
      opts.signal,
    );
    const parsed = parseWord(raw, term);
    if (!parsed) return { ok: false, reason: `No definition found for "${term}".` };
    return { ok: true, value: parsed };
  } catch (err) {
    // Offline is the common case and deserves the plainer sentence.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return {
      ok: false,
      reason: offline
        ? "You are offline — type the definition and it will be kept."
        : `Could not reach the dictionary${err instanceof Error && err.message === "404" ? " (no entry)" : ""}. Type it in instead.`,
    };
  }
}

// ------------------------------------------------------------------ books --

export const OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json";
export const OPENLIBRARY_COVER = "https://covers.openlibrary.org/b/id";

export function coverUrl(id: unknown, size: "S" | "M" | "L" = "M"): string | undefined {
  const n = num(id);
  return n ? `${OPENLIBRARY_COVER}/${n}-${size}.jpg` : undefined;
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
