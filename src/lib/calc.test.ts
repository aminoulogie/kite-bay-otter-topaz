import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, isExpression, resolve } from "./calc.ts";

test("sums work out, with precedence and parentheses", () => {
  assert.equal(evaluate("78+87"), 165);
  assert.equal(evaluate("2+3*4"), 14);
  assert.equal(evaluate("(2+3)*4"), 20);
  assert.equal(evaluate("10÷4"), 2.5);
  assert.equal(evaluate("3×2,5"), 7.5);
  assert.equal(evaluate("1+"), null);
  assert.equal(evaluate("alert(1)"), null);
});

test("a plain number is not an expression", () => {
  assert.equal(isExpression("78"), false);
  assert.equal(isExpression("12,5"), false);
  assert.equal(isExpression("-5"), false);
  assert.equal(isExpression("78+87"), true);
});

test("a leading operator applies to what the field held", () => {
  assert.equal(resolve("+67", "70"), 137);
  assert.equal(resolve("70+67", "70"), 137);
  assert.equal(resolve("*2", "70"), 140);
  assert.equal(resolve("-20", "70"), 50);
  // With nothing before it, a minus is just a negative number.
  assert.equal(resolve("-20", ""), null);
  assert.equal(resolve("0.1+0.2"), 0.3);
});
