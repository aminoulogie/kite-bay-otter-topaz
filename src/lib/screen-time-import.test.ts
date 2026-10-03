import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScreenTimeText, readDuration, textFromLink } from "./screen-time-import.ts";

test("durations the way Screen Time prints them", () => {
  assert.equal(readDuration("3h 25m"), 205);
  assert.equal(readDuration("3 h 25 min"), 205);
  assert.equal(readDuration("45m"), 45);
  assert.equal(readDuration("1h"), 60);
  assert.equal(readDuration("Instagram"), null);
  assert.equal(readDuration("85"), null);
});

test("the day view: total first, axis labels ignored, apps under Most used", () => {
  const text = [
    "21:47", "Screen Time", "iPhone", "Week", "Day", "Today", "3h 25m",
    "60m", "30m", "0m", "Social", "Entertainment", "Productivity",
    "MOST USED", "SHOW CATEGORIES",
    "Instagram", "1h 12m", "Safari", "45m", "WhatsApp", "22m", "YouTube 18m",
    "PICKUPS", "First Pickup 07:12", "Total Pickups 85",
  ].join("\n");
  const r = parseScreenTimeText(text)!;
  assert.equal(r.total, 205);
  assert.equal(r.yesterday, false);
  assert.equal(r.average, false);
  assert.deepEqual(r.apps.map((a) => a.name), ["Instagram", "Safari", "WhatsApp", "YouTube"]);
  assert.equal(r.apps[0]!.min, 72);
  assert.equal(r.pickups, 85);
});

test("yesterday and the week average are flagged", () => {
  assert.equal(parseScreenTimeText("Yesterday\n2h 3m")!.yesterday, true);
  const w = parseScreenTimeText("Screen Time\nDaily Average\n4h 12m\n6h\n3h")!;
  assert.equal(w.average, true);
  assert.equal(w.total, 252);
});

test("French screenshots", () => {
  const r = parseScreenTimeText("Temps d'écran\nAujourd'hui\n2 h 5 min\nLES PLUS UTILISÉES\nTikTok\n1 h 2 min")!;
  assert.equal(r.total, 125);
  assert.deepEqual(r.apps, [{ name: "TikTok", min: 62 }]);
});

test("nothing readable", () => {
  assert.equal(parseScreenTimeText("hello"), null);
  assert.equal(parseScreenTimeText(""), null);
});

test("links", () => {
  assert.equal(textFromLink("soma://screentime?text=Today%0A3h%2025m"), "Today\n3h 25m");
  assert.equal(textFromLink("soma://other?text=x"), null);
  assert.equal(textFromLink("https://x.com"), null);
});
