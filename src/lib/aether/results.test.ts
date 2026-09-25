import assert from "node:assert/strict";
import { test } from "node:test";
import { METRICS, baselinePair, rows, series, sweepScans } from "./results.ts";
import type { ScanRecord } from "./scan-store.ts";

function scan(at: string, asym: number, noise: number, jaw: number | null): ScanRecord {
  return {
    id: at, date: at.slice(0, 10), capturedAt: at, kind: "face_front_true",
    depth: {
      sweep: {
        frames: 60, sweepCoverage: 1, coverage: 1, cellNoiseMm: 0.5,
        symmetry: { rmsMm: asym, p95Mm: 0, byThird: { upper: 0, middle: 0, lower: 0 }, leftMinusRightMm: { upper: 0, middle: 0, lower: 0 }, midlineDeg: 0, pairs: 900 },
        symmetryNoiseMm: noise, cheekWidthMm: 140, jawWidthMm: jaw, chinBehindNoseMm: 9,
      },
    } as unknown as ScanRecord["depth"],
  };
}

test("change against the FIRST scan, with a verdict that knows which way is better", () => {
  const sweeps = sweepScans([scan("2026-03-29T10:00:00Z", 0.7, 0.05, 121), scan("2026-03-01T10:00:00Z", 1.0, 0.05, 118)]);
  const byKey = new Map(rows(sweeps).map((r) => [r.def.key, r]));
  const asym = byKey.get("asym")!;
  assert.ok(Math.abs(asym.delta! + 0.3) < 1e-9);
  assert.equal(asym.verdict, "good"); // less asymmetry is better
  assert.equal(byKey.get("jaw")!.verdict, "good"); // wider jaw is the goal
  assert.equal(byKey.get("cheek")!.verdict, "neutral"); // no better direction
});

test("a change inside the noise is called that, not good or bad", () => {
  const sweeps = sweepScans([scan("2026-03-01T10:00:00Z", 1.0, 0.3, 118), scan("2026-03-29T10:00:00Z", 0.8, 0.3, 118)]);
  const asym = rows(sweeps).find((r) => r.def.key === "asym")!;
  assert.equal(asym.withinNoise, true);
  assert.equal(asym.verdict, "neutral");
});

test("a metric missing from the first scan compares against the first scan that has it", () => {
  const sweeps = sweepScans([
    scan("2026-03-01T10:00:00Z", 1, 0.05, null),
    scan("2026-03-08T10:00:00Z", 1, 0.05, 116),
    scan("2026-03-29T10:00:00Z", 1, 0.05, 120),
  ]);
  assert.equal(rows(sweeps).find((r) => r.def.key === "jaw")!.delta, 4);
});

test("chart series carries the noise band and respects the range", () => {
  const sweeps = sweepScans([scan("2026-03-01T10:00:00Z", 1.0, 0.1, 118), scan("2026-03-29T10:00:00Z", 0.8, 0.2, 118)]);
  const asym = METRICS.find((m) => m.key === "asym")!;
  const all = series(sweeps, asym);
  assert.equal(all.length, 2);
  assert.ok(Math.abs(all[1]!.hi - 1.0) < 1e-9 && Math.abs(all[1]!.lo - 0.6) < 1e-9);
  assert.equal(series(sweeps, asym, Date.parse("2026-03-15T00:00:00Z")).length, 1);
});

test("two scans back to back set the noise floor for calling a change", () => {
  const sweeps = sweepScans([
    scan("2026-03-01T10:00:00Z", 1.0, 0.02, 118),
    scan("2026-03-01T10:05:00Z", 1.3, 0.02, 118), // same face, 5 min later: 0.3 apart
    scan("2026-03-29T10:00:00Z", 1.4, 0.02, 118),
  ]);
  assert.equal(baselinePair(sweeps)![1].capturedAt, "2026-03-01T10:05:00Z");
  // 0.4 from the first scan: outside the ±0.02 each scan claims, but inside
  // twice the 0.3 the baseline day showed.
  assert.equal(rows(sweeps).find((r) => r.def.key === "asym")!.withinNoise, true);
});
