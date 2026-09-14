import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_GAP, TURN_PX, bookProgress, clampPage, isTurning, pageCount, pageOffset, tapAt,
  turnBar, turnFrom,
} from "./paginate.ts";

test("a chapter that fits on one screen is one page", () => {
  assert.equal(pageCount(360, 360), 1);
  assert.equal(pageCount(300, 360), 1);
  // Nothing laid out yet: one page, never zero, or the reader shows nothing.
  assert.equal(pageCount(0, 360), 1);
  assert.equal(pageCount(360, 0), 1);
});

test("columns are counted with the gutters between them, not around them", () => {
  const w = 360;
  for (let n = 1; n <= 12; n++) {
    const width = n * w + (n - 1) * PAGE_GAP;
    assert.equal(pageCount(width, w), n, `${n} columns`);
  }
});

test("a fraction of a pixel does not add a blank page", () => {
  // Browsers report scrollWidth a hair out, and ceil() turned that into an
  // empty page at the end of roughly every other chapter.
  const w = 360;
  const three = 3 * w + 2 * PAGE_GAP;
  assert.equal(pageCount(three + 0.4, w), 3);
  assert.equal(pageCount(three - 0.4, w), 3);
});

test("the offset walks one page plus one gutter at a time", () => {
  assert.equal(pageOffset(0, 360), 0);
  assert.equal(pageOffset(1, 360), 360 + PAGE_GAP);
  assert.equal(pageOffset(4, 360), 4 * (360 + PAGE_GAP));
  assert.equal(pageOffset(-2, 360), 0, "never slides the wrong way");
});

test("a page number is kept inside the chapter", () => {
  assert.equal(clampPage(5, 3), 2);
  assert.equal(clampPage(-1, 3), 0);
  assert.equal(clampPage(1, 3), 1);
  assert.equal(clampPage(0, 0), 0);
  assert.equal(clampPage(NaN, 5), 0);
});

test("a sideways drag turns a page and a downward one does not", () => {
  assert.equal(turnFrom(-120, 5, 360), "next");
  assert.equal(turnFrom(120, 5, 360), "prev");
  assert.equal(turnFrom(-10, 2, 360), "stay", "a graze is a tap");
  assert.equal(turnFrom(-120, 200, 360), "stay", "mostly downwards is a scroll");
  assert.equal(turnFrom(0, 0, 360), "stay");
});

test("the turn threshold scales with the screen but never runs away", () => {
  // A flick on a phone and a drag on a tablet should both turn one page.
  assert.equal(turnFrom(-50, 0, 360), "next", "12% of 360 is 43px");
  assert.equal(turnFrom(-40, 0, 360), "stay");
  // On something enormous the absolute cap takes over, so a page turn never
  // needs half a screen of travel.
  assert.equal(turnFrom(-(TURN_PX + 1), 0, 2000), "next");
  // And on something tiny the floor keeps a tap from turning a page.
  assert.equal(turnFrom(-10, 0, 60), "stay");
});

test("the edges of the page turn it and the middle shows the controls", () => {
  assert.equal(tapAt(10, 360), "prev");
  assert.equal(tapAt(350, 360), "next");
  assert.equal(tapAt(180, 360), "chrome");
  assert.equal(tapAt(70, 360), "chrome", "just inside the sixth");
  assert.equal(tapAt(10, 0), "chrome", "nothing measured yet");
});

test("progress counts chapters plus where you are in this one", () => {
  assert.equal(bookProgress(0, 4, 0, 10), 0);
  assert.equal(bookProgress(0, 4, 9, 10), 0.25, "end of chapter one of four");
  assert.equal(bookProgress(2, 4, 0, 10), 0.5);
  assert.equal(bookProgress(3, 4, 9, 10), 1);
  // A one-page chapter is finished the moment you are on it, not never.
  assert.equal(bookProgress(1, 2, 0, 1), 1);
  assert.equal(bookProgress(0, 0, 0, 1), 0, "a book with no chapters");
});

test("a gesture commits to being a turn as soon as it crosses the bar", () => {
  // Asked mid-drag, so the browser can be stopped from selecting text under a
  // swipe. Waiting for the finger to lift meant a slow swipe ended with a
  // paragraph highlighted and no page turned.
  assert.equal(isTurning(-50, 4, 360), true);
  assert.equal(isTurning(50, 4, 360), true, "either direction");
  assert.equal(isTurning(-40, 4, 360), false, "not far enough yet");
  assert.equal(isTurning(-80, 120, 360), false, "that is a scroll");
  assert.equal(turnBar(360), 360 * 0.12);
  assert.equal(turnBar(2000), TURN_PX, "capped");
  assert.equal(turnBar(50), 16, "and floored");
});
