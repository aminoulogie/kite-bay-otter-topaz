import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHECK_IDS, DAILY_LOSS_LIMIT, MIN_SAMPLE, PIP, RISK_MAX, SYSTEMS, checksFor, keepChecks,
  bestSystem, cleanTrade, gate, isOpen, lossesOn, lotTable, maxStopPips, openTrade,
  outcome, pipValue, pips, profit, rMultiple, report, rewardRatio, riskMoney, riskPercent,
  stopPips, suggestLots, summarise, systemName, verdictFor,
  type Trade, type TradeDraft,
} from "./trading.ts";

const EQUITY = 119;
const TODAY = "2026-09-15";

/** A draft that passes everything, so each test can break one thing. */
const draft = (over: Partial<TradeDraft> = {}): TradeDraft => ({
  system: "ema-pullback",
  direction: "buy",
  reason: "EMA pullback: EMA20 over EMA50 both rising, green candle closed back above EMA20 with RSI 58.",
  lots: 0.01,
  entry: 1.17000,
  stop: 1.16900,          // 10 pips
  target: 1.17200,        // 20 pips, so 2R
  // Every box this system asks for: its own entry conditions first, then
  // the ones true of any trade.
  checks: checksFor(over.system ?? "ema-pullback").map((c) => c.id),
  ...over,
});

const trade = (over: Partial<Trade> = {}): Trade => ({
  ...draft(),
  id: "t1",
  date: TODAY,
  openedAt: Date.parse(`${TODAY}T09:00:00Z`),
  equityAtEntry: EQUITY,
  ...over,
});

const ctx = (over: Partial<{ equity: number; trades: Trade[]; today: string; now: Date }> = {}) => ({
  equity: EQUITY,
  trades: [] as Trade[],
  today: TODAY,
  // Inside the session-breakout window, so only the tests that care about it
  // have to think about the clock.
  now: new Date("2026-09-15T08:30:00Z"),
  ...over,
});

// ---------------------------------------------------------------- maths --

test("a pip is worth ten cents at the size this account trades", () => {
  assert.equal(pipValue(0.01), 0.1);
  assert.equal(Math.round(pipValue(0.02) * 100) / 100, 0.2);
  assert.equal(Math.round(pipValue(0.03) * 100) / 100, 0.3);
});

test("distance is read in pips off the 5-decimal quote", () => {
  assert.equal(Math.round(pips(1.17000, 1.16900)), 10);
  // The stop off the user's own log: 15.5 pips, not 155.
  assert.ok(Math.abs(pips(1.15709, 1.15864) - 15.5) < 1e-9);
  assert.equal(pips(1.17, 1.17), 0);
});

test("the lot table matches the one worked out by hand at this equity", () => {
  // The user's own table: 12 / 6 / 4 pips at 1%, and 24 / 12 / 8 at 2%.
  const rows = lotTable(EQUITY).map((r) => [r.lots, Math.floor(r.atTarget), Math.floor(r.atMax)]);
  assert.deepEqual(rows, [
    [0.01, 11, 23],
    [0.02, 5, 11],
    [0.03, 3, 7],
  ]);
  // Floor, not round, is why those read one under: 1% of $119 is $1.19, which
  // buys 11.9 pips at 0.01 lots. Eleven whole pips is inside the rule and
  // twelve is a hair outside it, and the hair is on the wrong side.
  assert.ok(Math.abs(maxStopPips(0.01, EQUITY) - 11.9) < 1e-9);
});

test("the table grows with the account instead of being frozen at today's size", () => {
  assert.ok(Math.abs(maxStopPips(0.01, 238) - 23.8) < 1e-9);
  assert.equal(maxStopPips(0.01, 0), 0);
});

test("the suggested lot is the biggest one that still obeys the 1% rule", () => {
  assert.equal(suggestLots(4, EQUITY), 0.02);   // 0.03 allows 3.9
  assert.equal(suggestLots(10, EQUITY), 0.01);
  assert.equal(suggestLots(3, EQUITY), 0.03);
  // Wider than even the smallest lot can carry: the answer is "don't", not a
  // rounded-down size that breaks the rule quietly.
  assert.equal(suggestLots(40, EQUITY), null);
});

