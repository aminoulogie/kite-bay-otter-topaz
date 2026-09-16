/**
 * A trading journal with a gate in front of it.
 *
 * This is not a charting tool and it cannot see the market. It never checks
 * whether EMA20 is above EMA50, because it has no price feed and inventing one
 * would be worse than useless — a confirmation that agrees with you is exactly
 * the thing a discipline tool must not be.
 *
 * What it CAN check, it checks by arithmetic and refuses to take your word
 * for: the reward-to-risk ratio, the percentage of the account at stake, that
 * the stop is on the correct side of the entry, that no second position is
 * open, and that the day is not already two losses old. Those are the rules
 * that get broken in the moment, and they are all decidable from numbers that
 * are typed in anyway.
 *
 * What it cannot check, it asks you to confirm, one line at a time, and then
 * STORES what you confirmed alongside the trade. That is the useful part: when
 * a system's numbers go bad, the log can show whether the setups were actually
 * taken by the rules or whether the rules were quietly dropped.
 *
 * The rules encoded here are the user's own, written down in September 2026 as
 * a first version to test. They are not claimed to be profitable, and nothing
 * in this file should be read as advice about whether to trade.
 */

/** One pip on a 5-decimal EUR/USD quote. */
export const PIP = 0.0001;

/**
 * Dollars per pip at 0.01 lots, the size this account trades in.
 *
 * Everything else scales off it, so the lot table is derived rather than
 * transcribed — an account that grows gets a table that grows with it.
 */
export const PIP_VALUE_PER_001 = 0.1;

/** The account rule: 1% a trade, 2% the outer limit. */
export const RISK_TARGET = 0.01;
export const RISK_MAX = 0.02;

/** The target must be at least this many times the stop; 2 is the aim. */
export const MIN_RR = 1.5;
export const GOOD_RR = 2;

/** Two losses and the day is over. */
export const DAILY_LOSS_LIMIT = 2;

export interface CheckItem {
  id: string;
  label: string;
  /** Why it is here, shown small under the label. */
  why: string;
}

export type SystemId = "ema-pullback" | "sr-retest" | "rsi-divergence" | "session-breakout";
export type Direction = "buy" | "sell";

export interface SystemDef {
  id: SystemId;
  name: string;
  /** The one-line version, for a card. */
  gist: string;
  /** The rules as written, for the reference sheet. */
  rules: string[];
  /** What makes the setup void, kept separate because it is what gets ignored. */
  skip: string;
  /**
   * The entry conditions for THIS system, ticked one at a time.
   *
   * There used to be a single box saying "the setup matches the system's
   * rules exactly", which is the checkbox equivalent of asking someone
   * whether they have read the terms. It asks for a judgement you have
   * already made, at the moment you are least able to question it, and it is
   * always ticked. These ask for the rules one at a time instead — the trend,
   * the touch, the close — so that ticking is looking, and a setup that fails
   * on the third one fails before you have typed a price.
   */
  entry: CheckItem[];
}

/**
 * The four systems, as the user wrote them.
 *
 * Stored as data rather than prose in a component so the checklist, the
 * reference sheet and the per-system report all read from one copy. A rule
 * that appears twice is a rule that will eventually disagree with itself.
 */
