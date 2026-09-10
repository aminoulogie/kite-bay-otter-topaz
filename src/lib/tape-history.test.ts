import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HISTORY_LIMIT, NOISE_CM, deltaLabel, deltaTone, tapeHistories, tapeHistory,
} from "./tape-history.ts";
import type { NutritionDay } from "./types.ts";

const day = (measurements: Record<string, number>) =>
  ({ goals: {}, water: 0, creatine: 0, items: [], measurements }) as unknown as NutritionDay;

test("a site never measured has no history rather than a history of zeroes", () => {
  const h = tapeHistory({ "2026-09-01": day({ waist: 82 }) }, "neck");
  assert.deepEqual(h.readings, []);
  assert.equal(h.latest, null);
  assert.equal(h.net, null);
});

test("days without a reading are absent, not zero", () => {
  // The specific failure: treating an unmeasured day as 0cm draws a chart that
  // plunges to the floor on every day nobody got the tape out.
  const h = tapeHistory(
    {
      "2026-09-01": day({ waist: 82 }),
      "2026-09-02": day({}),
      "2026-09-08": day({ waist: 81.5 }),
    },
    "waist",
  );
  assert.equal(h.readings.length, 2);
  assert.ok(h.readings.every((r) => r.value > 0));
});

test("readings come back newest first, because that is how they are read", () => {
  const h = tapeHistory(
    { "2026-09-08": day({ waist: 81 }), "2026-09-01": day({ waist: 82 }) },
    "waist",
  );
  assert.equal(h.readings[0]!.date, "2026-09-08");
  assert.equal(h.latest!.value, 81);
});

test("the delta is against last time, not against the first ever reading", () => {
  const h = tapeHistory(
    {
      "2026-07-01": day({ armL: 36 }),
      "2026-08-01": day({ armL: 38 }),
      "2026-09-01": day({ armL: 38.5 }),
    },
    "armL",
  );
  assert.equal(h.readings[0]!.delta, 0.5, "half a centimetre since August");
  assert.equal(h.readings[0]!.gapDays, 31);
  assert.equal(h.readings[2]!.delta, null, "the oldest shown here is the first there is");
  assert.equal(h.net, 2.5);
  assert.equal(h.spanDays, 62);
});

test("capping the list does not orphan the oldest row shown", () => {
  // Deltas must be computed before the cap: slicing first would report the
  // ninth-oldest reading as the first ever taken.
  const nutrition: Record<string, NutritionDay> = {};
  for (let i = 1; i <= 12; i++) {
    nutrition[`2026-09-${String(i).padStart(2, "0")}`] = day({ waist: 90 - i });
  }
  const h = tapeHistory(nutrition, "waist");
  assert.equal(h.readings.length, HISTORY_LIMIT);
  assert.equal(h.readings[0]!.date, "2026-09-12");
  const last = h.readings[h.readings.length - 1]!;
  assert.equal(last.date, "2026-09-05");
  assert.equal(last.delta, -1, "it knows what it moved from");
});

test("a quarter of a centimetre is where the tape sits, not where the muscle is", () => {
  assert.equal(deltaLabel(0.1), "no real change");
  assert.equal(deltaLabel(-0.2), "no real change");
  assert.equal(deltaTone(0.2), "flat");
  assert.equal(deltaLabel(NOISE_CM + 0.05), "+0.3 cm");
  assert.equal(deltaTone(-1), "down");
  assert.equal(deltaLabel(null), "first reading");
});

test("only sites with something to show come back", () => {
  const nutrition = { "2026-09-01": day({ waist: 82, neck: 39 }) };
  const sites = tapeHistories(nutrition, ["waist", "neck", "calf"]);
  assert.deepEqual(sites.map((s) => s.key), ["waist", "neck"]);
});

test("a nonsense reading is dropped rather than charted", () => {
  const h = tapeHistory(
    {
      "2026-09-01": day({ waist: 82 }),
      "2026-09-02": day({ waist: 0 }),
      "2026-09-03": day({ waist: Number.NaN }),
    },
    "waist",
  );
  assert.equal(h.readings.length, 1);
});
