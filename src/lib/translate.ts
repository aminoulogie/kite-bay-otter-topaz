/**
 * Translating a word you met in a book.
 *
 * The third and last thing in SOMA that reaches the network, and it follows
 * the same rules as the other two in lib/lookup.ts: an anonymous GET to a
 * public service, nothing uploaded, no account, the answer copied into the
 * local log and never fetched again. What is sent is the word you highlighted
 * and nothing else — not the book, not the page, not who you are.
 *
 * MyMemory is the service because it needs no key. A key would mean shipping
 * a secret inside an app that anybody can unzip, which is not a secret; it
 * would also mean an account, and there is no account here to attach one to.
 *
 * As with the dictionary, the failure path is the important one. Offline, or
 * blocked, or the service having a bad day: say so plainly, and leave the word
 * exactly as it was. Nothing here is ever required to read a book.
 */

import type { LookupResult } from "./lookup.ts";

export const TRANSLATE_URL = "https://api.mymemory.translated.net/get";
export const TRANSLATE_TIMEOUT_MS = 8000;
/** Longer than this is a paragraph, and the free service refuses it anyway. */
export const MAX_TRANSLATE_CHARS = 480;

export interface Language {
  code: string;
  label: string;
}

/**
 * The languages offered, and why it is a short list.
 *
 * Every language the service knows would be a scrolling list of a hundred and
 * four entries to pick the same one every time. These are the ones a reader of
 * this app plausibly reads between — with Arabic and French first because that
 * is the pair most likely to be wanted here.
 */
export const LANGUAGES: Language[] = [
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
];

export function languageLabel(code: string | undefined): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? String(code ?? "").toUpperCase();
}

export function isLanguage(code: unknown): code is string {
  return typeof code === "string" && LANGUAGES.some((l) => l.code === code);
}

/**
 * Which language to translate INTO, before the user has said.
 *
 * Taken from the phone, because a phone set to French belongs to someone who
 * reads French. Falls back to French rather than English on the reasoning that
 * anyone reading an English book in this app is more likely to want it out of
 * English than into it — and it is one tap to change either way.
 */
export function defaultLanguage(locale?: string): string {
  const tag = (locale ?? "").toLowerCase();
  const base = tag.split(/[-_]/)[0] ?? "";
  if (base && base !== "en" && isLanguage(base)) return base;
  return "fr";
}

export interface Translation {
  text: string;
  /** 0..1, how good the service thinks its own answer is. */
  quality?: number;
}

/**
 * Pull the translation out of a MyMemory response.
 *
 * Exported apart from the fetch so the shape-handling is testable without a
 * network — the network being the part that cannot be tested. The service
 * reports its own failures with a 200 and an error sentence in the field
 * where the translation should be, so a string is not enough: a body that says
 * "INVALID SOURCE LANGUAGE" is a failure wearing a success's clothes.
 */
export function parseTranslation(raw: unknown): Translation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = Number(r.responseStatus);
  if (Number.isFinite(status) && status !== 200) return null;
  const data = r.responseData as Record<string, unknown> | undefined;
  const text = typeof data?.translatedText === "string" ? data.translatedText.trim() : "";
  if (!text) return null;
  // Its own complaints come back in this field, shouted.
  if (/^[A-Z '"]+$/.test(text) && text.length > 12) return null;
  const match = Number(data?.match);
  return {
    text,
    quality: Number.isFinite(match) && match >= 0 && match <= 1 ? match : undefined,
  };
}

type Fetcher = typeof fetch;

export async function translateText(
  text: string,
  opts: { from?: string; to: string; fetch?: Fetcher; signal?: AbortSignal } = { to: "fr" },
): Promise<LookupResult<Translation>> {
  const term = text.trim();
  if (!term) return { ok: false, reason: "Nothing to translate." };
  if (term.length > MAX_TRANSLATE_CHARS) {
    return { ok: false, reason: "That is too much text to translate at once." };
  }
  const to = opts.to;
  const from = opts.from || "en";
  if (from === to) return { ok: false, reason: `That is already ${languageLabel(to)}.` };

  const doFetch = opts.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    return { ok: false, reason: "This device cannot reach the translator." };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSLATE_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    const url = `${TRANSLATE_URL}?q=${encodeURIComponent(term)}&langpair=${encodeURIComponent(
      `${from}|${to}`,
    )}`;
    const res = await doFetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const parsed = parseTranslation(await res.json());
    if (!parsed) return { ok: false, reason: `No ${languageLabel(to)} for “${term}”.` };
    return { ok: true, value: parsed };
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return {
      ok: false,
      reason: offline
        ? "You are offline — the word is saved, the translation can wait."
        : "Could not reach the translator.",
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
