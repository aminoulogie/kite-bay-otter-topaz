import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  booksWithMarks, byRecent, filterHighlights, gather, groupByBook, summarise, tallyByColour,
  toMarkdown,
} from "./highlights.ts";
import type { BookMark } from "./marks.ts";
import type { MindEntry } from "./types.ts";

function mark(over: Partial<BookMark> & { id: string }): BookMark {
  return { chapter: 0, start: 0, end: 5, colour: "butter", text: "text", ...over };
}

function book(id: string, title: string, date: string, marks: BookMark[]): MindEntry {
  return { id, kind: "book", title, date, marks } as MindEntry;
}

const DUNE = book("d", "Dune", "2026-09-10", [
  mark({ id: "d2", chapter: 3, start: 90, end: 120, text: "Fear is the mind-killer", colour: "sky", at: 300 }),
  mark({ id: "d1", chapter: 1, start: 10, end: 40, text: "The spice must flow", colour: "butter", at: 100 }),
  mark({ id: "d3", chapter: 1, start: 200, end: 230, text: "A beginning is a delicate time", colour: "sky", at: 200 }),
]);
const WHY = book("w", "Why We Sleep", "2026-09-14", [
  mark({ id: "w1", chapter: 0, start: 5, end: 30, text: "Sleep is the single most effective thing", colour: "mint", at: 400 }),
]);
const EMPTY = book("e", "Unmarked", "2026-09-15", []);
const IDEA = { id: "i", kind: "idea", title: "An idea", date: "2026-09-16" } as MindEntry;

const SHELF = [DUNE, WHY, EMPTY, IDEA];

describe("which entries have highlights at all", () => {
  it("keeps only books carrying marks", () => {
    assert.deepEqual(booksWithMarks(SHELF).map((b) => b.id), ["d", "w"]);
  });

  it("is not confused by a book whose marks array is missing", () => {
    assert.deepEqual(booksWithMarks([{ id: "x", kind: "book", title: "T", date: "2026-01-01" } as MindEntry]), []);
  });
});

describe("gathering them", () => {
  it("puts the most recently logged book first", () => {
    assert.deepEqual([...new Set(gather(SHELF).map((r) => r.bookTitle))], ["Why We Sleep", "Dune"]);
  });

  it("reads a book in the book's own order, not the order you marked it", () => {
    const dune = gather(SHELF).filter((r) => r.bookId === "d");
    assert.deepEqual(dune.map((r) => r.id), ["d1", "d3", "d2"]);
  });

  it("carries the book each one came from", () => {
    const first = gather(SHELF)[0]!;
    assert.equal(first.bookId, "w");
    assert.equal(first.bookTitle, "Why We Sleep");
    assert.equal(first.text, "Sleep is the single most effective thing");
  });

  it("gives an empty shelf an empty list rather than throwing", () => {
    assert.deepEqual(gather([]), []);
    assert.deepEqual(gather([IDEA]), []);
  });
});

describe("newest first", () => {
  it("sorts by when the ink went down", () => {
    assert.deepEqual(byRecent(gather(SHELF)).map((r) => r.id), ["w1", "d2", "d3", "d1"]);
  });

  it("puts highlights made before dates existed at the back", () => {
    const old = book("o", "Old", "2026-09-16", [mark({ id: "o1", text: "no date" })]);
    assert.deepEqual(byRecent(gather([old, WHY])).map((r) => r.id), ["w1", "o1"]);
  });
});

describe("narrowing the list", () => {
  const all = gather(SHELF);

  it("matches the passage", () => {
    assert.deepEqual(filterHighlights(all, { query: "spice" }).map((r) => r.id), ["d1"]);
  });

  it("matches the book title, which is how people look for a quote", () => {
    assert.deepEqual(filterHighlights(all, { query: "dune" }).map((r) => r.id), ["d1", "d3", "d2"]);
  });

  it("ignores accents the same way the in-book search does", () => {
    const fr = book("f", "Mélange", "2026-09-16", [mark({ id: "f1", text: "déjà vu" })]);
    assert.equal(filterHighlights(gather([fr]), { query: "deja" }).length, 1);
    assert.equal(filterHighlights(gather([fr]), { query: "melange" }).length, 1);
  });

  it("filters by colour", () => {
    assert.deepEqual(filterHighlights(all, { colour: "sky" }).map((r) => r.id), ["d3", "d2"]);
  });

  it("filters by book", () => {
    assert.deepEqual(filterHighlights(all, { bookId: "w" }).map((r) => r.id), ["w1"]);
  });

  it("applies several at once", () => {
    assert.deepEqual(filterHighlights(all, { colour: "sky", query: "beginning" }).map((r) => r.id), ["d3"]);
  });

  it("treats a blank query as no query", () => {
    assert.equal(filterHighlights(all, { query: "   " }).length, all.length);
  });
});

describe("grouped under their books", () => {
  it("keeps one group per book, in the order they arrived", () => {
    const groups = groupByBook(gather(SHELF));
    assert.deepEqual(groups.map((g) => g.title), ["Why We Sleep", "Dune"]);
    assert.deepEqual(groups[1]!.rows.map((r) => r.id), ["d1", "d3", "d2"]);
  });

  it("does not split a book whose rows are not adjacent", () => {
    const mixed = byRecent(gather(SHELF));
    assert.equal(groupByBook(mixed).length, 2);
  });
});

describe("counting the colours", () => {
  it("reports every colour, including the ones nobody used", () => {
    const t = tallyByColour(gather(SHELF));
    assert.equal(t.sky, 2);
    assert.equal(t.butter, 1);
    assert.equal(t.mint, 1);
    assert.equal(t.lilac, 0);
  });
});

describe("taking them out of the app", () => {
  it("writes each book as a heading and each highlight as a quote", () => {
    const md = toMarkdown(gather([WHY]));
    assert.equal(md, "## Why We Sleep\n\n> Sleep is the single most effective thing");
  });

  it("quotes every line of a passage that spans lines", () => {
    const multi = book("m", "M", "2026-09-16", [mark({ id: "m1", text: "one\ntwo" })]);
    assert.match(toMarkdown(gather([multi])), /> one\n> two/);
  });

  it("separates the books", () => {
    const md = toMarkdown(gather(SHELF));
    assert.equal((md.match(/^## /gm) ?? []).length, 2);
  });

  it("gives nothing for nothing", () => {
    assert.equal(toMarkdown([]), "");
  });
});

describe("the one-line summary", () => {
  it("counts highlights and the books they are in", () => {
    assert.equal(summarise(gather(SHELF)), "4 highlights in 2 books");
  });

  it("says it in the singular when it should", () => {
    assert.equal(summarise(gather([WHY])), "1 highlight in 1 book");
  });

  it("says so when there is nothing", () => {
    assert.equal(summarise([]), "Nothing highlighted yet");
  });
});
