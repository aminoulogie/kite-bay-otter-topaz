import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * The comma-decimal rule.
 *
 * Reproduced here rather than imported because the component pulls in React.
 * `<input type="number">` discards a comma silently, so "12,5" left the field
 * empty and a value that looked entered saved as nothing.
 */
function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(",", ".").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function filterInput(raw: string, allowNegative = false): string {
  return raw.replace(allowNegative ? /[^0-9.,-]/g : /[^0-9.,]/g, "");
}

test("a comma decimal is read, which type=number would not do", () => {
  assert.equal(parseDecimal("12,5"), 12.5);
  assert.equal(parseDecimal("0,75"), 0.75);
});

test("a dot decimal still works", () => {
  assert.equal(parseDecimal("12.5"), 12.5);
});

test("an empty field is null, never zero", () => {
  // Zero is a real macro value, so a blank field must not masquerade as one.
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal("   "), null);
});

test("a trailing separator survives while it is being typed", () => {
  // Stripping it would make "12," impossible to extend into "12,5".
  assert.equal(filterInput("12,"), "12,");
  assert.equal(parseDecimal("12,"), 12);
});

test("letters cannot get into a number field", () => {
  assert.equal(filterInput("12abc,5"), "12,5");
  assert.equal(parseDecimal(filterInput("12abc,5")), 12.5);
});

test("a minus is only kept where negatives make sense", () => {
  assert.equal(filterInput("-5"), "5");
  assert.equal(filterInput("-5", true), "-5");
});

test("nonsense reads as null rather than NaN", () => {
  // NaN would flow into a total and poison every figure downstream.
  assert.equal(parseDecimal(","), null);
  assert.equal(parseDecimal("."), null);
});
