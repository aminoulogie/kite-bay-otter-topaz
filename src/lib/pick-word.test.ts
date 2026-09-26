import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWordChar, spanUnion, wordBounds } from "./pick-word.ts";

const at = (text: string, i: number) => {
  const b = wordBounds(text, i);
  return b ? text.slice(b.start, b.end) : null;
};

describe("what belongs to a word", () => {
  it("takes letters, numbers and the marks that live inside words", () => {
    for (const ch of ["a", "Z", "9", "'", "’", "-", "́"]) {
      assert.equal(isWordChar(ch), true, `${JSON.stringify(ch)} belongs to a word`);
    }
  });

  it("leaves the ones that separate them", () => {
    for (const ch of [" ", ".", ",", "—", "(", "\n"]) {
      assert.equal(isWordChar(ch), false, `${JSON.stringify(ch)} separates words`);
    }
  });
});

describe("the word under a finger", () => {
  const line = "The spice melange flows on Arrakis.";

  it("finds it from any letter in it", () => {
    assert.equal(at(line, 10), "melange");
    assert.equal(at(line, 16), "melange");
    assert.equal(at(line, 13), "melange");
  });

  it("keeps an apostrophe inside a name", () => {
    assert.equal(at("of Muad'Dib, then", 5), "Muad'Dib");
    assert.equal(at("she doesn’t know", 6), "doesn’t");
  });

  it("keeps a hyphenated word whole", () => {
    assert.equal(at("a well-known fact", 6), "well-known");
  });

  it("drops the punctuation a word ends on", () => {
    assert.equal(at(line, 27), "Arrakis");
    assert.equal(at("Arrakis.", 7), "Arrakis", "a finger on the full stop still means the word");
  });

  it("takes the word just before a space rather than guessing at the next", () => {
    assert.equal(at(line, 3), "The");
  });

  it("answers with nothing where there is no word", () => {
    assert.equal(wordBounds("   ", 1), null);
    assert.equal(wordBounds("", 0), null);
    assert.equal(wordBounds("-- --", 2), null, "marks alone are not a word");
  });

  it("clamps a position past the end onto the last word", () => {
    assert.equal(at(line, 999), "Arrakis");
  });

  it("reports where the word is, not just what it says", () => {
    assert.deepEqual(wordBounds(line, 10), { start: 10, end: 17 });
  });
});

describe("dragging past a word takes it in", () => {
  it("joins two spans", () => {
    assert.deepEqual(spanUnion({ start: 10, end: 17 }, { start: 18, end: 23 }), {
      start: 10,
      end: 23,
    });
  });

  it("works whichever way the finger went", () => {
    assert.deepEqual(spanUnion({ start: 18, end: 23 }, { start: 4, end: 9 }), {
      start: 4,
      end: 23,
    });
  });
});