test("risk is the stop distance times what a pip is worth", () => {
  assert.equal(Math.round(riskMoney(draft()) * 100) / 100, 1);
  // The trade from the user's own log: 0.03 lots with a 15.5-pip stop.
  const bad = draft({ lots: 0.03, entry: 1.15709, stop: 1.15864, direction: "sell", target: 1.15400 });
  assert.equal(Math.round(riskMoney(bad) * 100) / 100, 4.65);
  assert.ok(riskPercent(bad, EQUITY) > 0.039 && riskPercent(bad, EQUITY) < 0.04);
});

test("reward to risk is the target distance over the stop distance", () => {
  assert.ok(Math.abs(rewardRatio(draft()) - 2) < 1e-9);
  assert.ok(Math.abs(rewardRatio(draft({ target: 1.17150 })) - 1.5) < 1e-9);
  // No stop distance is no ratio rather than a division by zero.
  assert.equal(rewardRatio(draft({ stop: 1.17 })), 0);
});

// ----------------------------------------------------------------- gate --

test("a trade that follows every rule passes with nothing to say", () => {
  const g = gate(draft(), ctx());
  assert.deepEqual(g.blocks, []);
  assert.deepEqual(g.warnings, []);
  assert.equal(g.ok, true);
});

test("a stop on the wrong side of the entry is refused, both directions", () => {
  const buy = gate(draft({ stop: 1.17100 }), ctx());
  assert.ok(buy.blocks.some((b) => b.id === "stop-side"));
  const sell = gate(
    draft({ direction: "sell", stop: 1.16900, target: 1.16800 }),
    ctx(),
  );
  assert.ok(sell.blocks.some((b) => b.id === "stop-side"));
  assert.equal(sell.ok, false);
});

test("a target on the wrong side is refused too", () => {
  const g = gate(draft({ target: 1.16800 }), ctx());
  assert.ok(g.blocks.some((b) => b.id === "target-side"));
});

test("a correct sell passes", () => {
  const g = gate(
    draft({ direction: "sell", entry: 1.17000, stop: 1.17100, target: 1.16800 }),
    ctx(),
  );
  assert.equal(g.ok, true);
});

test("under 1.5R is blocked, and between 1.5 and 2 is only a warning", () => {
  const thin = gate(draft({ target: 1.17120 }), ctx());   // 1.2R
  assert.ok(thin.blocks.some((b) => b.id === "rr"));
  const ok = gate(draft({ target: 1.17160 }), ctx());     // 1.6R
  assert.equal(ok.ok, true);
  assert.ok(ok.warnings.some((w) => w.id === "rr-thin"));
});

test("over 2% of the account is blocked and told what size would fit", () => {
  const g = gate(
    draft({ lots: 0.03, direction: "sell", entry: 1.15709, stop: 1.15864, target: 1.15400 }),
    ctx(),
  );
  const risk = g.blocks.find((b) => b.id === "risk");
  assert.ok(risk, "a 3.9% risk must be blocked");
  assert.match(risk!.message, /3\.9%/);
  assert.match(risk!.message, /0\.01 lots/);
});

test("between 1% and 2% is allowed but said out loud", () => {
  // 15 pips at 0.01 lots is $1.50, about 1.26% of $119.
  const g = gate(draft({ stop: 1.16850, target: 1.17300 }), ctx());
  assert.equal(g.ok, true);
  assert.ok(g.warnings.some((w) => w.id === "risk-high"));
});

test("a stop too wide for even the smallest lot says skip it", () => {
  const g = gate(draft({ stop: 1.16500, target: 1.18000 }), ctx());
  assert.match(g.blocks.find((b) => b.id === "risk")!.message, /skip it/);
});

test("no sentence, no trade", () => {
  const g = gate(draft({ reason: "   " }), ctx());
  assert.ok(g.blocks.some((b) => b.id === "reason"));
});

test("every confirmation has to be ticked, and the last one is named", () => {
  const all = checksFor("ema-pullback").map((c) => c.id);
  const one = gate(draft({ checks: all.slice(0, -1) }), ctx());
  const issue = one.blocks.find((b) => b.id === "checks")!;
  assert.match(issue.message, /One thing left/);
  const none = gate(draft({ checks: [] }), ctx());
  assert.match(none.blocks.find((b) => b.id === "checks")!.message, new RegExp(`${all.length} things`));
});

