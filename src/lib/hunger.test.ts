import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_HUNGER_PENALTY, hungerNote, hungerOn, hungerPenalty, hungryDayRate,
  type HungerEntry,
} from "./hunger.ts";

const e = (level: 1 | 2 | 3, date = "2026-09-10"): HungerEntry =>
  ({ date, at: `${date}T12:00:00.000Z`, level });

test("a cut is never penalised for hunger", () => {
  // Docking points here would punish someone for their deficit working, and
  // would make the score reward eating more during a cut.
  assert.equal(hungerPenalty([e(3), e(3), e(3)], "cut"), 0);
  assert.match(hungerNote([e(3)], "cut"), /deficit working/i);
});

test("a bulk is penalised, because hunger means the surplus did not happen", () => {
  assert.ok(hungerPenalty([e(2)], "bulk") > 0);
  assert.match(hungerNote([e(2)], "bulk"), /surplus did not happen/i);
});

test("maintenance is a milder signal than a bulk", () => {
  assert.ok(hungerPenalty([e(2)], "maintain") < hungerPenalty([e(2)], "bulk"));
  assert.ok(hungerPenalty([e(2)], "maintain") > 0);
});

test("worse hunger costs more", () => {
  assert.ok(hungerPenalty([e(3)], "bulk") > hungerPenalty([e(1)], "bulk"));
});

test("logging honestly through a bad day is not punished linearly", () => {
  // Someone who logs three times should not be docked three times as much as
  // someone who logged once and gave up — that teaches people to stop logging.
  const once = hungerPenalty([e(2)], "bulk");
  const thrice = hungerPenalty([e(2), e(2), e(2)], "bulk");
  assert.ok(thrice > once, "still worse");
  assert.ok(thrice < once * 3, "but not proportionally");
});

test("the penalty is capped, so one bad day never collapses a score", () => {
  const many = Array.from({ length: 40 }, () => e(3));
  assert.equal(hungerPenalty(many, "bulk"), MAX_HUNGER_PENALTY);
  assert.ok(MAX_HUNGER_PENALTY <= 10, "a tenth of the day at most");
});

test("nothing logged costs nothing and says so", () => {
  assert.equal(hungerPenalty([], "bulk"), 0);
  assert.match(hungerNote([], "bulk"), /Nothing logged/);
});

test("only that day's entries count", () => {
  const all = [e(2, "2026-09-09"), e(3, "2026-09-10"), e(1, "2026-09-10")];
  assert.equal(hungerOn(all, "2026-09-10").length, 2);
  assert.equal(hungerOn(all, "2026-09-08").length, 0);
});

test("the rate is over days asked about, not days logged", () => {
  // Otherwise a week with one hungry day and six unlogged reads as 100%.
  const entries = [e(2, "2026-09-08"), e(2, "2026-09-10")];
  const week = ["2026-09-06","2026-09-07","2026-09-08","2026-09-09","2026-09-10"];
  assert.equal(hungryDayRate(entries, week), 40);
  assert.equal(hungryDayRate(entries, []), null);
});
