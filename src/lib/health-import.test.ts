import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nightOf, parseHealthCsv, parseHealthDate, parseHealthFile, parseHealthXml, planMerge,
} from "./health-import.ts";

/** Records exactly as Apple writes them, one per line. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
 <Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-09-01 08:12:33 +0100" endDate="2026-09-01 08:12:33 +0100" value="80.4"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-09-01 21:02:00 +0100" endDate="2026-09-01 21:02:00 +0100" value="81.2"/>
 <Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-09-01 09:00:00 +0100" endDate="2026-09-01 10:00:00 +0100" value="900"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisInBed" startDate="2026-09-01 22:30:00 +0100" endDate="2026-09-02 06:30:00 +0100"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-09-01 23:00:00 +0100" endDate="2026-09-02 02:00:00 +0100"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-09-02 02:00:00 +0100" endDate="2026-09-02 03:30:00 +0100"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepREM" startDate="2026-09-02 03:30:00 +0100" endDate="2026-09-02 06:00:00 +0100"/>
</HealthData>`;

test("Apple's date format is read, not guessed at", () => {
  const d = parseHealthDate("2026-09-01 08:12:33 +0100")!;
  assert.ok(d);
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(parseHealthDate("not a date"), null);
  assert.equal(parseHealthDate(""), null);
});

test("the last weigh-in of the day wins", () => {
  // Morning and evening on the same date are one fact measured twice, not two.
  const r = parseHealthXml(XML);
  const day = r.days.find((d) => d.date === "2026-09-01")!;
  assert.equal(day.weightKg, 81.2);
  assert.equal(r.weights, 1);
});

test("pounds are converted rather than logged as kilos", () => {
  const lb = `<Record type="HKQuantityTypeIdentifierBodyMass" unit="lb" startDate="2026-09-01 08:00:00 +0100" endDate="2026-09-01 08:00:00 +0100" value="176.4"/>`;
  const day = parseHealthXml(lb).days[0]!;
  assert.ok(Math.abs(day.weightKg! - 80) < 0.2, `got ${day.weightKg}`);
});

test("sleep is summed across the night's fragments", () => {
  // Health writes a dozen fragments a night as you move between stages, and
  // reading any single one would report forty minutes of sleep.
  const night = parseHealthXml(XML).days.find((d) => d.date === "2026-09-02")!;
  assert.equal(night.sleepHours, 7, "3h core + 1.5h deep + 2.5h REM");
});

test("time in bed is not time asleep", () => {
  // The InBed record spans 8h. Counting it would add two hours a night of
  // lying there reading.
  const night = parseHealthXml(XML).days.find((d) => d.date === "2026-09-02")!;
  assert.notEqual(night.sleepHours, 8);
});

test("an evening bedtime belongs to the next morning's log", () => {
  assert.equal(nightOf(new Date("2026-09-01T23:00:00")), "2026-09-02");
  assert.equal(nightOf(new Date("2026-09-02T02:00:00")), "2026-09-02");
  assert.equal(nightOf(new Date("2026-09-02T13:00:00")), "2026-09-02", "an afternoon nap is today");
});

test("records that are neither weight nor sleep are ignored, not skipped", () => {
  const r = parseHealthXml(XML);
  // The step count is simply not this app's business; it is not a parse error.
  assert.equal(r.skipped, 0);
});

test("a corrupt record is skipped and counted rather than imported", () => {
  const bad = [
    `<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="nonsense" value="80"/>`,
    `<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-09-01 08:00:00 +0100" value="0"/>`,
    `<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-09-01 23:00:00 +0100" endDate="2026-09-01 22:00:00 +0100"/>`,
  ].join("\n");
  const r = parseHealthXml(bad);
  assert.equal(r.days.length, 0);
  assert.equal(r.skipped, 3);
});

test("a fragment longer than a day is corrupt, not a long lie-in", () => {
  const silly = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-09-01 23:00:00 +0100" endDate="2026-09-05 06:00:00 +0100"/>`;
  const r = parseHealthXml(silly);
  assert.equal(r.days.length, 0);
  assert.equal(r.skipped, 1);
});

// ------------------------------------------------------------------- csv --

test("CSV columns are matched by name, not position", () => {
  // Every app orders them differently, and a positional reader silently
  // imports weight as sleep.
  const csv = "Sleep (h);Date;Weight kg\n7.5;2026-09-01;80.4\n6;2026-09-02;80.1";
  const r = parseHealthCsv(csv);
  assert.equal(r.days[0]!.date, "2026-09-01");
  assert.equal(r.days[0]!.weightKg, 80.4);
  assert.equal(r.days[0]!.sleepHours, 7.5);
});

test("a CSV with no date column imports nothing", () => {
  const r = parseHealthCsv("weight,sleep\n80,7");
  assert.deepEqual(r.days, []);
  assert.equal(r.skipped, 1);
});

test("a decimal comma does not become a missing figure", () => {
  const r = parseHealthCsv("date\tweight\tsleep\n2026-09-01\t80,4\t7,5");
  assert.equal(r.days[0]!.weightKg, 80.4);
  assert.equal(r.days[0]!.sleepHours, 7.5);
});

test("either shape is read without being told which", () => {
  assert.ok(parseHealthFile(XML).days.length > 0);
  assert.ok(parseHealthFile("date,weight\n2026-09-01,80").days.length > 0);
  assert.deepEqual(parseHealthFile("").days, []);
});

// ----------------------------------------------------------------- merge --

test("what you typed yourself is never overwritten", () => {
  // You stood on the scale; Health only heard about it.
  const incoming = [{ date: "2026-09-01", weightKg: 79, sleepHours: 5 }];
  const existing = { "2026-09-01": { bodyWeight: 80.4, sleep: { hours: 7.5 } } };
  const plan = planMerge(incoming, existing);
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.kept, 2);
});

test("gaps around what you typed are filled", () => {
  const incoming = [{ date: "2026-09-01", weightKg: 79, sleepHours: 5 }];
  const existing = { "2026-09-01": { bodyWeight: 80.4 } };
  const plan = planMerge(incoming, existing);
  assert.deepEqual(plan.changes, [{ date: "2026-09-01", sleepHours: 5 }]);
  assert.equal(plan.kept, 1);
});

test("overwrite is available, and is never the default", () => {
  const incoming = [{ date: "2026-09-01", weightKg: 79 }];
  const existing = { "2026-09-01": { bodyWeight: 80.4 } };
  assert.deepEqual(planMerge(incoming, existing).changes, []);
  assert.deepEqual(planMerge(incoming, existing, true).changes, [
    { date: "2026-09-01", weightKg: 79 },
  ]);
});

test("a day the app has never seen is a straight add", () => {
  const plan = planMerge([{ date: "2026-09-09", weightKg: 80 }], {});
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.kept, 0);
});

test("a semicolon file with decimal commas is not split mid-number", () => {
  // Most of Europe and North Africa writes "80,4". A greedy split on any of
  // comma/semicolon/tab turns one weight into two cells and imports nothing.
  const r = parseHealthCsv("Date;Weight;Sleep\n2026-09-01;80,4;7,5");
  assert.equal(r.days[0]!.weightKg, 80.4);
  assert.equal(r.days[0]!.sleepHours, 7.5);
});

test("a plain comma file still works", () => {
  const r = parseHealthCsv("date,weight,sleep\n2026-09-01,80.4,7.5");
  assert.equal(r.days[0]!.weightKg, 80.4);
});