test("each system asks its own entry conditions, before the shared ones", () => {
  for (const sys of SYSTEMS) {
    const list = checksFor(sys.id);
    assert.ok(sys.entry.length >= 3, `${sys.name} needs its rules as ticks`);
    assert.deepEqual(
      list.slice(0, sys.entry.length).map((c) => c.id),
      sys.entry.map((c) => c.id),
      "the system's own conditions come first",
    );
    assert.deepEqual(list.slice(sys.entry.length).map((c) => c.id), CHECK_IDS);
    // No two systems may share a tick id, or switching would carry one over.
    for (const other of SYSTEMS) {
      if (other.id === sys.id) continue;
      for (const c of sys.entry) {
        assert.ok(
          !other.entry.some((o) => o.id === c.id),
          `${c.id} appears in both ${sys.name} and ${other.name}`,
        );
      }
    }
  }
});

test("the vague catch-all is gone: no box asks whether the rules were followed", () => {
  assert.ok(!CHECK_IDS.includes("matches"));
});

test("switching system keeps what still applies and drops what does not", () => {
  const ticked = [...checksFor("ema-pullback").map((c) => c.id)];
  const kept = keepChecks("sr-retest", ticked);
  // The shared ones survive; the EMA-specific ones do not.
  assert.deepEqual(kept, CHECK_IDS);
  assert.deepEqual(keepChecks("ema-pullback", ticked), ticked);
  assert.deepEqual(keepChecks(undefined, ticked), CHECK_IDS);
});

test("a second trade is refused while one is still open", () => {
  const g = gate(draft(), ctx({ trades: [trade({ id: "open" })] }));
  const issue = g.blocks.find((b) => b.id === "one-at-a-time");
  assert.ok(issue);
  assert.match(issue!.message, /EMA Pullback/);
});

test("a closed trade does not count as one still open", () => {
  const closed = trade({ id: "done", exit: 1.17200, closedAt: Date.now() });
  assert.equal(gate(draft(), ctx({ trades: [closed] })).ok, true);
});

test("two losses in a day closes the day", () => {
  const loser = (id: string) => trade({ id, exit: 1.16900, closedAt: Date.now() });
  const g = gate(draft(), ctx({ trades: [loser("a"), loser("b")] }));
  assert.ok(g.blocks.some((b) => b.id === "daily-loss"));
  // Yesterday's losses are yesterday's problem.
  const old = [loser("a"), loser("b")].map((t) => ({ ...t, date: "2026-09-14" }));
  assert.equal(gate(draft(), ctx({ trades: old })).ok, true);
});

test("one loss and one win is not two losses", () => {
  const trades = [
    trade({ id: "a", exit: 1.16900, closedAt: Date.now() }),
    trade({ id: "b", exit: 1.17200, closedAt: Date.now() }),
  ];
  assert.equal(lossesOn(trades, TODAY), 1);
  assert.equal(gate(draft(), ctx({ trades })).ok, true);
});

test("session breakout is refused outside its window", () => {
  const late = gate(
    draft({ system: "session-breakout" }),
    ctx({ now: new Date("2026-09-15T11:00:00Z") }),
  );
  assert.ok(late.blocks.some((b) => b.id === "breakout-window"));
  const early = gate(
    draft({ system: "session-breakout" }),
    ctx({ now: new Date("2026-09-15T06:59:00Z") }),
  );
  assert.ok(early.blocks.some((b) => b.id === "breakout-window"));
  const inside = gate(
    draft({ system: "session-breakout" }),
    ctx({ now: new Date("2026-09-15T09:59:00Z") }),
  );
  assert.equal(inside.ok, true);
});

test("the window applies to session breakout only", () => {
  const g = gate(draft(), ctx({ now: new Date("2026-09-15T22:00:00Z") }));
  assert.equal(g.ok, true);
});

test("an account balance of nothing blocks rather than dividing by zero", () => {
  const g = gate(draft(), ctx({ equity: 0 }));
  assert.ok(g.blocks.some((b) => b.id === "equity"));
  assert.equal(riskPercent(draft(), 0), 0);
});

test("missing prices are one clear block, not four confusing ones", () => {
  const g = gate(draft({ entry: NaN, stop: NaN, target: NaN }), ctx());
  assert.ok(g.blocks.some((b) => b.id === "prices"));
  assert.equal(g.blocks.filter((b) => b.id.endsWith("-side")).length, 0);
});

