import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyCsv, nutritionCsv, setsCsv } from "./csv-export.ts";
import { checksum } from "./checksum.ts";

const history = {
  "2026-09-01": {
    timestamp: 1, split: "Push", durationFormatted: "", caloriesBurned: 0,
    totalVol: 0, totalSets: 1, axialVol: 0, muscles: {},
    exercises: [{
      name: 'Lat Pulldown (Wide/Neutral), "wide"', muscle: "Back", subTarget: "Lats",
      targetKeys: [], position: "", risk: "", tier: "", isAxial: false, isBW: false,
      usesBar: true, barWeight: 20, supersetGroup: "", pump: 2,
      sets: [{ weight: 80, reps: 12, failure: 5, done: true, type: "normal",
               limiter: "target", closeness: "nothing", burn: 3 }],
    }],
  },
} as never;

test("a name containing commas and quotes cannot shift the columns", () => {
  // "Lat Pulldown (Wide/Neutral)" unquoted would push every later column one
  // across and silently corrupt the file.
  const csv = setsCsv(history).content;
  const line = csv.split("\r\n")[1]!;
  assert.ok(line.includes('"Lat Pulldown (Wide/Neutral), ""wide"""'), line);
  assert.equal(line.split(",").length > 16, true, "quoted field keeps the row intact");
});

test("set quality fields are exported, not just weight and reps", () => {
  const csv = setsCsv(history).content;
  assert.ok(csv.includes("limiter"));
  assert.ok(csv.split("\r\n")[1]!.includes("target"));
  assert.ok(csv.split("\r\n")[1]!.includes("nothing"));
});

test("an unlogged day exports blank, never zero", () => {
  // A zero would read as a day of fasting and wreck any spreadsheet average.
  const csv = dailyCsv({ "2026-09-02": { items: [], goals: {}, water: 0 } } as never).content;
  const row = csv.split("\r\n")[1]!;
  assert.ok(row.startsWith("2026-09-02,,,,,"), row);
});

test("the file starts with a BOM so Excel reads UTF-8", () => {
  // Without it the Arabic food names are mangled on first open.
  assert.equal(nutritionCsv({} as never).content.charCodeAt(0), 0xfeff);
});

test("checksum changes when the payload changes", () => {
  assert.notEqual(checksum('{"a":1}'), checksum('{"a":2}'));
  assert.equal(checksum('{"a":1}'), checksum('{"a":1}'));
});

test("checksum is stable and short", () => {
  assert.match(checksum("anything"), /^[0-9a-f]{8}$/);
});
