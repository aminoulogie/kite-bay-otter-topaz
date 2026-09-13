import assert from "node:assert/strict";
import { test } from "node:test";
import {
  counts, coverSource, coverWords, finishedIn, hueFor, onlyBooks, percentOf, shelfLabel,
  sortShelf, statusOf,
} from "./shelf.ts";
import type { MindEntry } from "./types.ts";

const book = (over: Partial<MindEntry> = {}): MindEntry => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  date: "2026-09-01",
  kind: "book",
  title: "A Book",
  ...over,
}) as MindEntry;

test("status comes from the page count, not a separate flag", () => {
  assert.equal(statusOf(book()), "unread");
  assert.equal(statusOf(book({ page: 0 })), "unread");
  assert.equal(statusOf(book({ page: 12 })), "reading");
  assert.equal(statusOf(book({ page: 12, finished: "2026-09-10" })), "finished");
  assert.equal(statusOf(book({ finished: "2026-09-10" })), "finished");
});

test("the book you are in the middle of is never behind a swipe", () => {
  const list = [
    book({ id: "done", title: "Done", finished: "2026-09-09" }),
    book({ id: "new", title: "New" }),
    book({ id: "mid", title: "Mid", page: 40, pages: 200 }),
  ];
  assert.deepEqual(sortShelf(list).map((b) => b.id), ["mid", "new", "done"]);
});

test("finished books stay on the shelf, they only sink", () => {
  const list = [book({ id: "a", finished: "2026-01-01" }), book({ id: "b", page: 3 })];
  assert.equal(sortShelf(list).length, 2, "a shelf you clear has nothing to show for the year");
});

test("within a group the most recent is first", () => {
  const list = [
    book({ id: "old", title: "Old", date: "2026-01-01", page: 5 }),
    book({ id: "new", title: "New", date: "2026-09-01", page: 5 }),
  ];
  assert.deepEqual(sortShelf(list).map((b) => b.id), ["new", "old"]);
});

test("the order is stable when dates tie", () => {
  const list = [
    book({ id: "z", title: "Zebra", page: 1 }),
    book({ id: "a", title: "Apple", page: 1 }),
  ];
  assert.deepEqual(sortShelf(list).map((b) => b.id), ["a", "z"]);
  assert.deepEqual(sortShelf([...list].reverse()).map((b) => b.id), ["a", "z"]);
});

test("sorting does not mutate the array it was given", () => {
  const list = [book({ id: "a", finished: "2026-01-01" }), book({ id: "b", page: 3 })];
  const before = list.map((b) => b.id);
  sortShelf(list);
  assert.deepEqual(list.map((b) => b.id), before);
});

test("only books reach the shelf", () => {
  const mixed = [book(), { ...book(), kind: "idea" }, { ...book(), kind: "article" }] as MindEntry[];
  assert.equal(onlyBooks(mixed).length, 1);
  assert.deepEqual(onlyBooks([]), []);
});

test("progress needs both a page and a total", () => {
  assert.equal(percentOf(book()), null);
  assert.equal(percentOf(book({ page: 50 })), null, "no total is nothing to measure against");
  assert.equal(percentOf(book({ pages: 200 })), null);
  assert.equal(percentOf(book({ page: 50, pages: 200 })), 25);
});

test("a finished book is a hundred per cent whatever the page says", () => {
  assert.equal(percentOf(book({ finished: "2026-09-09" })), 100);
  assert.equal(percentOf(book({ page: 3, pages: 400, finished: "2026-09-09" })), 100);
});

test("a page past the end does not exceed a hundred", () => {
  assert.equal(percentOf(book({ page: 900, pages: 200 })), 100);
  assert.equal(percentOf(book({ page: -5, pages: 200 })), null);
});

test("the label is short enough to sit under a thumbnail", () => {
  assert.equal(shelfLabel(book()), "Not started");
  assert.equal(shelfLabel(book({ page: 50, pages: 200 })), "25%");
  assert.equal(shelfLabel(book({ page: 50 })), "p. 50", "no total still says something true");
  assert.equal(shelfLabel(book({ finished: "2026-09-09" })), "Finished");
});

test("a drawn cover's colour is the same every time it is drawn", () => {
  assert.equal(hueFor("Solving the Procrastination Puzzle"), hueFor("Solving the Procrastination Puzzle"));
  assert.notEqual(hueFor("Dune"), hueFor("Ulysses"));
  const h = hueFor("Anything");
  assert.ok(h >= 0 && h < 360);
  assert.equal(hueFor(""), 0);
});

test("a drawn cover shows at most three words", () => {
  assert.deepEqual(coverWords("Solving the Procrastination Puzzle"), ["Solving", "the", "Procrastination"]);
  assert.deepEqual(coverWords("Dune"), ["Dune"]);
  assert.deepEqual(coverWords("A Concise Guide: Strategies for Change"), ["A", "Concise", "Guide"]);
  assert.deepEqual(coverWords(""), []);
});

test("local bytes beat a link, and a link beats nothing", () => {
  assert.deepEqual(coverSource("blob:x", "https://c/1.jpg"), { kind: "local", url: "blob:x" });
  assert.deepEqual(coverSource(null, "https://c/1.jpg"), { kind: "remote", url: "https://c/1.jpg" });
  assert.deepEqual(coverSource(null, undefined), { kind: "drawn" });
});

test("a link that is not a link is not used as one", () => {
  for (const bad of ["", "  ", "javascript:alert(1)", "data:text/html,x", "/local/path"]) {
    assert.deepEqual(coverSource(null, bad), { kind: "drawn" }, bad);
  }
});

test("the counts add up", () => {
  const c = counts([
    book({ page: 4 }), book({ page: 9 }), book(), book({ finished: "2026-02-02" }),
  ]);
  assert.deepEqual(c, { reading: 2, unread: 1, finished: 1, total: 4 });
  assert.deepEqual(counts([]), { reading: 0, unread: 0, finished: 0, total: 0 });
});

test("finished-this-year counts only this year", () => {
  const list = [
    book({ finished: "2026-03-01" }),
    book({ finished: "2026-11-30" }),
    book({ finished: "2025-12-31" }),
    book(),
  ];
  assert.equal(finishedIn(list, 2026), 2);
  assert.equal(finishedIn(list, 2025), 1);
  assert.equal(finishedIn(list, 2024), 0);
});
