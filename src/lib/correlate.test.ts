import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_PAIRS, pairUp, pearson, shortfall, strongestFinding, type Series,
} from "./correlate.ts";

const series = (label: string, entries: [string, number][]): Series =>
  ({ label, values: new Map(entries) });

/** n days of a perfectly rising series, for building test inputs. */
const rising = (n: number, from = 1, step = 1): [string, number][] =>
  Array.from({ length: n }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, from + i * step]);

test("a perfect straight line is r = 1, and its mirror is -1", () => {
  assert.equal(pearson([{ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 6 }]), 1);
  assert.equal(pearson([{ a: 1, b: 6 }, { a: 2, b: 4 }, { a: 3, b: 2 }]), -1);
});

test("a series that never varies has no answer, not an answer of zero", () => {
  // A month of identical sleep correlates with nothing, and saying 0 would
  // report that as "no relationship" rather than "the question does not apply".
  assert.equal(pearson([{ a: 5, b: 1 }, { a: 5, b: 2 }, { a: 5, b: 3 }]), null);
  assert.equal(pearson([{ a: 1, b: 1 }]), null);
  assert.equal(pearson([]), null);
});

test("only days where BOTH were logged are paired", () => {
  // Pairing a missing figure against zero is how you manufacture a
  // correlation out of the days you forgot to log.
  const a = series("A", [["2026-09-01", 1], ["2026-09-02", 2], ["2026-09-03", 3]]);
  const b = series("B", [["2026-09-02", 9]]);
  assert.deepEqual(pairUp(a, b), [{ a: 2, b: 9 }]);
});

test("a strong relationship on too few days is not reported", () => {
  // Thirteen perfect days is still not enough, and this is the gate that stops
  // the screen inventing a finding in its first fortnight.
  const days = MIN_PAIRS - 1;
  const found = strongestFinding([
    series("Sleep", rising(days)),
    series("Session score", rising(days, 10, 2)),
  ]);
  assert.equal(found, null);
  assert.equal(shortfall([series("Sleep", rising(days)), series("Session score", rising(days))]), 1);
});

test("a strong relationship on enough days is reported, with its count", () => {
  const found = strongestFinding([
    series("Sleep", rising(MIN_PAIRS)),
    series("Session score", rising(MIN_PAIRS, 10, 2)),
  ]);
  assert.ok(found);
  assert.equal(found!.n, MIN_PAIRS);
  assert.equal(found!.r, 1);
  assert.match(found!.text, /moved together across 14 days/);
});

test("a weak relationship is a cloud, and stays unmentioned", () => {
  const noise = Array.from({ length: 30 }, (_, i): [string, number] =>
    [`2026-09-${String(i + 1).padStart(2, "0")}`, [3, 1, 4, 1, 5, 9, 2, 6][i % 8]!]);
  const other = Array.from({ length: 30 }, (_, i): [string, number] =>
    [`2026-09-${String(i + 1).padStart(2, "0")}`, [8, 7, 1, 8, 2, 8, 1, 3][i % 8]!]);
  const found = strongestFinding([series("A", noise), series("B", other)]);
  if (found) assert.ok(Math.abs(found.r) >= 0.45, "anything reported cleared the bar");
});

test("an inverse relationship is worded as one, without a cause", () => {
  const found = strongestFinding([
    series("Spending", rising(MIN_PAIRS)),
    series("Session score", rising(MIN_PAIRS, 100, -3)),
  ]);
  assert.ok(found);
  assert.ok(found!.r < 0);
  assert.match(found!.text, /higher on days .* was lower/);
  // Never a causal claim: these are both what a bad week looks like.
  assert.doesNotMatch(found!.text, /because|causes|caused|makes|due to/i);
});

test("the strongest is chosen, not the first", () => {
  const found = strongestFinding([
    series("A", rising(MIN_PAIRS)),
    // Weakly related to A.
    series("B", Array.from({ length: MIN_PAIRS }, (_, i): [string, number] =>
      [`2026-09-${String(i + 1).padStart(2, "0")}`, [1, 9, 2, 8, 3, 7, 4][i % 7]!])),
    // Perfectly related to A.
    series("C", rising(MIN_PAIRS, 5, 3)),
  ]);
  assert.equal(found?.b, "C");
});

test("nothing to compare is null, not a crash", () => {
  assert.equal(strongestFinding([]), null);
  assert.equal(strongestFinding([series("A", rising(30))]), null);
  assert.equal(shortfall([]), MIN_PAIRS);
});
