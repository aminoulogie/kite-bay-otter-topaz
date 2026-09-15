import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_QUERY, findIn, fold, nthIndexOf, plainText, rankOf, tally } from "./book-search.ts";

describe("a chapter as the words alone", () => {
  it("drops the tags and keeps the prose", () => {
    assert.equal(
      plainText("<p class='x'>The spice <em>melange</em>.</p>"),
      "The spice melange.",
    );
  });

  it("puts a space where a block ended, so two words do not become one", () => {
    assert.equal(plainText("<p>end.</p><p>Next</p>"), "end. Next");
    assert.equal(plainText("one<br/>two"), "one two");
  });

  it("throws away what is not prose, contents and all", () => {
    assert.equal(plainText("<style>p{color:red}</style><p>Arrakis</p>"), "Arrakis");
    assert.equal(plainText("<script>var x = '<p>no</p>';</script><p>yes</p>"), "yes");
    assert.equal(plainText("<!-- a note --><p>yes</p>"), "yes");
  });

  it("turns entities back into characters", () => {
    assert.equal(plainText("<p>Fear &amp; loathing &mdash; &#8220;yes&#8221;</p>"), 'Fear & loathing — “yes”');
    assert.equal(plainText("<p>&#x41;rrakis</p>"), "Arrakis");
  });

  it("collapses whitespace the way a browser does", () => {
    assert.equal(plainText("<p>the   spice\n\n  flows</p>"), "the spice flows");
  });
});

describe("folding two words into comparable ones", () => {
  it("ignores case and accents", () => {
    assert.equal(fold("Mélange"), fold("melange"));
    assert.equal(fold("ÉTÉ"), fold("ete"));
  });

  it("never changes the length, so an index stays an index", () => {
    for (const s of ["Mélange", "ÉTÉ", "naïve café", "plain", "Ωμέγα"]) {
      assert.equal(fold(s).length, s.length, `${s} changed length when folded`);
    }
  });
});

describe("finding a word in a chapter", () => {
  const text = "The spice melange. Later the Mélange again, and melange once more.";

  it("finds every occurrence, in reading order, however it is accented", () => {
    const hits = findIn(text, "melange", 2);
    assert.equal(hits.length, 3);
    assert.deepEqual(hits.map((h) => h.at), [10, 29, 48]);
    assert.deepEqual(hits.map((h) => h.hit), ["melange", "Mélange", "melange"]);
    assert.equal(hits[0]!.chapter, 2);
  });

  it("carries the words either side, and says when it has trimmed them", () => {
    const long = `${"a word ".repeat(30)}melange${" and more".repeat(30)}`;
    const [hit] = findIn(long, "melange", 0);
    assert.ok(hit!.before.startsWith("…"));
    assert.ok(hit!.after.endsWith("…"));
  });

  it("refuses a query too short to mean anything", () => {
    assert.deepEqual(findIn(text, "m", 0), []);
    assert.deepEqual(findIn(text, "  ", 0), []);
  });

  it("stops at the limit rather than returning a chapter of hits", () => {
    assert.equal(findIn("ab ".repeat(200), "ab", 0, 5).length, 5);
  });

  it("does not find overlapping copies of itself twice", () => {
    assert.equal(findIn("aaaa", "aa", 0).length, 2);
  });
});

describe("finding the same hit again in the laid-out chapter", () => {
  it("counts occurrences, not characters", () => {
    const rendered = "Chapter 1 The spice melange. Later the Mélange again.";
    assert.equal(nthIndexOf(rendered, "melange", 0), 20);
    assert.equal(nthIndexOf(rendered, "melange", 1), 39);
    assert.equal(nthIndexOf(rendered, "melange", 2), -1);
    assert.equal(nthIndexOf(rendered, "", 0), -1);
  });

  it("ranks a hit within its own chapter and not across the book", () => {
    const hits = [
      { chapter: 0, at: 1, before: "", hit: "x", after: "" },
      { chapter: 1, at: 2, before: "", hit: "x", after: "" },
      { chapter: 1, at: 9, before: "", hit: "x", after: "" },
    ];
    assert.equal(rankOf(hits, hits[1]!), 0);
    assert.equal(rankOf(hits, hits[2]!), 1);
  });
});

describe("what the field says under itself", () => {
  it("says nothing before you have typed", () => {
    assert.equal(tally(0, ""), "");
    assert.equal(tally(0, "m"), `Type ${MIN_QUERY} letters or more.`);
  });

  it("counts, in words rather than a bare number", () => {
    assert.equal(tally(0, "melange"), "Nothing found.");
    assert.equal(tally(1, "melange"), "1 result");
    assert.equal(tally(9, "melange"), "9 results");
  });
});