export const SYSTEMS: SystemDef[] = [
  {
    id: "ema-pullback",
    name: "EMA Pullback",
    gist: "Trend pulls back to EMA20, then closes back the way it was going.",
    rules: [
      "Trend: EMA20 above EMA50 and both rising to buy; below and both falling to sell. Flat or tangled EMAs are no trade.",
      "Setup: price leaves the EMAs, comes back and touches EMA20 or EMA50.",
      "Trigger: a candle touches the EMA and closes back in the trend direction — green above EMA20 with RSI over 50 to buy, red below EMA20 with RSI under 50 to sell.",
      "Entry on the close of the trigger candle.",
      "Stop 2 pips beyond the low (buy) or high (sell) of the pullback.",
      "Target 2× the stop, or the last swing high/low if that is at least 1.5×.",
    ],
    skip: "A candle closes through EMA50 against the trend.",
    entry: [
      {
        id: "ema-trend",
        label: "EMA20 and EMA50 are stacked and both moving your way",
        why: "Above and rising to buy, below and falling to sell. Flat or tangled is no trade.",
      },
      {
        id: "ema-touch",
        label: "Price left the EMAs, came back, and touched EMA20 or EMA50",
        why: "A pullback that never reaches the line is not this setup.",
      },
      {
        id: "ema-close",
        label: "A candle touched the EMA and CLOSED back in the trend direction",
        why: "Green above EMA20 with RSI over 50 to buy; red below with RSI under 50 to sell.",
      },
      {
        id: "ema-intact",
        label: "No candle has closed through EMA50 against the trend",
        why: "That is the void condition. If it has happened, the trend is not yours any more.",
      },
    ],
  },
  {
    id: "sr-retest",
    name: "S/R Retest",
    gist: "Level breaks, price comes back to it, and the retest candle holds.",
    rules: [
      "Level: a price the market has turned at least twice.",
      "Break: a 15m candle closes beyond the level.",
      "Retest: price returns, a candle pokes through with a wick but closes back on the breakout side.",
      "Entry on the close of the retest candle — never on the breakout candle itself.",
      "Stop 2 pips beyond the retest candle's wick.",
      "Target the next support or resistance, at least 1.5× the stop.",
    ],
    skip: "A candle closes back through the level — the breakout failed.",
    entry: [
      {
        id: "sr-level",
        label: "The level is one the market has turned at least twice",
        why: "Twice is a level. Once is a place price happened to stop.",
      },
      {
        id: "sr-break",
        label: "A 15m candle has CLOSED beyond the level",
        why: "A wick through it is not a break.",
      },
      {
        id: "sr-retest",
        label: "Price came back, wicked through, and closed on the breakout side",
        why: "The retest candle is the entry. The breakout candle never is.",
      },
      {
        id: "sr-holding",
        label: "Nothing has closed back through the level since",
        why: "That is the void condition — the breakout failed and this is now the other side.",
      },
    ],
  },
  {
    id: "rsi-divergence",
    name: "RSI Divergence",
    gist: "Price and RSI disagree, then RSI crosses its signal line.",
    rules: [
      "Buy: price makes a lower low while RSI makes a higher low, ideally with RSI under 35.",
      "Sell: price makes a higher high while RSI makes a lower high, ideally with RSI over 65.",
      "Trigger: RSI crosses its signal line in the trade's direction and a candle closes the same way.",
      "Entry on the close of that candle.",
      "Stop 2 pips beyond the swing low or high where the divergence formed.",
      "Target the EMA50 or the nearest level, at least 1.5× the stop.",
      "Also a filter: never take another system's trade against an active divergence.",
    ],
    skip: "The divergence is against you — that is a reason to skip, whatever the other system says.",
    entry: [
      {
        id: "rsi-diverge",
        label: "Price and RSI disagree at the swing",
        why: "Lower low with a higher RSI low to buy; higher high with a lower RSI high to sell.",
      },
      {
        id: "rsi-zone",
        label: "RSI is in the zone — under 35 to buy, over 65 to sell",
        why: "Not required, but a divergence in the middle of the range is the weak kind.",
      },
      {
        id: "rsi-cross",
        label: "RSI has crossed its signal line your way AND a candle closed the same way",
        why: "Both. The cross without the close is the trap this system is famous for.",
      },
    ],
  },
  {
    id: "session-breakout",
    name: "Session Breakout",
    gist: "Asian range breaks between 07:00 and 10:00 UTC.",
    rules: [
      "Range: the Asian session high and low, 00:00 to 07:00 UTC. Check the chart is on UTC — XM shows UTC+3.",
      "Skip the day if the range is wider than 35 pips.",
      "Trigger: between 07:00 and 10:00 UTC a 15m candle closes beyond the range.",
      "Entry best on a retest of the range edge, otherwise the next candle's open.",
      "Stop at the middle of the Asian range.",
      "Target the range height added to the breakout point, at least 1.5× the stop.",
    ],
    skip: "Price closes back inside the range — the breakout failed.",
    entry: [
      {
        id: "brk-utc",
        label: "The chart is on UTC, and the Asian range is 00:00–07:00",
        why: "XM shows UTC+3. Read the range off the wrong clock and everything after it is wrong.",
      },
      {
        id: "brk-width",
        label: "The range is 35 pips wide or less",
        why: "Wider than that and the stop at the middle is further than the target is worth.",
      },
      {
        id: "brk-close",
        label: "A 15m candle has CLOSED beyond the range, inside the window",
        why: "Between 07:00 and 10:00 UTC. Outside it this is not the setup.",
      },
      {
        id: "brk-inside",
        label: "Price has not closed back inside the range",
        why: "That is the void condition. A failed breakout is not a late entry.",
      },
    ],
  },
];

