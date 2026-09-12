import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_MINUTES, MIN_TREND_DAYS, TREND_NOISE_MIN, againstPlan, bars, clampMinutes, formatMinutes,
  lastNDays, parseDuration, peak, topApp, trend, unaccounted, verdict, windowFor,
  type ScreenLog,
} from "./screen-time.ts";

const TODAY = "2026-09-12";

/** n days ending today, each with the given minutes. */
function run(minutes: number[], end = TODAY): ScreenLog {
  const dates = lastNDays(end, minutes.length);
  const out: ScreenLog = {};
  dates.forEach((d, i) => {
    out[d] = { total: minutes[i]! };
  });
  return out;
}

test("a bare number is minutes, not hours", () => {
  assert.equal(parseDuration("252"), 252);
  assert.equal(parseDuration("45"), 45);
  assert.equal(parseDuration("4"), 4, "reading this as four hours would quadruple the day");
});

test("every shape Screen Time prints reads the same", () => {
  assert.equal(parseDuration("4h 12m"), 252);
  assert.equal(parseDuration("4h12m"), 252);
  assert.equal(parseDuration("4:12"), 252);
  assert.equal(parseDuration("4h"), 240);
  assert.equal(parseDuration("12m"), 12);
  assert.equal(parseDuration("12 min"), 12);
  assert.equal(parseDuration("  4H 12M  "), 252);
});

test("a decimal hour is accepted, comma or point", () => {
  assert.equal(parseDuration("4.5h"), 270);
  assert.equal(parseDuration("4,5h"), 270);
});

test("nonsense reads as nothing rather than zero", () => {
  for (const bad of ["", "   ", "soon", "h", "m", "4h 99x", "--"]) {
    assert.equal(parseDuration(bad), null, `"${bad}"`);
  }
});

test("a duration can never exceed the day", () => {
  assert.equal(parseDuration("30h"), MAX_MINUTES);
  assert.equal(clampMinutes(99999), MAX_MINUTES);
  assert.equal(clampMinutes(-5), 0);
  assert.equal(clampMinutes(Number.NaN), 0);
});

test("minutes print the way the rest of the app prints hours", () => {
  assert.equal(formatMinutes(252), "4h 12m");
  assert.equal(formatMinutes(240), "4h");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(0), "0m");
});

test("an unlogged day is unknown, not a zero that flatters the average", () => {
  const log: ScreenLog = { [TODAY]: { total: 300 } };
  const w = windowFor(log, lastNDays(TODAY, 7));
  assert.equal(w.days, 1);
  assert.equal(w.average, 300, "one logged day of five hours averages five hours, not forty minutes");
});

test("an empty window averages zero without dividing by it", () => {
  const w = windowFor({}, lastNDays(TODAY, 7));
  assert.deepEqual(w, { days: 0, total: 0, average: 0 });
});

test("a trend needs enough days on both sides before it says anything", () => {
  const thin = run([300, 300], TODAY);
  assert.equal(trend(thin, TODAY).direction, "unknown");

  // A full recent week but nothing before it is still unknown.
  const oneSided = run([300, 300, 300, 300, 300, 300, 300], TODAY);
  assert.equal(trend(oneSided, TODAY).direction, "unknown");
  assert.ok(trend(oneSided, TODAY).recent.days >= MIN_TREND_DAYS);
});

test("two full weeks give a direction", () => {
  const log = run(new Array(7).fill(200).concat(new Array(7).fill(320)), TODAY);
  const t = trend(log, TODAY);
  assert.equal(t.direction, "up");
  assert.equal(t.delta, 120);
  assert.equal(t.prior.average, 200);
  assert.equal(t.recent.average, 320);
});

test("a small change is flat rather than a direction", () => {
  const log = run(new Array(7).fill(200).concat(new Array(7).fill(200 + TREND_NOISE_MIN - 1)), TODAY);
  assert.equal(trend(log, TODAY).direction, "flat");
});

test("the two windows never overlap", () => {
  // Seven logged days, all recent. If the windows overlapped the prior one
  // would borrow from them and report days it does not have.
  const log = run(new Array(7).fill(200), TODAY);
  const t = trend(log, TODAY);
  assert.equal(t.recent.days, 7);
  assert.equal(t.prior.days, 0);
});

test("the phone is measured against flexible time, not the whole day", () => {
  const p = againstPlan(120, 6);
  assert.equal(p.flexibleMin, 360);
  assert.equal(Math.round(p.share * 100), 33);
  assert.equal(p.over, false);
});

test("more phone than flexible time is reported, not clamped away", () => {
  const p = againstPlan(420, 6);
  assert.equal(p.over, true);
  assert.ok(p.share > 1);
});

test("a day with no flexible time at all does not divide by zero", () => {
  const p = againstPlan(90, 0);
  assert.equal(p.share, 0);
  assert.equal(p.over, true, "any phone time is over a plan with none to spare");
  const none = againstPlan(0, 0);
  assert.equal(none.over, false);
});

test("the verdict states the two numbers and nothing else", () => {
  assert.equal(
    verdict({ total: 120 }, 6),
    "2h of the 6h flexible today — 33%.",
  );
  assert.equal(
    verdict({ total: 420 }, 6),
    "7h on the phone — more than the 6h this day left flexible.",
  );
  assert.equal(verdict({ total: 120 }, 0), "2h on the phone.");
  assert.equal(verdict(undefined, 6), null);
});

test("the top app is the biggest one actually named", () => {
  const day = { total: 300, apps: [{ name: "Safari", min: 40 }, { name: "Instagram", min: 150 }] };
  assert.equal(topApp(day)?.name, "Instagram");
  assert.equal(topApp({ total: 300 }), null);
  assert.equal(topApp({ total: 300, apps: [] }), null);
  assert.equal(topApp({ total: 300, apps: [{ name: "  ", min: 90 }] }), null, "a blank name is not an app");
  assert.equal(topApp({ total: 300, apps: [{ name: "Mail", min: 0 }] }), null);
});

test("what the breakdown does not account for is the rest of the total", () => {
  assert.equal(unaccounted({ total: 300, apps: [{ name: "Safari", min: 100 }] }), 200);
  assert.equal(unaccounted({ total: 300 }), 300);
  // Naming more than the total is the user's arithmetic, not a crash.
  assert.equal(unaccounted({ total: 100, apps: [{ name: "Safari", min: 300 }] }), 0);
});

test("the strip keeps a slot for every day, logged or not", () => {
  const log: ScreenLog = { [TODAY]: { total: 300 } };
  const list = bars(log, TODAY, 7);
  assert.equal(list.length, 7);
  assert.equal(list[6]?.min, 300, "today is the last bar");
  assert.equal(list[0]?.min, null, "an unlogged day is a gap, not a floor");
});

test("the strip always has something to scale against", () => {
  assert.equal(peak(bars({}, TODAY, 7)), 60);
  assert.equal(peak(bars({ [TODAY]: { total: 300 } }, TODAY, 7)), 300);
});

test("corrupt totals in storage are skipped rather than poisoning the average", () => {
  const log = {
    [TODAY]: { total: Number.NaN as number },
    ...run([200, 200], "2026-09-11"),
  };
  const w = windowFor(log, lastNDays(TODAY, 7));
  assert.equal(w.days, 2);
  assert.equal(w.average, 200);
});