// ---------------------------------------------------------------- close --

test("profit is the pips it moved your way, in dollars", () => {
  // 20 pips at 0.01 lots is $2.
  assert.equal(Math.round(profit(trade({ exit: 1.17200 })) * 100) / 100, 2);
  // The stop: 10 pips against, $1.
  assert.equal(Math.round(profit(trade({ exit: 1.16900 })) * 100) / 100, -1);
});

test("a sell makes money when price falls", () => {
  const sell = trade({ direction: "sell", entry: 1.17000, stop: 1.17100, target: 1.16800 });
  assert.equal(Math.round(profit({ ...sell, exit: 1.16800 }) * 100) / 100, 2);
  assert.equal(Math.round(profit({ ...sell, exit: 1.17100 }) * 100) / 100, -1);
});

test("R is the result measured against what was risked, whatever the lot size", () => {
  // The same idea at three sizes is the same R, which is the whole point.
  for (const lots of [0.01, 0.02, 0.03]) {
    const t = trade({ lots, exit: 1.17200 });
    assert.ok(Math.abs(rMultiple(t) - 2) < 1e-9, `${lots} lots should still be 2R`);
  }
});

test("an open trade has no result yet", () => {
  assert.equal(outcome(trade()), "open");
  assert.equal(isOpen(trade()), true);
  assert.equal(profit(trade()), 0);
  assert.equal(openTrade([trade({ id: "x" })])!.id, "x");
});

test("a trade scratched for pennies is flat, not a win", () => {
  // Counting a four-cent scratch as a win flatters every rate below it.
  assert.equal(outcome(trade({ exit: 1.17000 })), "flat");
  assert.equal(outcome(trade({ exit: 1.17200 })), "win");
  assert.equal(outcome(trade({ exit: 1.16900 })), "loss");
});

// ---------------------------------------------------------------- stats --

const win = (id: string, over: Partial<Trade> = {}) =>
  trade({ id, exit: 1.17200, closedAt: Date.now(), ...over });
const loss = (id: string, over: Partial<Trade> = {}) =>
  trade({ id, exit: 1.16900, closedAt: Date.now(), ...over });

test("win rate is counted over decided trades, not over every row", () => {
  const s = summarise([win("a"), loss("b"), trade({ id: "c" })]);
  assert.equal(s.trades, 3);
  assert.equal(s.open, 1);
  assert.equal(s.winRate, 0.5);
});

test("a flat trade is in neither rate", () => {
  const s = summarise([win("a"), loss("b"), trade({ id: "c", exit: 1.17, closedAt: 1 })]);
  assert.equal(s.flat, 1);
  assert.equal(s.winRate, 0.5, "the scratch does not dilute the rate either way");
});

test("average R is the expectancy the ranking is built on", () => {
  // Two 2R wins and two 1R losses: +4R over four trades, 0.5R each.
  const s = summarise([win("a"), win("b"), loss("c"), loss("d")]);
  assert.ok(Math.abs(s.avgR - 0.5) < 1e-9);
  assert.ok(Math.abs(s.totalR - 2) < 1e-9);
  assert.equal(Math.round(s.net * 100) / 100, 2);
});

test("profit factor is gross win over gross loss, and never NaN", () => {
  assert.ok(Math.abs(summarise([win("a"), loss("b")]).profitFactor - 2) < 1e-9);
  assert.equal(summarise([win("a")]).profitFactor, Infinity);
  assert.equal(summarise([]).profitFactor, 0);
  assert.equal(summarise([loss("a")]).profitFactor, 0);
});

test("the summary counts what the rules care about", () => {
  const s = summarise([
    win("a"),
    loss("b", { closedEarly: true }),
    // 0.03 lots on a 10-pip stop is $3, well over 1% of $119.
    win("c", { lots: 0.03 }),
  ]);
  assert.equal(s.earlyExits, 1);
  assert.equal(s.withinRisk, 2);
  assert.equal(Math.round(s.avgPlannedRR * 100) / 100, 2);
  assert.equal(s.trades, 3);
});

test("an empty log reports zeroes rather than blowing up", () => {
  const s = summarise([]);
  assert.equal(s.trades, 0);
  assert.equal(s.winRate, 0);
  assert.equal(s.avgR, 0);
});