export function systemDef(id: SystemId | undefined): SystemDef | undefined {
  return SYSTEMS.find((s) => s.id === id);
}

export function systemName(id: SystemId | undefined): string {
  return systemDef(id)?.name ?? "Unknown";
}

/** The window Session Breakout may be entered in, in UTC hours. */
export const BREAKOUT_OPEN_UTC = 7;
export const BREAKOUT_CLOSE_UTC = 10;

/**
 * The things the app cannot see and must therefore ask about.
 *
 * Deliberately short. Every item the arithmetic can decide — the ratio, the
 * risk, the side the stop is on — was taken OFF this list and made a hard
 * check, because a checkbox next to a number the machine already knows is
 * theatre, and theatre is what teaches people to tick without reading.
 */
/**
 * The checks that are true of every trade, whichever system it came from.
 *
 * "The setup matches the system's rules exactly" used to head this list and
 * has been removed: the per-system entry conditions ARE that question, asked
 * one rule at a time, and asking it again in the abstract afterwards taught
 * nothing except how to tick.
 */
export const CHECKS: CheckItem[] = [
  {
    id: "closed",
    label: "The trigger candle has closed",
    why: "A candle that is still moving has not triggered anything yet.",
  },
  {
    id: "conflict",
    label: "No other system is signalling the opposite way",
    why: "RSI divergence first — it is the one that catches the others out.",
  },
  {
    id: "news",
    label: "Not within 15 minutes of big USD or EUR news",
    why: "The spread and the spike will take the stop before the idea gets a chance.",
  },
  {
    id: "orders",
    label: "Stop loss and take profit are in the order itself",
    why: "Set now, while you have no position and no opinion about it.",
  },
];

export const CHECK_IDS = CHECKS.map((c) => c.id);

/**
 * Everything this trade has to confirm: its system's entry, then the rest.
 *
 * In that order on purpose. The system's own conditions are the ones that
 * decide whether there is a trade at all, and they should be answered before
 * the housekeeping — a setup that fails its third rule should never get as
 * far as being asked about the news.
 */
export function checksFor(system: SystemId | undefined): CheckItem[] {
  return [...(systemDef(system)?.entry ?? []), ...CHECKS];
}

/** Ticks that belong to this system. Switching systems drops the rest. */
export function keepChecks(system: SystemId | undefined, ticked: readonly string[]): string[] {
  const mine = new Set(checksFor(system).map((c) => c.id));
  return ticked.filter((id) => mine.has(id));
}

/** A trade as it is being drafted, before anything is committed. */
export interface TradeDraft {
  system: SystemId;
  direction: Direction;
  /** The one sentence: which system, and why this matches it. */
  reason: string;
  lots: number;
  entry: number;
  stop: number;
  target: number;
  /** The ids of CHECKS that have been ticked. */
  checks: string[];
}

export interface Trade extends TradeDraft {
  id: string;
  /** Local date key, "YYYY-MM-DD". */
  date: string;
  openedAt: number;
  /** The account size when it was opened, so risk% is not rewritten by later growth. */
  equityAtEntry: number;
  /** Set when the trade is closed out. Absent means still open. */
  exit?: number;
  closedAt?: number;
  /** Closed by hand before stop or target. Against the rules, and logged as such. */
  closedEarly?: boolean;
  note?: string;
}

