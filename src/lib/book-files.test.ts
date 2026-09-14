import assert from "node:assert/strict";
import { test } from "node:test";
import { kindOf, sizeLabel, titleFromFilename } from "./book-files.ts";

test("the file type decides, and the extension is the fallback", () => {
  assert.equal(kindOf({ name: "a.bin", type: "application/pdf" }), "pdf");
  assert.equal(kindOf({ name: "a.bin", type: "application/epub+zip" }), "epub");
  // iOS Files hands over an empty type for an EPUB about half the time.
  assert.equal(kindOf({ name: "Dune.epub", type: "" }), "epub");
  assert.equal(kindOf({ name: "Paper.PDF" }), "pdf");
  assert.equal(kindOf({ name: "notes.txt", type: "text/plain" }), null);
  assert.equal(kindOf({}), null);
});

test("a filename becomes a title without its cruft", () => {
  assert.equal(titleFromFilename("Dune.epub"), "Dune");
  assert.equal(titleFromFilename("The_Selfish_Gene.pdf"), "The Selfish Gene");
  assert.equal(titleFromFilename("Dune (z-lib.org).epub"), "Dune");
  assert.equal(titleFromFilename("Sapiens [retail].epub"), "Sapiens");
  assert.equal(titleFromFilename("Meditations (1).pdf"), "Meditations");
  // Never empty: a file called ".pdf" keeps its own name rather than becoming
  // a blank row on the shelf.
  assert.equal(titleFromFilename(".pdf"), ".pdf");
});

test("sizes read the way a person would say them", () => {
  assert.equal(sizeLabel(400), "400 B");
  assert.equal(sizeLabel(2048), "2 KB");
  assert.equal(sizeLabel(1_500_000), "1.4 MB");
  assert.equal(sizeLabel(48_000_000), "46 MB");
});
