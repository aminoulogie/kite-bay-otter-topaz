import assert from "node:assert/strict";
import { test } from "node:test";
import { asShifts, hhmm, timeAfter, breakMs, byClient, onBreak, openShift, workedMs, type Shift } from "./worklog.ts";

const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m).getTime();

test("worked = time on the clock minus breaks; running shifts and breaks count to now", () => {
  const s: Shift = { id: "a", client: "Acme", start: at(9), end: at(17), breaks: [{ start: at(12), end: at(12, 45) }], activities: [] };
  assert.equal(workedMs(s), 7.25 * 3600_000);
  const live: Shift = { id: "b", client: "Acme", start: at(9), breaks: [{ start: at(11) }], activities: [] };
  assert.equal(openShift([s, live])?.id, "b");
  assert.ok(onBreak(live));
  assert.equal(breakMs(live, at(11, 30)), 30 * 60_000);
  assert.equal(workedMs(live, at(11, 30)), 2 * 3600_000);
});

test("a shift left open stops counting at 16 hours", () => {
  const s: Shift = { id: "a", client: "Acme", start: at(8), breaks: [], activities: [] };
  assert.equal(workedMs(s, at(8) + 30 * 3600_000), 16 * 3600_000);
});

test("totals per client in a range", () => {
  const list: Shift[] = [
    { id: "1", client: "Acme", start: at(9), end: at(13), breaks: [], activities: [] },
    { id: "2", client: "Beta", start: at(14), end: at(15), breaks: [], activities: [] },
    { id: "3", client: "Acme", start: new Date(2026, 9, 9, 9).getTime(), end: new Date(2026, 9, 9, 10).getTime(), breaks: [], activities: [] },
  ];
  const r = byClient(list, "2026-10-05", "2026-10-05");
  assert.deepEqual(r.get("Acme"), { ms: 4 * 3600_000, shifts: 1 });
  assert.deepEqual(r.get("Beta"), { ms: 3600_000, shifts: 1 });
});

test("cleaning keeps good shifts and activities", () => {
  const out = asShifts([{ id: "x", client: "Acme", start: 5, end: 3, breaks: [{ start: 1 }, { nope: 1 }], activities: [{ id: "a1", text: "Did it", done: true, projectId: "" }] }, { id: 2 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.end, undefined);
  assert.equal(out[0]!.breaks.length, 1);
  assert.deepEqual(out[0]!.activities[0], { id: "a1", projectId: undefined, text: "Did it", nextStep: undefined, stepId: undefined, done: true, notes: undefined });
});

test("times past midnight land on the next day", () => {
  const start = timeAfter("2026-10-05", "22:00")!;
  assert.equal(start, at(22));
  assert.equal(timeAfter("2026-10-05", "02:30", start), new Date(2026, 9, 6, 2, 30).getTime());
  assert.equal(timeAfter("2026-10-05", "23:00", start), at(23));
  assert.equal(timeAfter("2026-10-05", "nope"), null);
  assert.equal(hhmm(at(9, 5)), "09:05");
});