let seq = 0;
export function newTradeId(): string {
  seq += 1;
  return `tr-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/* ------------------------------------------------------------- the maths --
 *
 * All of it derived from the three prices and the lot size. Nothing here is
 * typed in twice, because two copies of a number are two chances to be wrong
 * about the one that matters.
 */

/** Dollars per pip at this lot size. */
export function pipValue(lots: number): number {
  return (Number(lots) / 0.01) * PIP_VALUE_PER_001;
}

/** Distance between two prices, in pips. Always positive. */
export function pips(a: number, b: number): number {
  return Math.abs(Number(a) - Number(b)) / PIP;
}

export function stopPips(d: Pick<TradeDraft, "entry" | "stop">): number {
  return pips(d.entry, d.stop);
}

export function targetPips(d: Pick<TradeDraft, "entry" | "target">): number {
  return pips(d.entry, d.target);
}

/** What this trade puts at risk, in dollars. */
export function riskMoney(d: Pick<TradeDraft, "entry" | "stop" | "lots">): number {
  return stopPips(d) * pipValue(d.lots);
}

/** That risk as a share of the account. */
export function riskPercent(
  d: Pick<TradeDraft, "entry" | "stop" | "lots">,
  equity: number,
): number {
  if (!(equity > 0)) return 0;
  return riskMoney(d) / equity;
}

/** Reward to risk, as a multiple. Zero stop distance has no ratio. */
export function rewardRatio(d: Pick<TradeDraft, "entry" | "stop" | "target">): number {
  const risk = stopPips(d);
  if (!(risk > 0)) return 0;
  return targetPips(d) / risk;
}

/**
 * The widest stop this lot size can carry at a given risk.
 *
 * This is the user's lot table, computed rather than copied: at $119 equity it
 * returns their 12 / 6 / 4 pips at 1% and 24 / 12 / 8 at 2%. Copied, it would
 * still say 12 pips after the account had doubled.
 */
export function maxStopPips(lots: number, equity: number, pct = RISK_TARGET): number {
  const value = pipValue(lots);
  if (!(value > 0) || !(equity > 0)) return 0;
  return (equity * pct) / value;
}

/** The lot sizes this account offers, with what each can carry. */
export const LOT_STEPS = [0.01, 0.02, 0.03];

export interface LotRow {
  lots: number;
  atTarget: number;
  atMax: number;
}

export function lotTable(equity: number): LotRow[] {
  return LOT_STEPS.map((lots) => ({
    lots,
    atTarget: maxStopPips(lots, equity, RISK_TARGET),
    atMax: maxStopPips(lots, equity, RISK_MAX),
  }));
}

/**
 * The biggest lot that keeps this stop inside the 1% rule.
 *
 * Returns null when even the smallest lot is too big for the stop — which is
 * not a rounding problem to be nudged past but the answer "this trade is too
 * wide for this account", and the rules already say what to do about it.
 */
export function suggestLots(stopDistancePips: number, equity: number, pct = RISK_TARGET): number | null {
  let best: number | null = null;
  for (const lots of LOT_STEPS) {
    if (stopDistancePips <= maxStopPips(lots, equity, pct)) best = lots;
  }
  return best;
}

/* ----------------------------------------------------------------- close --
 */

/** Profit or loss in dollars, once the trade is closed. */
export function profit(trade: Trade): number {
  if (typeof trade.exit !== "number") return 0;
  const moved = trade.direction === "buy" ? trade.exit - trade.entry : trade.entry - trade.exit;
  return (moved / PIP) * pipValue(trade.lots);
}

/**
 * The result in R — profit as a multiple of what was risked.
 *
 * R rather than dollars is what makes two trades comparable when one was taken
 * at 0.01 lots and the next at 0.03, and it is the only unit in which "is this
 * system any good" has an answer that survives a change of position size.
 */
export function rMultiple(trade: Trade): number {
  const risk = riskMoney(trade);
  if (!(risk > 0)) return 0;
  return profit(trade) / risk;
}

export type Outcome = "open" | "win" | "loss" | "flat";

export function outcome(trade: Trade): Outcome {
  if (typeof trade.exit !== "number") return "open";
  const p = profit(trade);
  // A hair either side of nothing is nothing. Scratching a trade for four
  // cents is not a win, and counting it as one flatters every rate below.
  if (Math.abs(p) < 0.01) return "flat";
  return p > 0 ? "win" : "loss";
}

export function isOpen(trade: Trade): boolean {
  return typeof trade.exit !== "number";
}

export function openTrade(trades: Trade[]): Trade | undefined {
  return (trades ?? []).find(isOpen);
}

/** Losses closed today, for the two-and-done rule. */
export function lossesOn(trades: Trade[], dateKey: string): number {
  return (trades ?? []).filter((t) => t.date === dateKey && outcome(t) === "loss").length;
}

/* ------------------------------------------------------------- the gate --
 */

export type GateLevel = "block" | "warn";

export interface GateIssue {
  level: GateLevel;
  /** Stable id, so a test can name one without matching prose. */
  id: string;
  message: string;
}

export interface GateResult {
  blocks: GateIssue[];
  warnings: GateIssue[];
  ok: boolean;
}

export interface GateContext {
  equity: number;
  /** Everything already logged, for the one-at-a-time and two-loss rules. */
  trades: Trade[];
  /** Today's local date key. */
  today: string;
  /** Now, for the session-breakout window. */
  now?: Date;
}

/**
 * Everything decidable, decided.
 *
 * Blocks are rules with a number behind them. Warnings are the difference
 * between the rule and the ideal — 1.6R clears the minimum and is still worse
 * than the 2R the plan asks for, and saying so is not the same as refusing.
 *
 * The one-sentence reason is a block rather than a warning on purpose. It is
 * the cheapest rule in the whole plan and the one that does the most work: a
 * setup you cannot describe in a sentence is one you have not actually found.
 */
export function gate(draft: TradeDraft, ctx: GateContext): GateResult {
  const blocks: GateIssue[] = [];
  const warnings: GateIssue[] = [];
  const add = (level: GateLevel, id: string, message: string) =>
    (level === "block" ? blocks : warnings).push({ level, id, message });

  const entry = Number(draft.entry);
  const stop = Number(draft.stop);
  const target = Number(draft.target);
  const prices = [entry, stop, target].every((n) => Number.isFinite(n) && n > 0);

  if (!prices) {
    add("block", "prices", "Entry, stop and target all need a price.");
  } else {
    // The stop must be the losing side and the target the winning one. Getting
    // these the wrong way round is not a strategy error, it is a typing error,
    // and it is the one that turns a 1% risk into an uncapped one.
    if (draft.direction === "buy") {
      if (stop >= entry) add("block", "stop-side", "On a buy the stop goes below the entry.");
      if (target <= entry) add("block", "target-side", "On a buy the target goes above the entry.");
    } else {
      if (stop <= entry) add("block", "stop-side", "On a sell the stop goes above the entry.");
      if (target >= entry) add("block", "target-side", "On a sell the target goes below the entry.");
    }
  }

  const risk = stopPips(draft);
  if (prices && !(risk > 0)) {
    add("block", "no-stop", "The stop is at the entry price — there is nothing between you and it.");
  }

  const rr = rewardRatio(draft);
  if (prices && risk > 0) {
    if (rr < MIN_RR) {
      add("block", "rr", `The target is ${rr.toFixed(2)}× the stop. The rule is at least ${MIN_RR}×.`);
    } else if (rr < GOOD_RR) {
      add("warn", "rr-thin", `${rr.toFixed(2)}× clears the minimum but the plan asks for ${GOOD_RR}×.`);
    }
  }

  const pct = riskPercent(draft, ctx.equity);
  if (!(ctx.equity > 0)) {
    add("block", "equity", "Set the account balance first — risk cannot be worked out without it.");
  } else if (pct > RISK_MAX) {
    const better = suggestLots(risk, ctx.equity);
    add(
      "block",
      "risk",
      `That risks $${riskMoney(draft).toFixed(2)}, ${(pct * 100).toFixed(1)}% of the account. The ceiling is ${RISK_MAX * 100}%.` +
        (better ? ` ${better} lots would keep it inside the rule.` : " Even 0.01 lots is too big for a stop this wide — skip it."),
    );
  } else if (pct > RISK_TARGET) {
    add(
      "warn",
      "risk-high",
      `${(pct * 100).toFixed(1)}% at risk. The rule is 1%, with 2% as the outer limit.`,
    );
  }

  if (!String(draft.reason ?? "").trim()) {
    add("block", "reason", "Write the one sentence: which system, and why this matches it.");
  }

  const missing = checksFor(draft.system).filter((c) => !draft.checks?.includes(c.id));
  if (missing.length) {
    add(
      "block",
      "checks",
      missing.length === 1
        ? `One thing left to confirm: ${missing[0]!.label.toLowerCase()}.`
        : `${missing.length} things still to confirm.`,
    );
  }

  const open = openTrade(ctx.trades);
  if (open) {
    add("block", "one-at-a-time", `${systemName(open.system)} is still open. One trade at a time.`);
  }

  const losses = lossesOn(ctx.trades, ctx.today);
  if (losses >= DAILY_LOSS_LIMIT) {
    add("block", "daily-loss", `${losses} losses today. You are done for the day — that is the rule.`);
  }

  if (draft.system === "session-breakout") {
    const hour = (ctx.now ?? new Date()).getUTCHours();
    if (hour < BREAKOUT_OPEN_UTC || hour >= BREAKOUT_CLOSE_UTC) {
      add(
        "block",
        "breakout-window",
        `Session Breakout is ${BREAKOUT_OPEN_UTC}:00–${BREAKOUT_CLOSE_UTC}:00 UTC only. It is ${String(hour).padStart(2, "0")}:00 UTC now.`,
      );
    }
  }

  return { blocks, warnings, ok: blocks.length === 0 };
}

/* ------------------------------------------------------------ the report --
 */

/**
 * Trades before a system's numbers mean anything.
 *
 * Ten is not a statistically respectable sample; it is the point below which
 * the number is actively misleading. Three wins out of four is a 75% win rate
 * and it is also what a coin does about once in three attempts. Reporting it
 * without saying so is how a losing system gets promoted.
 */
export const MIN_SAMPLE = 10;

export interface Stats {
  trades: number;
  open: number;
  wins: number;
  losses: number;
  flat: number;
  /** Wins as a share of DECIDED trades — open ones are not a result yet. */
  winRate: number;
  /** Total and average result in R. */
  totalR: number;
  avgR: number;
  /** Gross win over gross loss. Infinity when nothing has lost yet. */
  profitFactor: number;
  net: number;
  /** The planned ratio, averaged — what was intended, not what happened. */
  avgPlannedRR: number;
  bestR: number;
  worstR: number;
  /** Trades closed by hand rather than at stop or target. */
  earlyExits: number;
  /** Trades whose risk was inside the 1% rule. */
  withinRisk: number;
}

export function summarise(trades: Trade[], equityFallback = 0): Stats {
  const list = trades ?? [];
  const closed = list.filter((t) => !isOpen(t));
  let wins = 0;
  let losses = 0;
  let flat = 0;
  let totalR = 0;
  let net = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let plannedRR = 0;
  let bestR = 0;
  let worstR = 0;
  let earlyExits = 0;
  let withinRisk = 0;

  for (const t of list) {
    plannedRR += rewardRatio(t);
    const equity = t.equityAtEntry || equityFallback;
    if (equity > 0 && riskPercent(t, equity) <= RISK_TARGET + 1e-9) withinRisk += 1;
  }

  for (const t of closed) {
    const r = rMultiple(t);
    const p = profit(t);
    totalR += r;
    net += p;
    if (p > 0) grossWin += p;
    else grossLoss += -p;
    bestR = Math.max(bestR, r);
    worstR = Math.min(worstR, r);
    if (t.closedEarly) earlyExits += 1;
    const o = outcome(t);
    if (o === "win") wins += 1;
    else if (o === "loss") losses += 1;
    else flat += 1;
  }

  const decided = wins + losses;
  return {
    trades: list.length,
    open: list.length - closed.length,
    wins,
    losses,
    flat,
    winRate: decided ? wins / decided : 0,
    totalR,
    avgR: closed.length ? totalR / closed.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    net,
    avgPlannedRR: list.length ? plannedRR / list.length : 0,
    bestR,
    worstR,
    earlyExits,
    withinRisk,
  };
}

export type Verdict = "too-early" | "working" | "flat" | "losing";

export interface SystemReport {
  system: SystemId;
  name: string;
  stats: Stats;
  verdict: Verdict;
  /** Closed trades, which is what the verdict is allowed to be based on. */
  decided: number;
}

/**
 * Whether a system is earning its place, or not enough is known yet.
 *
 * Judged on average R rather than win rate, because win rate on its own ranks
 * a system that wins nine 0.5R trades and loses one 5R trade above one that
 * does the opposite, and only one of those two makes money.
 *
 * "Flat" is a real answer and gets its own label. A system hovering around
 * break-even after twenty trades is not a promising one that needs patience;
 * it is one whose edge, if it has any, is smaller than the spread.
 */
export function verdictFor(stats: Stats): Verdict {
  const decided = stats.wins + stats.losses + stats.flat;
  if (decided < MIN_SAMPLE) return "too-early";
  // A tenth of an R either way. Narrow, because at these ratios it does not
  // take much of an edge to matter: three 2R wins against seven 1R losses
  // averages -0.1R, and a system that loses a tenth of its risk every trade
  // is a losing system however respectable 30% at 2R sounds.
  //
  // Compared with a hair of tolerance, because these averages are sums of
  // floating-point divisions: three 2R wins and seven 1R losses works out to
  // -0.09999999999999998, and a system should not be called flat rather than
  // losing by the fifteenth decimal place.
  if (stats.avgR >= 0.1 - 1e-9) return "working";
  if (stats.avgR <= -0.1 + 1e-9) return "losing";
  return "flat";
}

/**
 * Every system, ranked, with the ones that have not earned an opinion last.
 *
 * Sorted by average R, but a system with four trades never outranks one with
 * thirty however good its four look — the sample gate comes first in the sort
 * for the same reason it exists at all.
 */
export function report(trades: Trade[], equityFallback = 0): SystemReport[] {
  const out = SYSTEMS.map((def) => {
    const mine = (trades ?? []).filter((t) => t.system === def.id);
    const stats = summarise(mine, equityFallback);
    return {
      system: def.id,
      name: def.name,
      stats,
      verdict: verdictFor(stats),
      decided: stats.wins + stats.losses + stats.flat,
    };
  });

  return out.sort((a, b) => {
    const aEarly = a.verdict === "too-early";
    const bEarly = b.verdict === "too-early";
    if (aEarly !== bEarly) return aEarly ? 1 : -1;
    if (b.stats.avgR !== a.stats.avgR) return b.stats.avgR - a.stats.avgR;
    return b.decided - a.decided;
  });
}

/**
 * The best system, or null while nothing has earned the title.
 *
 * Null is the honest answer far longer than anyone wants it to be, and a tool
 * that names a favourite after six trades is teaching exactly the wrong habit.
 */
export function bestSystem(trades: Trade[], equityFallback = 0): SystemReport | null {
  // Only a system the report is prepared to call "working". Reading the
  // average directly would crown one sitting at a millionth of an R above
  // break-even, which is floating-point noise wearing a rosette.
  const ranked = report(trades, equityFallback).filter((r) => r.verdict === "working");
  return ranked[0] ?? null;
}

/** A trade read back from storage, with every field made safe. */
export function cleanTrade(raw: unknown): Trade | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Trade>;
  if (typeof r.id !== "string" || !r.id) return null;
  const system = SYSTEMS.some((s) => s.id === r.system) ? (r.system as SystemId) : "ema-pullback";
  const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    id: r.id,
    date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "",
    system,
    direction: r.direction === "sell" ? "sell" : "buy",
    reason: typeof r.reason === "string" ? r.reason : "",
    lots: num(r.lots, 0.01),
    entry: num(r.entry),
    stop: num(r.stop),
    target: num(r.target),
    checks: Array.isArray(r.checks) ? r.checks.filter((c): c is string => typeof c === "string") : [],
    openedAt: num(r.openedAt, Date.now()),
    equityAtEntry: num(r.equityAtEntry),
    // Absent stays absent: a zero exit would read as a closed trade at price
    // nought, which is both a lie and a spectacular loss.
    ...(Number.isFinite(Number(r.exit)) && r.exit !== undefined ? { exit: Number(r.exit) } : {}),
    ...(Number.isFinite(Number(r.closedAt)) && r.closedAt !== undefined
      ? { closedAt: Number(r.closedAt) }
      : {}),
    ...(r.closedEarly === true ? { closedEarly: true as const } : {}),
    ...(typeof r.note === "string" && r.note ? { note: r.note } : {}),
  };
}
