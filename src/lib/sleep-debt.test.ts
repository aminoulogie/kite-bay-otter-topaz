import assert from "node:assert/strict";
import { test } from "node:test";
import { currentDebt, nightsToClear, sleepDebtSeries } from "./sleep-debt.ts";

const nights = (from: string, hours: number[]) =>
  hours.map((h, i) => {
    const d = new Date(from + "T00:00:00");
    d.setDate(d.getDate() + i);
    const p = (n: number) => String(n).padStart(2, "0");
    return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hours: h };
  });

test("short nights build debt", () => {
  const d = currentDebt(nights("2026-01-01", [6, 6, 6, 6, 6]));
  assert.ok(d > 4, `five nights two hours short should show real debt, got ${d}`);
});

test("sleeping the target holds debt near zero", () => {
  assert.equal(currentDebt(nights("2026-01-01", [8, 8, 8, 8, 8])), 0);
});

test("debt decays instead of climbing forever", () => {
  // A number that only ever grows is both wrong and useless — after a bad
  // month it reads as unpayable and nobody acts on it.
  const short = currentDebt(nights("2026-01-01", Array(40).fill(6)));
  assert.ok(short < 20, `40 short nights should not simply total 80h, got ${short}`);
});

test("a long night pays debt back, but not hour for hour", () => {
  const base = currentDebt(nights("2026-01-01", [6, 6, 6, 6]));
  const repaid = currentDebt(nights("2026-01-01", [6, 6, 6, 6, 11]));
  assert.ok(repaid < base, "a long night should reduce it");
  assert.ok(repaid > base - 3, "but three extra hours must not erase eight of debt");
});

test("debt is capped rather than running away", () => {
  const d = currentDebt(nights("2026-01-01", Array(90).fill(3)));
  assert.ok(d <= 30, `should cap, got ${d}`);
});

test("the series reports every night, not just the total", () => {
  const s = sleepDebtSeries(nights("2026-01-01", [6, 7, 8]));
  assert.equal(s.length, 3);
  assert.ok(s[0]!.debt > 0);
  assert.deepEqual(s.map((p) => p.hours), [6, 7, 8]);
});

test("nights to clear reflects partial repayment", () => {
  // Telling someone one lie-in clears a week would be wrong.
  const n = nightsToClear(9, 1.5);
  assert.ok(n! >= 9, `9h of debt at 1.5h extra should take many nights, got ${n}`);
});

test("no debt needs no nights", () => {
  assert.equal(nightsToClear(0), 0);
});

test("nights out of order are still read in order", () => {
  const inOrder = sleepDebtSeries(nights("2026-01-01", [5, 8, 8]));
  const shuffled = sleepDebtSeries([...nights("2026-01-01", [5, 8, 8])].reverse());
  assert.deepEqual(
    shuffled.map((p) => p.debt),
    inOrder.map((p) => p.debt),
  );
});
