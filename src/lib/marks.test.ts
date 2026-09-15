import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MARK, MARK_COLOURS, addMark, cleanMark, cleanMarks, markAt, markChip,
  markColour, overlaps, removeMark, rowsOf, type BookMark,
} from "./marks.ts";

const mark = (over: Partial<BookMark> = {}): BookMark => ({
  id: "m1", chapter: 0, start: 10, end: 20, colour: "butter", text: "melange", ...over,
});

describe("the palette", () => {
  it("offers five pastels, each with a light and a dark ink", () => {
    assert.equal(MARK_COLOURS.length, 5);
    for (const c of MARK_COLOURS) {
      assert.ok(c.light.startsWith("rgba("), `${c.id} needs a translucent light ink`);
      assert.ok(c.dark.startsWith("rgba("), `${c.id} needs a translucent dark ink`);
      assert.ok(c.chip.startsWith("#"), `${c.id} needs a solid swatch`);
    }
  });

  it("thins the ink on a dark page, so a highlight is not a blackout", () => {
    for (const c of MARK_COLOURS) {
      const alpha = (s: string) => Number(s.slice(s.lastIndexOf(",") + 1, -1));
      assert.ok(alpha(c.dark) < alpha(c.light), `${c.id} is too heavy at night`);
    }
  });

  it("falls back to the first colour for anything it has never heard of", () => {
    assert.equal(markColour("chartreuse", false), MARK_COLOURS[0]!.light);
    assert.equal(markColour(undefined, true), MARK_COLOURS[0]!.dark);
    assert.equal(markChip("nonsense"), MARK_COLOURS[0]!.chip);
  });
});

describe("reading a stored highlight back", () => {
  it("keeps a good one", () => {
    assert.deepEqual(cleanMark(mark()), mark());
  });

  it("refuses one with no id, no span, or a backwards span", () => {
    assert.equal(cleanMark({ ...mark(), id: "" }), null);
    assert.equal(cleanMark({ ...mark(), start: 20, end: 20 }), null);
    assert.equal(cleanMark({ ...mark(), chapter: -1 }), null);
    assert.equal(cleanMark(null), null);
    assert.equal(cleanMark("butter"), null);
  });

  it("straightens a span stored the wrong way round", () => {
    assert.deepEqual(cleanMark({ ...mark(), start: 20, end: 10 }), mark({ start: 10, end: 20 }));
  });

  it("replaces a colour this version does not have", () => {
    assert.equal(cleanMark({ ...mark(), colour: "neon" })?.colour, DEFAULT_MARK);
  });

  it("drops the bad ones out of a list without losing the good", () => {
    const list = cleanMarks([mark(), null, { id: "x" }, mark({ id: "m2", start: 30, end: 40 })]);
    assert.deepEqual(list.map((m) => m.id), ["m1", "m2"]);
  });

  it("treats anything that is not a list as no highlights", () => {
    assert.deepEqual(cleanMarks(undefined), []);
    assert.deepEqual(cleanMarks({ 0: mark() }), []);
  });
});

describe("overlapping highlights", () => {
  it("knows a touch from a miss", () => {
    assert.equal(overlaps(mark(), { chapter: 0, start: 15, end: 25 }), true);
    assert.equal(overlaps(mark(), { chapter: 0, start: 20, end: 25 }), false, "abutting is not overlapping");
    assert.equal(overlaps(mark(), { chapter: 1, start: 15, end: 25 }), false, "another chapter");
  });

  it("swallows what a new highlight lands on, and joins the span", () => {
    const list = [mark({ id: "a", start: 10, end: 20 }), mark({ id: "b", start: 40, end: 50 })];
    const out = addMark(list, mark({ id: "c", start: 15, end: 30, colour: "mint" }));
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((m) => [m.id, m.start, m.end, m.colour]),
      [["c", 10, 30, "mint"], ["b", 40, 50, "butter"]],
    );
  });

  it("re-marking the same words changes the ink rather than stacking two", () => {
    const out = addMark([mark()], mark({ id: "c", colour: "sky" }));
    assert.equal(out.length, 1);
    assert.equal(out[0]!.colour, "sky");
  });

  it("leaves a highlight in another chapter alone", () => {
    const out = addMark([mark({ id: "a", chapter: 3 })], mark({ id: "c" }));
    assert.equal(out.length, 2);
  });

  it("keeps the list in reading order", () => {
    const out = addMark(
      [mark({ id: "a", start: 90, end: 95 }), mark({ id: "b", chapter: 2, start: 1, end: 5 })],
      mark({ id: "c", start: 1, end: 4 }),
    );
    assert.deepEqual(out.map((m) => m.id), ["c", "a", "b"]);
  });

  it("rubs one out by id, and finds the one under a character", () => {
    assert.deepEqual(removeMark([mark(), mark({ id: "m2" })], "m1").map((m) => m.id), ["m2"]);
    assert.equal(markAt([mark()], 0, 10)?.id, "m1");
    assert.equal(markAt([mark()], 0, 19)?.id, "m1");
    assert.equal(markAt([mark()], 0, 20), null, "the end is past the last character");
    assert.equal(markAt([mark()], 1, 12), null, "another chapter");
  });
});

describe("one stroke per line", () => {
  it("merges the pieces of a line into a single stroke", () => {
    const rows = rowsOf([
      { x: 10, y: 0, w: 40, h: 20 },
      { x: 50, y: 0, w: 30, h: 20 },
      { x: 10, y: 24, w: 60, h: 20 },
    ]);
    assert.deepEqual(rows, [
      { x: 10, y: 0, w: 70, h: 20 },
      { x: 10, y: 24, w: 60, h: 20 },
    ]);
  });

  it("puts a taller box on the line it shares a middle with", () => {
    const rows = rowsOf([
      { x: 10, y: 0, w: 40, h: 20 },
      { x: 50, y: -4, w: 12, h: 28 },
    ]);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { x: 10, y: -4, w: 52, h: 28 });
  });

  it("drops the hairlines a range reports at its edges", () => {
    assert.deepEqual(rowsOf([{ x: 10, y: 0, w: 0, h: 20 }, { x: 10, y: 40, w: 30, h: 0 }]), []);
  });

  it("pads a stroke out past the letters when asked", () => {
    assert.deepEqual(rowsOf([{ x: 10, y: 10, w: 40, h: 20 }], 2), [
      { x: 8, y: 8, w: 44, h: 24 },
    ]);
  });

  it("has nothing to draw for nothing selected", () => {
    assert.deepEqual(rowsOf([]), []);
  });
});
