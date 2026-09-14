import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_GAP, TURN_PX, bookProgress, clampPage, damp, isTurning, pageCount, pageForX,
  pageOffset, tapAt, turnBar, turnFrom,
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

test("a point in the strip maps back to the page it is on", () => {
  const w = 360;
  assert.equal(pageForX(0, w), 0);
  assert.equal(pageForX(w - 1, w), 0);
  assert.equal(pageForX(w + PAGE_GAP, w), 1);
  assert.equal(pageForX(3 * (w + PAGE_GAP) + 5, w), 3);
  assert.equal(pageForX(-20, w), 0, "never before the first page");
  assert.equal(pageForX(100, 0), 0, "nothing measured yet");
});

test("a word that lands in the gutter belongs to the page it flowed out of", () => {
  const w = 360;
  // The gap sits between page 0 and page 1; anything in it is still page 0.
  assert.equal(pageForX(w + 1, w), 0);
  assert.equal(pageForX(w + PAGE_GAP - 1, w), 0);
});

test("pageForX undoes pageOffset", () => {
  const w = 393;
  for (let n = 0; n < 20; n++) assert.equal(pageForX(pageOffset(n, w), w), n, `page ${n}`);
});

test("a drag runs free inside the book and drags its heels at the ends", () => {
  assert.equal(damp(-120, true), -120);
  assert.equal(damp(-120, false), -24);
  assert.equal(damp(0, false), 0);
  assert.ok(Math.abs(damp(300, false)) < 300, "pulling against the cover is heavy");
});

test("a reader with nothing else to scroll answers a swipe sooner", () => {
  // The paged reader has no vertical scrolling of its own, so a drag can only
  // mean one thing and there is no reason to make the reader feel stuck.
  assert.equal(turnBar(393, true), 14);
  assert.ok(turnBar(393, true) < turnBar(393), "sooner than where a scroll competes");
  assert.equal(isTurning(-16, 0, 393, true), true);
  assert.equal(isTurning(-16, 0, 393, false), false, "still strict where it must be");
});

test("a thumb that arcs across the screen is still turning a page", () => {
  // A real swipe is not a straight horizontal line. Insisting that it be more
  // horizontal than vertical refused about a third of genuine turns.
  assert.equal(isTurning(-60, 90, 393, true), true, "an arcing sweep");
  assert.equal(turnFrom(-60, 90, 393, true), "next");
  assert.equal(isTurning(-60, 90, 393, false), false, "and is refused where a scroll competes");
  // Straight down is never a page turn, whatever else is going on.
  assert.equal(isTurning(-10, 200, 393, true), false);
  assert.equal(turnFrom(-10, 200, 393, true), "stay");
});
