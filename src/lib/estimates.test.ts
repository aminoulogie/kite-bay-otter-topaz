import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bodyweightEstimate, confidenceNote, measurementEstimates, strengthEstimates,
} from "./estimates.ts";

const days = (from: string, vals: number[], key: "bodyWeight" | "arm") => {
  const out: Record<string, unknown> = {};
  const d = new Date(from + "T00:00:00");
  for (const v of vals) {
    const p = (n: number) => String(n).padStart(2, "0");
    const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    out[k] = key === "bodyWeight" ? { bodyWeight: v } : { measurements: { arm: v } };
    d.setDate(d.getDate() + 7);
  }
  return out as never;
};

test("a steady gain projects forward", () => {
  const e = bodyweightEstimate(days("2026-01-01", [78, 78.5, 79, 79.5, 80, 80.5, 81, 81.5], "bodyWeight"));
  assert.ok(e.ratePerMonth > 1.5 && e.ratePerMonth < 2.6, `~2kg/mo, got ${e.ratePerMonth}`);
  assert.ok(e.projections[0]!.delta > 0, "30 days should be higher");
});

test("projections decay rather than extrapolating straight", () => {
  // A straight line from a good month says you bench 200kg by summer.
  const e = bodyweightEstimate(days("2026-01-01", [78, 79, 80, 81, 82, 83, 84, 85], "bodyWeight"));
  const d30 = e.projections.find((p) => p.horizon === 30)!.delta;
  const d180 = e.projections.find((p) => p.horizon === 180)!.delta;
  assert.ok(d180 < d30 * 6, `180d must be under 6x the 30d figure, got ${d180} vs ${d30}`);
  assert.ok(d180 > d30, "but still further along");
});

test("a single outlier does not set the trend", () => {
  // Regression, not last-minus-first: one heavy day at the end would otherwise
  // define the whole projection.
  const flat = bodyweightEstimate(days("2026-01-01", [80, 80, 80, 80, 80, 80, 80, 84], "bodyWeight"));
  assert.ok(flat.ratePerMonth < 2.5, `one spike should not imply a big rate, got ${flat.ratePerMonth}`);
});

test("too little data reports none rather than a number", () => {
  const e = bodyweightEstimate(days("2026-01-01", [80, 80.2], "bodyWeight"));
  assert.equal(e.confidence, "none");
});

test("confidence rises with the span of data", () => {
  const short = bodyweightEstimate(days("2026-01-01", [80, 80.4, 80.8, 81], "bodyWeight"));
  const long = bodyweightEstimate(
    days("2026-01-01", Array.from({ length: 20 }, (_, i) => 80 + i * 0.2), "bodyWeight"),
  );
  assert.ok(["low", "medium"].includes(short.confidence), short.confidence);
  assert.equal(long.confidence, "high");
});

test("strength projections never go below zero", () => {
  const log = [{
    name: "Bench", key: null, group: "Chest",
    days: Object.fromEntries(
      [100, 80, 60, 40, 20, 10].map((w, i) => [
        `2026-0${i + 1}-01`, [{ weight: w, reps: 5, failure: 0 }],
      ]),
    ),
  }];
  const [e] = strengthEstimates(log as never);
  assert.ok(e);
  for (const p of e!.projections) assert.ok(p.value >= 0, `negative projection: ${p.value}`);
});

test("measurements are projected per site", () => {
  const e = measurementEstimates(days("2026-01-01", [38, 38.3, 38.6, 39, 39.3, 39.6], "arm"));
  assert.equal(e.length, 1);
  assert.equal(e[0]!.unit, "cm");
  assert.ok(e[0]!.ratePerMonth > 0);
});

test("confidence notes say what is behind the number", () => {
  assert.match(confidenceNote("low", 20), /direction, not a number/);
  assert.match(confidenceNote("none", 0), /Not enough/);
});
