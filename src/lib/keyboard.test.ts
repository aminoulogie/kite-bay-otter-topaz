import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIELD_GAP, KEYBOARD_MIN, insetFrom, keyboardTopFrom, liftFor,
} from "./keyboard.ts";

// ---------------------------------------------------------------- inset --

test("the keyboard is the difference between the two viewports", () => {
  assert.equal(insetFrom({ height: 500, offsetTop: 0 }, 800), 300);
});

test("a page scrolled inside its visual viewport does not inflate the keyboard", () => {
  // 800 - (500 + 100) would be 200 if offsetTop were ignored, not 300.
  assert.equal(insetFrom({ height: 500, offsetTop: 100 }, 800), 200);
});

test("browser chrome is not a keyboard", () => {
  assert.equal(insetFrom({ height: 800 - KEYBOARD_MIN + 1, offsetTop: 0 }, 800), 0);
  assert.equal(insetFrom({ height: 800 - KEYBOARD_MIN, offsetTop: 0 }, 800), KEYBOARD_MIN);
});

test("no keyboard, and no visual viewport at all, both read as zero", () => {
  assert.equal(insetFrom({ height: 800, offsetTop: 0 }, 800), 0);
  assert.equal(insetFrom(null, 800), 0);
  assert.equal(insetFrom(undefined, 800), 0);
});

test("nonsense measurements report no keyboard rather than a wrong one", () => {
  assert.equal(insetFrom({ height: Number.NaN, offsetTop: 0 }, 800), 0);
  assert.equal(insetFrom({ height: 500, offsetTop: 0 }, Number.NaN), 0);
});

test("a taller viewport than window never reports a negative keyboard", () => {
  assert.equal(insetFrom({ height: 900, offsetTop: 0 }, 800), 0);
});

// ----------------------------------------------------------------- lift --

test("a field already clear of the keyboard is left alone", () => {
  assert.equal(liftFor(100, 140, 500), 0);
});

test("a field behind the keyboard is lifted exactly clear of it", () => {
  // Bottom at 520, keys start at 500: 20 over, plus the gap.
  assert.equal(liftFor(480, 520, 500), 20 + FIELD_GAP);
});

test("a field touching the keyboard still gets its gap", () => {
  assert.equal(liftFor(460, 500, 500), FIELD_GAP);
});

test("a field is never pushed off the top of the screen to clear the bottom", () => {
  // Wants to move 400px; only 30 - gap of room above it.
  assert.equal(liftFor(30, 900, 500), 30 - FIELD_GAP);
});

test("a field scrolled above the fold is pulled back down", () => {
  assert.equal(liftFor(-60, -20, 500), -60 - FIELD_GAP);
});

test("an unmeasurable field is not moved", () => {
  assert.equal(liftFor(Number.NaN, 10, 500), 0);
  assert.equal(liftFor(10, Number.NaN, 500), 0);
  assert.equal(liftFor(10, 20, Number.NaN), 0);
});

// ------------------------------------------------------------ keyboard top --

test("the keyboard starts where the visible slice ends", () => {
  assert.equal(keyboardTopFrom({ height: 500, offsetTop: 0 }, 800), 500);
  assert.equal(keyboardTopFrom({ height: 500, offsetTop: 40 }, 800), 540);
});

test("with no visual viewport the window bottom is the best guess", () => {
  assert.equal(keyboardTopFrom(null, 800), 800);
  assert.equal(keyboardTopFrom({ height: Number.NaN, offsetTop: 0 }, 800), 800);
});
