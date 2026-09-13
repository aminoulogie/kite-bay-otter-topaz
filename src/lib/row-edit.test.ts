import assert from "node:assert/strict";
import { test } from "node:test";
import { numOf, textOf } from "./row-edit.ts";

test("a blank field reads as unset, not as zero or an empty string", () => {
  assert.equal(numOf({ a: "" }, "a"), undefined);
  assert.equal(numOf({ a: "   " }, "a"), undefined);
  assert.equal(textOf({ a: "" }, "a"), undefined);
  assert.equal(textOf({ a: "  " }, "a"), undefined);
});

test("a missing field is unset rather than a crash", () => {
  assert.equal(numOf({}, "nope"), undefined);
  assert.equal(textOf({}, "nope"), undefined);
  assert.equal(numOf(undefined as unknown as Record<string, string>, "a"), undefined);
});

test("a comma is a decimal point, as it is everywhere else in this app", () => {
  assert.equal(numOf({ a: "80,4" }, "a"), 80.4);
  assert.equal(numOf({ a: "80.4" }, "a"), 80.4);
});

test("a number that is not a number stays unset", () => {
  assert.equal(numOf({ a: "abc" }, "a"), undefined);
  assert.equal(numOf({ a: "1,2,3" }, "a"), undefined);
});

test("zero is a value and survives", () => {
  assert.equal(numOf({ a: "0" }, "a"), 0);
});

test("text is trimmed, not merely passed through", () => {
  assert.equal(textOf({ a: "  Floss  " }, "a"), "Floss");
});
