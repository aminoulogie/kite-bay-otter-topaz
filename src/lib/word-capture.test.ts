import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import {
  MAX_WORDS, capture, cleanSelection, isCapturable, isSelectable, sentenceAround,
} from "./word-capture.ts";

test("the page's punctuation is not part of the word", () => {
  assert.equal(cleanSelection("  kwisatz,  "), "kwisatz");
  assert.equal(cleanSelection('"gom jabbar."'), "gom jabbar");
  assert.equal(cleanSelection("“prescience”"), "prescience");
  assert.equal(cleanSelection("—melange—"), "melange");
  assert.equal(cleanSelection("word\n  break"), "word break");
  // A hyphen INSIDE the word is part of it; one on the edge is not.
  assert.equal(cleanSelection("-well-meaning-"), "well-meaning");
});

test("a tap, a paragraph and a page number are all refused", () => {
  assert.equal(isCapturable(""), false);
  assert.equal(isCapturable("  "), false);
  assert.equal(isCapturable("a"), false, "one letter is a mis-tap");
  assert.equal(isCapturable("42"), false);
  assert.equal(isCapturable("—"), false);
  assert.equal(isCapturable("word ".repeat(MAX_WORDS + 1)), false, "that is a passage");
  assert.equal(isCapturable("x".repeat(200)), false);
});

test("a word and a short phrase are both worth keeping", () => {
  assert.equal(isCapturable("melange"), true);
  assert.equal(isCapturable("gom jabbar"), true);
  assert.equal(isCapturable("  kwisatz haderach,  "), true);
  // Not just English: the letter test is Unicode, so Arabic and French count.
  assert.equal(isCapturable("مَلَنج"), true);
  assert.equal(isCapturable("déjà vu"), true);
});

const PARA =
  "A beginning is the time for taking care. This is the year of the melange, " +
  "and the spice must flow. Nobody said it would be easy!";

test("the sentence the word came from comes with it", () => {
  assert.equal(
    sentenceAround(PARA, "melange"),
    "This is the year of the melange, and the spice must flow.",
  );
  assert.equal(sentenceAround(PARA, "beginning"), "A beginning is the time for taking care.");
  assert.equal(sentenceAround(PARA, "easy"), "Nobody said it would be easy!");
});

test("a word the block does not contain has no sentence, and says so", () => {
  assert.equal(sentenceAround(PARA, "shai-hulud"), undefined);
  assert.equal(sentenceAround("", "melange"), undefined);
  assert.equal(sentenceAround(PARA, ""), undefined);
});

test("a sentence that is only the word itself is not worth keeping", () => {
  // "Melange." as its own line teaches you nothing you do not already have.
  assert.equal(sentenceAround("Melange.", "melange"), undefined);
});

test("a runaway sentence is cut rather than stored whole", () => {
  const long = `${"word ".repeat(200)}melange${" more".repeat(200)}`;
  const got = sentenceAround(long, "melange")!;
  assert.ok(got.length <= 220, `${got.length} characters`);
  assert.ok(got.endsWith("…"), "and says it was cut");
});

test("capture puts the two together, or refuses", () => {
  assert.deepEqual(capture("  melange, ", PARA), {
    word: "melange",
    example: "This is the year of the melange, and the spice must flow.",
  });
  assert.equal(capture("42", PARA), null);
  // A word with no traceable sentence is still a word.
  assert.deepEqual(capture("shai-hulud", PARA), { word: "shai-hulud", example: undefined });
});

describe("what the menu will open for", () => {
  it("opens for a word, and for the sentence the word came from", () => {
    assert.equal(isSelectable("melange"), true);
    assert.equal(
      isSelectable("A beginning is the time for taking care that the balances are correct."),
      true,
      "a sentence is exactly the kind of thing you highlight",
    );
  });

  it("does not open for a tap, a stray character or half a chapter", () => {
    assert.equal(isSelectable(""), false);
    assert.equal(isSelectable(" , "), false);
    assert.equal(isSelectable("42"), false);
    assert.equal(isSelectable("word ".repeat(120)), false);
  });

  it("is looser than the word book, which is the point", () => {
    const sentence = "A beginning is the time for taking care that the balances are correct.";
    assert.equal(isSelectable(sentence), true);
    assert.equal(isCapturable(sentence), false, "a sentence is not a vocabulary word");
  });
});
