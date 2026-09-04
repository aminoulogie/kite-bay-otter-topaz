import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentSaturation, saturationLabel, saturationSeries, supplyStatus,
} from "./creatine.ts";

function daily(from: string, days: number, grams: number): Record<string, number> {
  const out: Record<string, number> = {};
  const d = new Date(from + "T00:00:00");
  for (let i = 0; i < days; i++) {
    const p = (n: number) => String(n).padStart(2, "0");
    out[`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`] = grams;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

test("saturation actually moves — the reported bug", () => {
  // It sat still because nothing integrated the log; a dose today only means
  // something in the context of every day before it.
  const s = saturationSeries(daily("2026-01-01", 10, 5));
  assert.ok(s[0]!.saturation > 0, "day one should register");
  assert.ok(s[9]!.saturation > s[0]!.saturation, "it must climb across the days");
});

test("a month of maintenance dosing lands near saturated", () => {
  const pct = currentSaturation(daily("2026-01-01", 28, 5));
  assert.ok(pct > 85 && pct <= 100, `28 days at 5g should be ~90%+, got ${pct}`);
});

test("loading fills faster, but nowhere near four times faster", () => {
  // The ceiling is a ceiling: 20g/day is quicker, not quadruple.
  const load = currentSaturation(daily("2026-01-01", 7, 20));
  const maint = currentSaturation(daily("2026-01-01", 7, 5));
  assert.ok(load > maint, "loading should be ahead after a week");
  assert.ok(load < maint * 4, "but not proportionally to the dose");
  assert.ok(load > 60, `a week of loading should be well along, got ${load}`);
});

test("missing one day barely moves it", () => {
  // The honest answer, and the opposite of what a streak counter would say.
  const full = daily("2026-01-01", 30, 5);
  const withGap = { ...full, "2026-01-20": 0 };
  const a = currentSaturation(full);
  const b = currentSaturation(withGap);
  assert.ok(a - b < 3, `one missed day should cost little, cost ${a - b}`);
});

test("stopping for a month washes out slowly, not instantly", () => {
  const doses = { ...daily("2026-01-01", 28, 5), ...daily("2026-01-29", 30, 0) };
  const after = currentSaturation(doses);
  assert.ok(after < 90, "it should fall");
  assert.ok(after > 35, `but muscle stores take weeks, got ${after}`);
});

test("unlogged gaps are walked, not skipped", () => {
  // Iterating only logged days would treat a three-week hole as one missed day.
  const sparse = { "2026-01-01": 5, "2026-03-01": 5 };
  const series = saturationSeries(sparse);
  assert.ok(series.length > 55, "every day between must be walked");
  const end = series[series.length - 1]!.saturation;
  assert.ok(end < 15, `two months of nothing should leave it low, got ${end}`);
});

test("run-out date uses real intake, not the nominal dose", () => {
  // Taking it half the time really does make a tub last twice as long.
  const everyDay = supplyStatus(300, daily("2026-01-01", 30, 5), "2026-01-30");
  const halfTheTime = supplyStatus(
    300,
    Object.fromEntries(Object.entries(daily("2026-01-01", 30, 5)).map(([d, g], i) => [d, i % 2 ? g : 0])),
    "2026-01-30",
  );
  assert.ok(halfTheTime.daysLeft! > everyDay.daysLeft!, "a skipped dose stretches the tub");
});

test("no run-out date claimed when nothing has been taken", () => {
  const s = supplyStatus(300, {}, "2026-01-30");
  assert.equal(s.daysLeft, null);
  assert.equal(s.runsOut, null, "guessing a date from no data would be a fiction");
});

test("an empty tub reports no days left", () => {
  assert.equal(supplyStatus(0, daily("2026-01-01", 30, 5), "2026-01-30").daysLeft, null);
});

test("labels describe the state plainly", () => {
  assert.equal(saturationLabel(95), "saturated");
  assert.equal(saturationLabel(50), "filling");
  assert.equal(saturationLabel(0), "empty");
});
