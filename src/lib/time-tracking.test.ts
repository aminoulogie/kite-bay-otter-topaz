import assert from "node:assert/strict";
import { test } from "node:test";
import { asTimeEntries, billable, clock, durationMs, hours, running, timesheet, type TimeEntry } from "./time-tracking.ts";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime(); // Oct 2026; 5th is a Monday

test("durations, running timers and the overnight cap", () => {
  const e: TimeEntry = { id: "a", projectId: "p", start: at(5, 9), end: at(5, 10, 30) };
  assert.equal(durationMs(e), 90 * 60_000);
  const live: TimeEntry = { id: "b", projectId: "p", start: at(5, 9) };
  assert.equal(running([e, live])?.id, "b");
  assert.equal(durationMs(live, at(5, 9, 45)), 45 * 60_000);
  assert.equal(durationMs(live, at(6, 9)), 12 * 3600_000, "a forgotten timer stops counting at 12 h");
  assert.equal(clock(3_909_000), "1:05:09");
  assert.equal(hours(200 * 60_000), "3h 20m");
});

test("timesheet rows per project per day", () => {
  const entries: TimeEntry[] = [
    { id: "1", projectId: "a", start: at(5, 9), end: at(5, 11) },
    { id: "2", projectId: "a", start: at(7, 9), end: at(7, 10) },
    { id: "3", projectId: "b", start: at(5, 14), end: at(5, 14, 30) },
    { id: "4", projectId: "b", start: at(12, 9), end: at(12, 10) },
  ];
  const t = timesheet(entries, "2026-10-05");
  assert.deepEqual(t.rows.get("a")!.map((ms) => ms / 3600_000), [2, 0, 1, 0, 0, 0, 0]);
  assert.equal(t.dayTotals[0], 2.5 * 3600_000);
  assert.equal(t.total, 3.5 * 3600_000);
});

test("billable value uses each project's rate and skips non-billable", () => {
  const entries: TimeEntry[] = [
    { id: "1", projectId: "a", start: at(5, 9), end: at(5, 11) },
    { id: "2", projectId: "a", start: at(5, 12), end: at(5, 13), billable: false },
  ];
  const b = billable(entries, () => 5000);
  assert.deepEqual(b.get("a"), { ms: 3 * 3600_000, billableMs: 2 * 3600_000, value: 10000 });
});

test("cleaning drops junk and bad ends", () => {
  assert.deepEqual(asTimeEntries([{ id: "x", projectId: "p", start: 10, end: 5 }, { nope: 1 }, null]), [
    { id: "x", projectId: "p", start: 10, end: undefined, note: undefined, billable: undefined },
  ]);
});
