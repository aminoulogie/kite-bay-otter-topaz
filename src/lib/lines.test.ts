import assert from "node:assert/strict";
import { test } from "node:test";
import { lineAt, linesIn, stepLine, type Rect } from "./lines.ts";

const line = (top: number, left = 20, right = 340): Rect => ({
  top, left, right, bottom: top + 22,
});

test("lines come back top to bottom", () => {
  const got = linesIn([line(60), line(20), line(40)], { left: 0, right: 360 });
  assert.deepEqual(got.map((l) => l.top), [20, 40, 60]);
});

test("a styled word is part of its line, not a line of its own", () => {
  // An italic phrase mid-sentence reports its own rect, a pixel or two off.
  const got = linesIn(
    [
      { top: 20, left: 20, right: 140, bottom: 42 },
      { top: 22, left: 140, right: 210, bottom: 44 },
      { top: 20, left: 210, right: 340, bottom: 42 },
      { top: 48, left: 20, right: 300, bottom: 70 },
    ],
    { left: 0, right: 360 },
  );
  assert.equal(got.length, 2, "one line of three pieces, then the next");
  assert.deepEqual(got[0], { top: 20, left: 20, right: 340, bottom: 44 });
});

test("only the page you are looking at is in reading order", () => {
  // Paged mode lays the other columns out to the right, off screen.
  const got = linesIn(
    [line(20, 20, 340), line(20, 420, 740), line(48, 20, 300), line(48, 420, 700)],
    { left: 0, right: 360 },
  );
  assert.deepEqual(got.map((l) => l.left), [20, 20]);
  assert.equal(got.length, 2, "the next column is not on this page");
});

test("a line starting with a hanging quote is still on the page", () => {
  // Its left edge is outside the column; its centre is not.
  const got = linesIn([{ top: 20, left: -6, right: 340, bottom: 42 }], { left: 0, right: 360 });
  assert.equal(got.length, 1);
});

test("collapsed whitespace is not a line", () => {
  const got = linesIn(
    [
      { top: 20, left: 20, right: 340, bottom: 42 },
      { top: 44, left: 20, right: 21, bottom: 66 },
      { top: 70, left: 20, right: 340, bottom: 71 },
    ],
    { left: 0, right: 360 },
  );
  assert.equal(got.length, 1, "a one-pixel-wide and a one-pixel-tall rect are not text");
});

test("a vertical window keeps a scrolling page to what is visible", () => {
  const got = linesIn([line(-40), line(20), line(900)], { left: 0, right: 360, top: 0, bottom: 700 });
  assert.deepEqual(got.map((l) => l.top), [20]);
});

test("stepping off either end says so rather than sticking", () => {
  assert.equal(stepLine(0, 1, 3), 1);
  assert.equal(stepLine(2, 1, 3), null, "off the bottom — turn the page");
  assert.equal(stepLine(0, -1, 3), null, "off the top — turn back");
  assert.equal(stepLine(0, 1, 0), null, "a page with no text on it");
});

test("a tap picks the line it landed on, or the nearest one", () => {
  const lines = [line(20), line(60), line(100)];
  assert.equal(lineAt(lines, 30), 0, "inside the first");
  assert.equal(lineAt(lines, 70), 1);
  assert.equal(lineAt(lines, 52), 1, "in the gap, nearer the second");
  assert.equal(lineAt(lines, 0), 0, "above everything");
  assert.equal(lineAt(lines, 9999), 2, "below everything");
  assert.equal(lineAt([], 50), 0);
});
