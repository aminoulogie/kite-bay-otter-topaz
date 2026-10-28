import assert from "node:assert/strict";
import { test } from "node:test";
import { owed, standbyByClient } from "./standby.ts";
import type { Shift } from "./worklog.ts";

const H = 3_600_000;
const day = new Date(2026, 9, 28, 0, 0).getTime();
const shift = (client: string, from: number, to: number, breaks: [number, number][] = []): Shift => ({
  id: `${client}${from}`, client, start: day + from * H, end: day + to * H,
  breaks: breaks.map(([a, b]) => ({ start: day + a * H, end: day + b * H })), activities: [],
});

test("the gaps between a client's shifts in a day are standby, paid at half", () => {
  // 9-12 and 14-18 with a half-hour break: worked 6.5 h, window 9 h, standby 2.5 h.
  const m = standbyByClient([shift("Acme", 9, 12), shift("Acme", 14, 18, [[16, 16.5]]), shift("Beta", 10, 11)], undefined, undefined, day + 24 * H);
  const a = m.get("Acme")!;
  assert.equal(a.workedMs, 6.5 * H);
  assert.equal(a.standbyMs, 2.5 * H);
  assert.equal(owed(a, 1000), 6.5 * 1000 + 2.5 * 500);
  assert.equal(m.get("Beta")!.standbyMs, 0);
});
