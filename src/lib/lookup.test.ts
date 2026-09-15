import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coverUrl, lookupWord, parseBooks, parseDatamuse, parseWord, progressLabel, readProgress,
  searchBooks, upgradeCoverUrl,
} from "./lookup.ts";

/** A real Wiktionary rest_v1/page/definition payload, trimmed to the fields read. */
const WIKT_OK = {
  en: [
    {
      partOfSpeech: "adjective",
      language: "English",
      definitions: [
        {
          definition: "Lasting for a short period of time.",
          examples: ["an ephemeral victory"],
        },
        { definition: "Existing for only one day, as with some flowers." },
      ],
    },
    { partOfSpeech: "noun", definitions: [{ definition: "Something short-lived." }] },
  ],
};

/** A real Datamuse `md=dp` payload. */
const DM_OK = [{ word: "ephemeral", tags: ["adj"], defs: ["adj\tLasting for a very short time."] }];

const OL_OK = {
  numFound: 412,
  docs: [
    {
      key: "/works/OL27448W",
      title: "Meditations",
      author_name: ["Marcus Aurelius", "Gregory Hays"],
      cover_i: 8231856,
      number_of_pages_median: 254,
      first_publish_year: 180,
    },
    { key: "/works/OL2W", title: "Meditations on First Philosophy" },
  ],
};

const fetchOf = (body: unknown, ok = true) =>
  (async () => ({ ok, status: ok ? 200 : 404, json: async () => body })) as unknown as typeof fetch;

/** Answers successive calls with successive bodies — for testing the fallback chain. */
const fetchQueue = (...bodies: unknown[]) => {
  let i = 0;
  return (async () => {
    const b = bodies[Math.min(i++, bodies.length - 1)];
    if (b instanceof Error) throw b;
    return { ok: true, status: 200, json: async () => b };
  }) as unknown as typeof fetch;
};

const fetchFails = (async () => {
  throw new Error("network");
}) as unknown as typeof fetch;

// ------------------------------------------------------------- dictionary --

test("a definition is pulled out with its part of speech and example", () => {
  const w = parseWord(WIKT_OK, "ephemeral")!;
  assert.equal(w.word, "ephemeral");
  assert.equal(w.senses[0]!.partOfSpeech, "adjective");
  assert.match(w.senses[0]!.definition, /short period of time/);
  assert.equal(w.senses[0]!.example, "an ephemeral victory");
  assert.match(w.source ?? "", /wiktionary/i);
});

test("a word with nine senses is trimmed to something reviewable", () => {
  const many = {
    en: [
      {
        partOfSpeech: "verb",
        definitions: Array.from({ length: 9 }, (_, i) => ({ definition: `sense ${i}` })),
      },
    ],
  };
  assert.equal(parseWord(many, "set")!.senses.length, 3);
});

test("junk from the service produces nothing rather than a crash", () => {
  // Both services return loosely-shaped JSON that changes without notice, and
  // a missing field must never write "undefined" into a log kept for years.
  assert.equal(parseWord(null, "x"), null);
  assert.equal(parseWord([], "x"), null);
  assert.equal(parseWord({ title: "Not Found" }, "x"), null);
  assert.equal(parseWord({ en: [] }, "x"), null);
  assert.equal(parseWord({ en: [{ definitions: [{ definition: "  " }] }] }, "x"), null);
});

test("an entry with no part of speech simply has none", () => {
  const w = parseWord({ en: [{ definitions: [{ definition: "a thing" }] }] }, "x")!;
  assert.equal(w.phonetic, undefined);
  assert.equal(w.senses[0]!.partOfSpeech, undefined);
});

test("a datamuse entry yields a sense from its pos-tab-def string", () => {
  const w = parseDatamuse(DM_OK, "ephemeral")!;
  assert.equal(w.word, "ephemeral");
  assert.equal(w.senses[0]!.partOfSpeech, "adj");
  assert.match(w.senses[0]!.definition, /Lasting for a very short time/);
  assert.match(w.source ?? "", /Datamuse/);
});

test("datamuse junk produces nothing rather than a crash", () => {
  assert.equal(parseDatamuse(null, "x"), null);
  assert.equal(parseDatamuse([], "x"), null);
  assert.equal(parseDatamuse([{ word: "x" }], "x"), null);
  assert.equal(parseDatamuse([{ defs: [""] }], "x"), null);
});

test("an empty search is refused before the network is touched", async () => {
  const r = await lookupWord("   ", { fetch: fetchFails });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /Type a word/);
});

test("a lookup that fails tells you to type it in yourself", async () => {
  // The whole premise is that your data lives on your phone. A feature that
  // only works online has no place in it.
  const r = await lookupWord("ephemeral", { fetch: fetchFails });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /Type it in instead/);
});

