import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAether, scanTitle } from "./aether-import.ts";

test("a plain list of scans is read", () => {
  const out = parseAether(JSON.stringify([
    { date: "2026-09-01", evenness: 93.1, cva: 51 },
    { date: "2026-09-08", evenness: 94.2, cva: 52.4 },
  ]));
  assert.equal(out.scans.length, 2);
  assert.equal(out.scans[0]?.date, "2026-09-08", "newest first");
  assert.equal(out.skipped, 0);
});

test("a wrapped export is read too, at either depth", () => {
  const row = { date: "2026-09-08", evenness: 90 };
  assert.equal(parseAether(JSON.stringify({ scans: [row] })).scans.length, 1);
  assert.equal(parseAether(JSON.stringify({ data: { scans: [row] } })).scans.length, 1);
  assert.equal(parseAether(JSON.stringify({ records: [row] })).scans.length, 1);
});

test("alpha is converted, and a percentage is not converted twice", () => {
  // Alpha is a Procrustes distance where smaller is more even. Running the
  // conversion over a number that is already a percentage would halve it.
  assert.equal(parseAether(JSON.stringify([{ date: "2026-09-08", alpha: 0.058 }])).scans[0]?.evenness, 94.2);
  assert.equal(parseAether(JSON.stringify([{ date: "2026-09-08", evenness: 94.2 }])).scans[0]?.evenness, 94.2);
});

test("a timestamp is accepted as well as a date", () => {
  assert.equal(parseAether(JSON.stringify([{ capturedAt: "2026-09-08T14:32:11Z", cva: 52 }])).scans[0]?.date, "2026-09-08");
});

test("a row with a date and no reading is a blank, not a scan", () => {
  const out = parseAether(JSON.stringify([
    { date: "2026-09-08" },
    { date: "2026-09-09", cva: 52 },
  ]));
  assert.equal(out.scans.length, 1);
  assert.equal(out.skipped, 1, "counted, so the total is never silently short");
});

test("a reading outside its range is refused rather than clamped", () => {
  // A CVA of 400 is a unit error, and importing it as 180 would bury that.
  assert.equal(parseAether(JSON.stringify([{ date: "2026-09-08", cva: 400 }])).scans.length, 0);
  assert.equal(parseAether(JSON.stringify([{ date: "2026-09-08", evenness: 140 }])).scans.length, 0);
  assert.equal(parseAether(JSON.stringify([{ date: "2026-09-08", alpha: 7 }])).scans.length, 0);
});

test("a comma decimal is read, since that is what the keyboard types", () => {
  assert.equal(parseAether(JSON.stringify([{ date: "2026-09-08", cva: "52,4" }])).scans[0]?.cva, 52.4);
});

test("junk is rejected with a reason, not silently emptied", () => {
  assert.match(parseAether("not json").reason ?? "", /not valid JSON/);
  assert.match(parseAether(JSON.stringify({ hello: 1 })).reason ?? "", /No scans found/);
});

test("the stored line matches what the tab writes by hand", () => {
  assert.equal(scanTitle({ date: "x", evenness: 94.2, cva: 52 }), "Scan · evenness 94.2 · CVA 52°");
  assert.equal(scanTitle({ date: "x", cva: 52 }), "Scan · CVA 52°");
});