// -------------------------------------------------------------- verdict --

const many = (n: number, make: (i: number) => Trade) => Array.from({ length: n }, (_, i) => make(i));

test("a system is not judged before there are enough trades to judge it", () => {
  // Four wins out of four is also what a coin does one time in sixteen.
  const four = many(4, (i) => win(`w${i}`));
  assert.equal(verdictFor(summarise(four)), "too-early");
  assert.equal(bestSystem(four), null);
});

test("past the sample gate, a profitable system is called working", () => {
  const ten = many(MIN_SAMPLE, (i) => (i % 3 === 0 ? loss(`l${i}`) : win(`w${i}`)));
  assert.equal(verdictFor(summarise(ten)), "working");
  assert.equal(bestSystem(ten)!.system, "ema-pullback");
});

test("a losing system is called losing rather than left unlabelled", () => {
  const ten = many(MIN_SAMPLE, (i) => (i % 4 === 0 ? win(`w${i}`) : loss(`l${i}`)));
  assert.equal(verdictFor(summarise(ten)), "losing");
});

test("break-even is its own answer, not a promising start", () => {
  // Five 2R wins and ten 1R losses is exactly zero, and it is not encouraging.
  const list = [...many(5, (i) => win(`w${i}`)), ...many(10, (i) => loss(`l${i}`))];
  assert.equal(verdictFor(summarise(list)), "flat");
  assert.equal(bestSystem(list), null);
});

test("a small sample never outranks a real one, however good it looks", () => {
  const trades = [
    // Three perfect trades on one system...
    ...many(3, (i) => win(`x${i}`, { system: "sr-retest" })),
    // ...against a proven, merely good one on another.
    ...many(MIN_SAMPLE, (i) =>
      i % 3 === 0 ? loss(`l${i}`, { system: "rsi-divergence" }) : win(`w${i}`, { system: "rsi-divergence" }),
    ),
  ];
  const ranked = report(trades);
  assert.equal(ranked[0]!.system, "rsi-divergence");
  assert.ok(ranked.slice(1).every((r) => r.verdict === "too-early"));
  assert.equal(bestSystem(trades)!.system, "rsi-divergence");
});

test("every system appears in the report, even one never traded", () => {
  const ranked = report([win("a")]);
  assert.equal(ranked.length, 4);
  assert.deepEqual(
    [...ranked].map((r) => r.name).sort(),
    ["EMA Pullback", "RSI Divergence", "S/R Retest", "Session Breakout"],
  );
  assert.equal(systemName("sr-retest"), "S/R Retest");
});

// ---------------------------------------------------------------- clean --

test("rubbish in storage does not become a trade", () => {
  for (const junk of [null, undefined, 7, "x", {}, { id: "" }]) {
    assert.equal(cleanTrade(junk), null);
  }
});

test("a half-written trade is repaired rather than dropped", () => {
  const t = cleanTrade({ id: "x", system: "nonsense", direction: "sideways" })!;
  assert.equal(t.system, "ema-pullback");
  assert.equal(t.direction, "buy");
  assert.equal(t.lots, 0.01);
  assert.deepEqual(t.checks, []);
});

test("a trade with no exit stays open instead of becoming a catastrophic loss", () => {
  // A zero exit price would read as closed, at nought, for minus everything.
  const t = cleanTrade({ id: "x", entry: 1.17, stop: 1.169, target: 1.172 })!;
  assert.equal(t.exit, undefined);
  assert.equal(isOpen(t), true);
  assert.equal(cleanTrade({ id: "x", exit: 1.172 })!.exit, 1.172);
});

test("the constants are the ones the plan was written with", () => {
  assert.equal(PIP, 0.0001);
  assert.equal(RISK_MAX, 0.02);
  assert.equal(DAILY_LOSS_LIMIT, 2);
  // Floating point: the subtraction lands a hair off ten, which is why every
  // comparison in here is a tolerance rather than an equality.
  assert.ok(Math.abs(stopPips({ entry: 1.17, stop: 1.169 }) - 10) < 1e-9);
});

// ------------------------------------------------------- other markets --
//
// The whole reason instruments exist. Every test above is EUR/USD and must
// stay exactly as it was; these are the ones that would have been wrong by
// two orders of magnitude when the pip was a constant.