test("a word neither provider has says so by name", async () => {
  const r = await lookupWord("qwertyuiop", { fetch: fetchOf({ title: "Not Found" }) });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /qwertyuiop/);
});

test("a good lookup comes back ready to store", async () => {
  const r = await lookupWord("ephemeral", { fetch: fetchOf(WIKT_OK) });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.senses.length, 3);
});

test("when wiktionary has nothing, the datamuse fallback answers", async () => {
  const r = await lookupWord("ephemeral", { fetch: fetchQueue({ title: "Not Found" }, DM_OK) });
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.value.source ?? "", /Datamuse/);
});

test("when wiktionary is unreachable, the datamuse fallback answers", async () => {
  const r = await lookupWord("ephemeral", { fetch: fetchQueue(new Error("network"), DM_OK) });
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.value.source ?? "", /Datamuse/);
});

// ------------------------------------------------------------------ books --

test("a book match carries what the shelf needs", () => {
  const [first] = parseBooks(OL_OK);
  assert.equal(first!.title, "Meditations");
  assert.equal(first!.author, "Marcus Aurelius", "the first author, not the translator list");
  assert.equal(first!.pages, 254);
  assert.equal(first!.year, 180);
  assert.match(first!.coverUrl ?? "", /8231856-L\.jpg$/);
});

test("a book with no cover or author is still a usable match", () => {
  const [, second] = parseBooks(OL_OK);
  assert.equal(second!.title, "Meditations on First Philosophy");
  assert.equal(second!.author, undefined);
  assert.equal(second!.coverUrl, undefined);
  assert.equal(second!.pages, undefined);
});

test("a doc with no title or key is dropped rather than shown blank", () => {
  const books = parseBooks({ docs: [{ title: "No key" }, { key: "/works/x" }, ...OL_OK.docs] });
  assert.equal(books.length, 2);
});

test("junk from the catalogue is nothing, not a crash", () => {
  assert.deepEqual(parseBooks(null), []);
  assert.deepEqual(parseBooks({}), []);
  assert.deepEqual(parseBooks({ docs: "nope" }), []);
});

test("a cover id has to be a real id", () => {
  assert.equal(coverUrl(0), undefined);
  assert.equal(coverUrl(-3), undefined);
  assert.equal(coverUrl("nope"), undefined);
  assert.match(coverUrl(12, "L") ?? "", /12-L\.jpg$/);
});

test("a failed search tells you to add it by hand", async () => {
  const r = await searchBooks("meditations", { fetch: fetchFails });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /by hand/);
});

test("a search that finds nothing names what it looked for", async () => {
  const r = await searchBooks("zzzz", { fetch: fetchOf({ docs: [] }) });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /zzzz/);
});

// --------------------------------------------------------------- progress --

test("progress needs a page count to be a percentage", () => {
  assert.equal(readProgress(50, 0), null);
  assert.equal(readProgress(50, undefined), null);
  assert.equal(progressLabel(50, undefined), "page 50");
  assert.equal(progressLabel(0, undefined), "not started");
});

test("progress is a percentage of the book, clamped to it", () => {
  assert.equal(readProgress(127, 254), 50);
  assert.equal(readProgress(400, 254), 100, "you cannot be 157% through a book");
  assert.equal(readProgress(-5, 254), 0);
  assert.equal(progressLabel(127, 254), "127 of 254 · 50%");
});

test("covers are fetched at the largest size, not the medium one", () => {
  const url = coverUrl(14627509);
  assert.ok(url?.endsWith("-L.jpg"), url);
  assert.ok(coverUrl(14627509, "S")?.endsWith("-S.jpg"), "a caller can still ask for a thumb");
  assert.equal(coverUrl(undefined), undefined);
  assert.equal(coverUrl("not a number"), undefined);
});

test("an older small cover link is upgraded exactly once", () => {
  const small = "https://covers.openlibrary.org/b/id/1234-M.jpg";
  assert.equal(upgradeCoverUrl(small), "https://covers.openlibrary.org/b/id/1234-L.jpg");
  assert.equal(upgradeCoverUrl("https://covers.openlibrary.org/b/id/1234-S.jpg"),
    "https://covers.openlibrary.org/b/id/1234-L.jpg");
  // Already large, so there is nothing to do — which is what stops it looping.
  assert.equal(upgradeCoverUrl("https://covers.openlibrary.org/b/id/1234-L.jpg"), null);
});

test("a cover that did not come from Open Library is left alone", () => {
  assert.equal(upgradeCoverUrl("https://example.com/1234-M.jpg"), null);
  assert.equal(upgradeCoverUrl("https://covers.openlibrary.org.evil.test/b/id/1-M.jpg"), null);
  assert.equal(upgradeCoverUrl(undefined), null);
  assert.equal(upgradeCoverUrl(""), null);
});
