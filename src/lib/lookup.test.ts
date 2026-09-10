import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coverUrl, lookupWord, parseBooks, parseWord, progressLabel, readProgress, searchBooks,
} from "./lookup.ts";

/** A real dictionaryapi.dev payload, trimmed to the fields that are read. */
const DICT_OK = [
  {
    word: "ephemeral",
    phonetic: "/ɪˈfɛm(ə)ɹəl/",
    phonetics: [{ text: "", audio: "x.mp3" }, { text: "/ɪˈfɛm(ə)ɹəl/" }],
    meanings: [
      {
        partOfSpeech: "adjective",
        definitions: [
          { definition: "Lasting for a short period of time.", example: "an ephemeral victory" },
          { definition: "Existing for only one day, as with some flowers." },
        ],
      },
      { partOfSpeech: "noun", definitions: [{ definition: "Something short-lived." }] },
    ],
    sourceUrls: ["https://en.wiktionary.org/wiki/ephemeral"],
  },
];

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

const fetchFails = (async () => {
  throw new Error("network");
}) as unknown as typeof fetch;

// ------------------------------------------------------------- dictionary --

test("a definition is pulled out with its part of speech and example", () => {
  const w = parseWord(DICT_OK, "ephemeral")!;
  assert.equal(w.word, "ephemeral");
  assert.equal(w.phonetic, "/ɪˈfɛm(ə)ɹəl/", "the first NON-EMPTY phonetic, not the blank one");
  assert.equal(w.senses[0]!.partOfSpeech, "adjective");
  assert.match(w.senses[0]!.definition, /short period of time/);
  assert.equal(w.senses[0]!.example, "an ephemeral victory");
  assert.match(w.source ?? "", /wiktionary/);
});

test("a word with nine senses is trimmed to something reviewable", () => {
  const many = [
    {
      word: "set",
      meanings: [
        {
          partOfSpeech: "verb",
          definitions: Array.from({ length: 9 }, (_, i) => ({ definition: `sense ${i}` })),
        },
      ],
    },
  ];
  assert.equal(parseWord(many, "set")!.senses.length, 3);
});

test("junk from the service produces nothing rather than a crash", () => {
  // Both services return loosely-shaped JSON that changes without notice, and
  // a missing field must never write "undefined" into a log kept for years.
  assert.equal(parseWord(null, "x"), null);
  assert.equal(parseWord([], "x"), null);
  assert.equal(parseWord({ title: "No Definitions Found" }, "x"), null);
  assert.equal(parseWord([{ word: "x", meanings: [] }], "x"), null);
  assert.equal(parseWord([{ meanings: [{ definitions: [{ definition: "  " }] }] }], "x"), null);
});

test("a word with no phonetic simply has none", () => {
  const w = parseWord([{ word: "x", meanings: [{ definitions: [{ definition: "a thing" }] }] }], "x")!;
  assert.equal(w.phonetic, undefined);
  assert.equal(w.senses[0]!.partOfSpeech, undefined);
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

test("a word the dictionary does not have says so by name", async () => {
  const r = await lookupWord("qwertyuiop", { fetch: fetchOf({ title: "No Definitions Found" }) });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /qwertyuiop/);
});

test("a good lookup comes back ready to store", async () => {
  const r = await lookupWord("ephemeral", { fetch: fetchOf(DICT_OK) });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.senses.length, 3);
});

// ------------------------------------------------------------------ books --

test("a book match carries what the shelf needs", () => {
  const [first] = parseBooks(OL_OK);
  assert.equal(first!.title, "Meditations");
  assert.equal(first!.author, "Marcus Aurelius", "the first author, not the translator list");
  assert.equal(first!.pages, 254);
  assert.equal(first!.year, 180);
  assert.match(first!.coverUrl ?? "", /8231856-M\.jpg$/);
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