const gold = (over: Partial<TradeDraft> = {}): TradeDraft =>
  draft({
    instrument: "XAUUSD",
    perPoint: 1,
    entry: 2650.00,
    stop: 2647.00,        // $3, which is 300 points of gold
    target: 2656.00,      // $6, so still 2R
    ...over,
  });

test("gold is counted in gold's own units, not in EUR/USD's", () => {
  assert.equal(Math.round(stopPips(gold())), 300);
  assert.equal(Math.round(targetPipsOf(gold())), 600);
  // The old arithmetic would have called a three-dollar stop 30,000 pips.
  assert.equal(Math.round(pips(2650, 2647)), 30000);
});

function targetPipsOf(d: TradeDraft): number {
  return stopPips({ ...d, stop: d.target });
}

test("a gold stop costs what the ounces cost", () => {
  // 0.01 lots of gold is one ounce; a three-dollar move is three dollars.
  assert.equal(Math.round(riskMoney(gold()) * 100) / 100, 3);
  // Ten times the size, ten times the money.
  assert.equal(Math.round(riskMoney(gold({ lots: 0.1 })) * 100) / 100, 30);
});

test("reward to risk does not care what was traded", () => {
  // Within floating point of exactly 2 in both markets: it is a ratio of two
  // distances in the same quote, so the unit cancels whatever it was.
  assert.ok(Math.abs(rewardRatio(gold()) - 2) < 1e-9);
  assert.ok(Math.abs(rewardRatio(draft()) - 2) < 1e-9);
});

test("a gold trade this account cannot afford is refused, not rounded", () => {
  // $1.19 is 1% of the account; 300 points at a cent a point is $3.
  assert.equal(suggestLots(300, EQUITY, undefined, 1), null);
  // Widen the account and the same stop becomes sizeable.
  assert.equal(suggestLots(300, 1190, undefined, 1), 0.03);
});

test("the lot table is the table for the market you are in", () => {
  const fx = lotTable(EQUITY).map((r) => Math.floor(r.atTarget));
  const au = lotTable(EQUITY, 1).map((r) => Math.round(r.atTarget));
  assert.deepEqual(fx, [11, 5, 3]);
  // A point of gold at 0.01 lots is a cent, so the same 1% carries a hundred
  // times as many of them — and each is worth a hundredth as much.
  assert.deepEqual(au, [119, 59, 40]);
});

test("profit on gold is the move in dollars times the ounces", () => {
  const won = { ...trade(), ...gold(), exit: 2656.00 } as Trade;
  assert.equal(Math.round(profit(won) * 100) / 100, 6);
  assert.equal(outcome(won), "win");
  assert.equal(Math.round(rMultiple(won) * 100) / 100, 2);
});

test("a short on gold makes money when gold falls", () => {
  const won = { ...trade(), ...gold({ direction: "sell", stop: 2653, target: 2644 }), exit: 2644 } as Trade;
  assert.equal(Math.round(profit(won) * 100) / 100, 6);
});

test("an old trade with no instrument is still the EUR/USD trade it was", () => {
  const before = { ...trade() } as Record<string, unknown>;
  delete before.instrument;
  delete before.perPoint;
  const after = cleanTrade(before)!;
  assert.equal(after.instrument, "EURUSD");
  assert.equal(after.perPoint, 10);
  assert.equal(Math.round(riskMoney(after) * 100) / 100, 1);
  assert.equal(Math.round(stopPips(after)), 10);
});

test("a trade keeps the value it was sized with, not the one in the table today", () => {
  // The index tables are a broker convention and the user can correct them.
  // A correction must not rewrite the risk on a trade already taken.
  const old = cleanTrade({ ...trade(), instrument: "US30", perPoint: 1, entry: 44200, stop: 44190, target: 44220 })!;
  assert.equal(old.perPoint, 1);
  assert.equal(Math.round(riskMoney(old) * 100) / 100, 0.1);
  const corrected = cleanTrade({ ...old, perPoint: 5 })!;
  assert.equal(Math.round(riskMoney(corrected) * 100) / 100, 0.5);
});

test("a stored instrument nobody recognises falls back rather than throwing", () => {
  const odd = cleanTrade({ ...trade(), instrument: "MADEUP" })!;
  assert.equal(odd.instrument, "EURUSD");
  assert.ok(Number.isFinite(riskMoney(odd)));
});
