import { useMemo, useState } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { WidgetGrid, useWidgetSize } from "@/components/WidgetGrid";
import { hasDetailRoom } from "@/lib/dashboard-layout";
import { tapSuccess, tapWarn } from "@/lib/haptics";
import { getLocalDateKey } from "@/lib/soma";
import {
  DAILY_LOSS_LIMIT, LOT_STEPS, MIN_SAMPLE, RISK_TARGET, SYSTEMS,
  checksFor, keepChecks, systemDef,
  bestSystem, gate, lossesOn, lotTable, openTrade, outcome, profit, rMultiple, report,
  rewardRatio, riskMoney, riskPercent, stopPips, suggestLots, summarise, systemName,
  type Direction, type SystemId, type Trade, type TradeDraft, type Verdict,
} from "@/lib/trading";
import {
  DEFAULT_INSTRUMENT, GROUPS, cleanPointValues, formatPrice, inGroup, instrumentName,
  instrumentOf, perPoint, setPerPoint, unitLabel,
} from "@/lib/instruments";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The trading journal, and the gate in front of it.
 *
 * The tab exists because of a specific failure mode: the rules are written
 * down, they are good rules, and they get broken in the ninety seconds between
 * seeing a setup and clicking buy. A journal filled in afterwards records that
 * happening. This one is meant to be opened BEFORE the click, which is why the
 * logging form and the pre-trade check are the same form — there is no way to
 * log a trade here that does not go past the rules first.
 *
 * It cannot see the chart. Everything about EMAs, wicks and divergence is
 * confirmed by hand, and stored as confirmed, so that a system whose numbers
 * go bad can be asked the more useful question: were those setups actually
 * taken by the rules?
 *
 * Everything the arithmetic CAN settle is settled without asking. See
 * lib/trading.ts.
 */
export function TradingView() {
  const trades = useSoma((s) => s.trades);
  const settings = useSoma((s) => s.settings);

  const today = getLocalDateKey();
  const equity = Number(settings.tradingEquity) || 0;
  const open = useMemo(() => openTrade(trades), [trades]);
  const stats = useMemo(() => summarise(trades, equity), [trades, equity]);
  const ranked = useMemo(() => report(trades, equity), [trades, equity]);
  const best = useMemo(() => bestSystem(trades, equity), [trades, equity]);
  const lossesToday = lossesOn(trades, today);

  return (
    <WidgetGrid tab="money-trade">
      <AccountCard key="account" equity={equity} lossesToday={lossesToday} open={!!open} />
      <PreTradeCard key="check" equity={equity} trades={trades} today={today} />
      <OpenTradeCard key="open" trade={open} />
      <SystemsCard key="systems" ranked={ranked} best={best} />
      <StatsCard key="stats" stats={stats} />
      <LogCard key="log" trades={trades} />
      <RulesCard key="rules" />
    </WidgetGrid>
  );
}

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
/** A typed price, comma or dot, or NaN while it is still being typed. */
const num = (s: string) => {
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
/** A price written the way its own market writes it — five places for a
 *  currency pair, two for gold, one for an index. */
const price = (n: number, instrument?: string) => formatPrice(instrument, n);

/* ------------------------------------------------------------- account -- */

function AccountCard({
  equity, lossesToday, open,
}: {
  equity: number;
  lossesToday: number;
  open: boolean;
}) {
  const patchSettings = useSoma((s) => s.patchSettings);
  const size = useWidgetSize();
  const [draft, setDraft] = useState<string | null>(null);
  const rows = lotTable(equity);

  const save = () => {
    const value = Number(String(draft).replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter the account balance.");
      return;
    }
    patchSettings({ tradingEquity: value });
    setDraft(null);
    toast.success("Balance updated");
  };

  return (
    <Card>
      <CardTitle>The account</CardTitle>

      {draft === null ? (
        <button
          type="button"
          onClick={() => setDraft(equity ? String(equity) : "")}
          className="flex w-full items-baseline justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
        >
          <span className="font-display text-2xl font-extrabold tabular">
            {equity ? money(equity) : "Not set"}
          </span>
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            {equity ? `1% = ${money(equity * RISK_TARGET)}` : "tap to set"}
          </span>
        </button>
      ) : (
        <div className="flex gap-1.5">
          <Input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="119"
            aria-label="Account balance"
            className="h-11 flex-1 tabular"
          />
          <Button variant="primary" onClick={save}>
            <Check className="size-4" />
          </Button>
        </div>
      )}

      {/* The lot table, worked out rather than copied in — so it still tells
          the truth after the account has grown or shrunk. */}
      {equity > 0 && hasDetailRoom(size) && (
        <div className="mt-3">
          {/* Stated as a forex table rather than left to be assumed. The same
              1% buys a hundred times as many points of gold, and a row that
              said "pips" while you were trading metal would be a trap. */}
          <div className="mb-1 grid grid-cols-3 text-[0.55rem] font-bold uppercase tracking-wider text-faint">
            <span>Lot · FX</span>
            <span className="text-right">Max stop at 1%</span>
            <span className="text-right">at 2%</span>
          </div>
          {rows.map((r) => (
            <div key={r.lots} className="grid grid-cols-3 border-t border-border/60 py-1 text-xs tabular">
              <span className="font-bold">{r.lots.toFixed(2)}</span>
              <span className="text-right">{Math.floor(r.atTarget)} pips</span>
              <span className="text-right text-faint">{Math.floor(r.atMax)} pips</span>
            </div>
          ))}
        </div>
      )}

      {lossesToday >= DAILY_LOSS_LIMIT ? (
        <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[0.68rem] font-bold leading-snug text-danger">
          {lossesToday} losses today. The day is over — that is the rule you wrote, and it is
          the one that stops a bad morning becoming a bad month.
        </p>
      ) : (
        hasDetailRoom(size) &&
        (lossesToday > 0 || open) && (
          <p className="mt-3 text-[0.65rem] leading-snug text-faint">
            {lossesToday > 0 && `${lossesToday} loss today — one more and you are done. `}
            {open && "A trade is open. Nothing new until it closes."}
          </p>
        )
      )}
    </Card>
  );
}

/* ----------------------------------------------------------- pre-trade -- */

/**
 * What was traded, and what a point of it is worth.
 *
 * At the top of the card rather than buried with the size, because it governs
 * every number below it: the stop is counted in this market's units, the risk
 * is priced at this market's value, and the lot that fits is the lot that fits
 * HERE. Picking the system first and the market fourth would mean reading
 * three numbers that were about something else.
 *
 * The value is on show and not hidden in a table. Forex and the metals are
 * contract arithmetic — a standard lot is a hundred thousand units, gold is a
 * hundred ounces — and cannot be wrong. The indices and crypto are a broker
 * convention, and a risk calculation you cannot check against your own account
 * is a risk calculation that should not be trusted. So it can be replaced, and
 * a replacement that matches the shipped figure is simply forgotten.
 */
function InstrumentPicker({
  value, perPointNow, onPick, onValue,
}: {
  value: string;
  perPointNow: number;
  onPick: (id: string) => void;
  onValue: (n: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const inst = instrumentOf(value);
  const shipped = inst.perLot;

  const save = () => {
    const n = Number(String(editing).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter what one point is worth at 1.00 lot.");
      return;
    }
    onValue(n);
    setEditing(null);
    toast.success(n === shipped ? "Back to the standard value" : `${instrumentName(value)} set to ${money(n)} a point`);
  };

  return (
    <div className="mb-2">
      {/* One row per market, scrolling sideways. A grid of thirteen would be
          the tallest thing on the card and the least often changed. */}
      {GROUPS.map((group) => (
        <div key={group} className="mb-1 flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-[0.55rem] font-bold uppercase tracking-wider text-faint">
            {group}
          </span>
          <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
            {inGroup(group).map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onPick(i.id)}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-2.5 text-[0.68rem] font-bold",
                  value === i.id
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border bg-surface-2 text-muted",
                )}
              >
                {i.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      {editing === null ? (
        <button
          type="button"
          onClick={() => setEditing(String(perPointNow))}
          className="mt-0.5 text-[0.62rem] leading-snug text-faint underline decoration-dotted underline-offset-2"
        >
          {money(perPointNow)} per {inst.unit} at 1.00 lot
          {perPointNow !== shipped ? " · yours" : ""} — tap if your broker differs
        </button>
      ) : (
        <div className="mt-1 flex items-center gap-1.5">
          <Input
            autoFocus
            inputMode="decimal"
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            aria-label={`Dollars per ${inst.unit} at one lot`}
            className="h-9 flex-1 tabular"
          />
          <Button size="sm" onClick={save}>Set</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

const BLANK: TradeDraft = {
  system: "ema-pullback",
  direction: "buy",
  instrument: DEFAULT_INSTRUMENT,
  reason: "",
  lots: 0.01,
  entry: NaN,
  stop: NaN,
  target: NaN,
  checks: [],
};

function PreTradeCard({
  equity, trades, today,
}: {
  equity: number;
  trades: Trade[];
  today: string;
}) {
  const addTrade = useSoma((s) => s.addTrade);
  const storedValues = useSoma((s) => s.settings.pointValues);
  const patchSettings = useSoma((s) => s.patchSettings);
  const pointValues = useMemo(() => cleanPointValues(storedValues), [storedValues]);
  const [d, setD] = useState<TradeDraft>(BLANK);
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");

  // The three prices are held as the strings that were typed and parsed here,
  // so a half-typed "1.1" is a number in progress rather than a value the gate
  // has to have an opinion about yet.
  /**
   * What a point of this market is worth, settled at the moment of drafting.
   *
   * Stored on the trade rather than looked up later, for the same reason the
   * account balance is: correcting the table next month must not rewrite the
   * risk on a trade that was sized under the old figure.
   */
  const inst = instrumentOf(d.instrument);
  const value = perPoint(d.instrument, pointValues);

  const draft: TradeDraft = useMemo(
    () => ({ ...d, perPoint: value, entry: num(entry), stop: num(stop), target: num(target) }),
    [d, value, entry, stop, target],
  );

  const g = useMemo(() => gate(draft, { equity, trades, today }), [draft, equity, trades, today]);
  const risk = riskMoney(draft);
  const rr = rewardRatio(draft);
  const stopped = stopPips(draft);
  const suggested = stopped > 0 ? suggestLots(stopped, equity, undefined, value) : null;

  /** What this system asks for, and where its own rules stop. */
  const list = checksFor(d.system);
  const entryCount = systemDef(d.system)?.entry.length ?? 0;

  const toggle = (id: string) =>
    setD((p) => ({
      ...p,
      checks: p.checks.includes(id) ? p.checks.filter((c) => c !== id) : [...p.checks, id],
    }));

  const submit = () => {
    if (!g.ok) {
      tapWarn();
      toast.error(g.blocks[0]!.message);
      return;
    }
    addTrade(draft, equity);
    tapSuccess();
    setD(BLANK);
    setEntry("");
    setStop("");
    setTarget("");
    toast.success("Trade logged. Now leave it alone.");
  };

  return (
    <Card>
      <CardTitle>Before you click</CardTitle>

      {/* What was traded, first, because everything under it is counted in
          this market's units and priced at this market's value. */}
      <InstrumentPicker
        value={d.instrument ?? DEFAULT_INSTRUMENT}
        perPointNow={value}
        onPick={(id) => setD((p) => ({ ...p, instrument: id }))}
        onValue={(n) =>
          patchSettings({
            pointValues: setPerPoint(pointValues, d.instrument ?? DEFAULT_INSTRUMENT, n),
          })
        }
      />

      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {SYSTEMS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() =>
              setD((p) => ({
                ...p,
                system: s.id as SystemId,
                // The conditions below are this system's own, so the ticks
                // that belonged to the last one go with it. Carrying them
                // over would mean arriving at a new setup with three of its
                // rules already confirmed by a setup you have just rejected.
                checks: keepChecks(s.id as SystemId, p.checks),
              }))
            }
            className={cn(
              "rounded-xl border px-2 py-2 text-left text-[0.7rem] font-bold leading-tight",
              d.system === s.id ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {(["buy", "sell"] as Direction[]).map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => setD((p) => ({ ...p, direction: dir }))}
            className={cn(
              "h-11 rounded-xl border text-sm font-bold capitalize",
              d.direction === dir
                ? dir === "buy"
                  ? "border-accent bg-accent/15 text-accent-text"
                  : "border-danger bg-danger/15 text-danger"
                : "border-border bg-surface-2 text-muted",
            )}
          >
            {dir}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1.5">
        {([["Entry", entry, setEntry], ["Stop", stop, setStop], ["Target", target, setTarget]] as const).map(
          ([label, value, set]) => (
            <label key={label} className="block">
              <span className="mb-0.5 block text-[0.55rem] font-bold uppercase tracking-wider text-faint">
                {label}
              </span>
              <Input
                inputMode="decimal"
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={inst.sample}
                aria-label={label}
                className="h-11 tabular"
              />
            </label>
          ),
        )}
      </div>

      <div className="mb-2 flex gap-1.5">
        {LOT_STEPS.map((lots) => (
          <button
            key={lots}
            type="button"
            onClick={() => setD((p) => ({ ...p, lots }))}
            className={cn(
              "h-10 flex-1 rounded-xl border text-xs font-bold tabular",
              d.lots === lots ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2",
              // The size that keeps this stop inside 1% is marked rather than
              // forced: the rules allow a deliberate 2%, and a button that
              // silently corrected you would be making the decision for you.
              suggested === lots && d.lots !== lots && "border-accent/60 text-accent-text",
            )}
          >
            {lots.toFixed(2)}
            {suggested === lots && d.lots !== lots && " ·"}
          </button>
        ))}
      </div>

      {/* The numbers, live, before anything is committed. */}
      {stopped > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
          <Readout label="Stop" value={unitLabel(d.instrument, stopped)} />
          <Readout
            label="Risk"
            value={equity > 0 ? `${(riskPercent(draft, equity) * 100).toFixed(1)}%` : money(risk)}
            tone={
              equity > 0 && riskPercent(draft, equity) > 0.02
                ? "bad"
                : equity > 0 && riskPercent(draft, equity) > RISK_TARGET
                  ? "warn"
                  : "good"
            }
          />
          <Readout
            label="Reward"
            value={rr > 0 ? `${rr.toFixed(2)}R` : "—"}
            tone={rr === 0 ? undefined : rr < 1.5 ? "bad" : rr < 2 ? "warn" : "good"}
          />
        </div>
      )}

      <label className="mb-2 block">
        <span className="mb-0.5 block text-[0.55rem] font-bold uppercase tracking-wider text-faint">
          The one sentence
        </span>
        <Input
          value={d.reason}
          onChange={(e) => setD((p) => ({ ...p, reason: e.target.value }))}
          placeholder="Which system, and why this matches it"
          aria-label="Reason"
          className="h-11"
        />
      </label>

      {/* The system's own entry conditions, then the ones true of any trade.
          These change with the system above — that is the point of them. */}
      <div className="mb-1 flex items-baseline justify-between px-0.5">
        <span className="text-[0.6rem] font-bold uppercase tracking-wide text-faint">
          {systemName(d.system)} — entry
        </span>
        <span className="text-[0.6rem] tabular text-faint">
          {d.checks.length}/{list.length}
        </span>
      </div>
      <div className="mb-2 space-y-1">
        {list.map((c, i) => {
          const on = d.checks.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-xl border bg-surface-2 px-3 py-2 text-left",
                on ? "border-accent/40" : "border-border",
                // A hairline break where this system's rules end and the
                // housekeeping begins, so the two are never read as one list.
                i === entryCount && "mt-2.5",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                  on ? "border-accent bg-accent text-accent-ink" : "border-border",
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[0.72rem] font-semibold leading-snug", !on && "text-muted")}>
                  {c.label}
                </span>
                <span className="block text-[0.6rem] leading-snug text-faint">{c.why}</span>
              </span>
            </button>
          );
        })}
      </div>

      {g.blocks.map((b) => (
        <p
          key={b.id}
          className="mb-1 flex items-start gap-1.5 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[0.68rem] font-bold leading-snug text-danger"
        >
          <X className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} />
          {b.message}
        </p>
      ))}
      {g.warnings.map((w) => (
        <p
          key={w.id}
          className="mb-1 flex items-start gap-1.5 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[0.68rem] font-bold leading-snug text-warn"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {w.message}
        </p>
      ))}

      <Button variant="primary" className="mt-1 w-full" disabled={!g.ok} onClick={submit}>
        {g.ok ? "Take it and log it" : `${g.blocks.length} rule${g.blocks.length === 1 ? "" : "s"} in the way`}
      </Button>

      <p className="mt-1.5 text-[0.6rem] leading-snug text-faint">
        This cannot see the chart. It checks the arithmetic — ratio, risk, which side the stop
        is on, the day's losses — and takes your word for the rest, then stores what you said.
      </p>
    </Card>
  );
}

function Readout({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-2 py-1.5",
        tone === "bad"
          ? "border-danger/40 bg-danger/10"
          : tone === "warn"
            ? "border-warn/40 bg-warn/10"
            : "border-border bg-surface-2",
      )}
    >
      <div className="text-[0.55rem] font-bold uppercase tracking-wider text-faint">{label}</div>
      <div
        className={cn(
          "font-display text-sm font-extrabold tabular",
          tone === "bad" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- open trade -- */

function OpenTradeCard({ trade }: { trade: Trade | undefined }) {
  const closeTrade = useSoma((s) => s.closeTrade);
  const [exit, setExit] = useState("");
  const [early, setEarly] = useState(false);

  if (!trade) {
    return (
      <Card>
        <CardTitle>The open trade</CardTitle>
        <p className="text-xs leading-snug text-faint">
          Nothing open. One at a time is the rule, so this is where a live trade sits until it
          hits the stop or the target.
        </p>
      </Card>
    );
  }

  const close = () => {
    const value = Number(String(exit).replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the price it closed at.");
      return;
    }
    closeTrade(trade.id, value, { closedEarly: early });
    const p = profit({ ...trade, exit: value });
    setExit("");
    setEarly(false);
    if (p > 0) tapSuccess();
    toast.success(`Closed ${money(p)}`);
  };

  return (
    <Card>
      <CardTitle>The open trade</CardTitle>

      <div className="mb-2 rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold">{systemName(trade.system)}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider",
              trade.direction === "buy" ? "bg-accent/15 text-accent-text" : "bg-danger/15 text-danger",
            )}
          >
            {trade.direction}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-[0.65rem] tabular text-faint">
          <span>in {price(trade.entry, trade.instrument)}</span>
          <span>stop {price(trade.stop, trade.instrument)}</span>
          <span>target {price(trade.target, trade.instrument)}</span>
        </div>
        <div className="mt-1 text-[0.65rem] tabular text-faint">
          {instrumentName(trade.instrument)} · {trade.lots.toFixed(2)} lots · risking{" "}
          {money(riskMoney(trade))} ·{" "}
          {rewardRatio(trade).toFixed(2)}R
        </div>
        {trade.reason && (
          <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[0.68rem] italic leading-snug text-muted">
            “{trade.reason}”
          </p>
        )}
      </div>

      <div className="mb-2 flex gap-1.5">
        <Input
          inputMode="decimal"
          value={exit}
          onChange={(e) => setExit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && close()}
          placeholder="Closed at"
          aria-label="Exit price"
          className="h-11 flex-1 tabular"
        />
        <Button variant="primary" onClick={close}>
          Close
        </Button>
      </div>

      {/* Closing early is against the rules and is logged as such rather than
          hidden — the point of the log is to be able to count how often. */}
      <button
        type="button"
        onClick={() => setEarly((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
            early ? "border-warn bg-warn text-bg" : "border-border",
          )}
        >
          {early && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="text-[0.7rem] font-semibold text-muted">
          I closed this by hand, not at the stop or target
        </span>
      </button>
    </Card>
  );
}

/* --------------------------------------------------------------- report -- */

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  working: { label: "working", className: "bg-accent/15 text-accent-text" },
  flat: { label: "break-even", className: "bg-warn/15 text-warn" },
  losing: { label: "losing", className: "bg-danger/15 text-danger" },
  "too-early": { label: "too early", className: "bg-surface-3 text-faint" },
};

function SystemsCard({
  ranked, best,
}: {
  ranked: ReturnType<typeof report>;
  best: ReturnType<typeof bestSystem>;
}) {
  return (
    <Card>
      <CardTitle>Which system is working</CardTitle>

      <p className="mb-2 text-[0.65rem] leading-snug text-faint">
        {best
          ? `${best.name} is ahead, at ${best.stats.avgR.toFixed(2)}R a trade over ${best.decided}.`
          : `Nothing has earned the title yet. A system needs ${MIN_SAMPLE} closed trades before these numbers mean anything — four wins out of four is also what a coin does one time in sixteen.`}
      </p>

      <div className="space-y-1.5">
        {ranked.map((r) => {
          const v = VERDICT[r.verdict];
          return (
            <div key={r.system} className="rounded-xl border border-border bg-surface-2 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-bold">{r.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[0.52rem] font-bold uppercase tracking-wide",
                    v.className,
                  )}
                >
                  {v.label}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[0.62rem] tabular text-faint">
                <span>{r.decided} closed</span>
                {r.decided > 0 && (
                  <>
                    <span>{pct(r.stats.winRate)} won</span>
                    <span
                      className={cn(
                        r.stats.avgR > 0 ? "text-accent-text" : r.stats.avgR < 0 && "text-danger",
                      )}
                    >
                      {r.stats.avgR >= 0 ? "+" : ""}
                      {r.stats.avgR.toFixed(2)}R avg
                    </span>
                    <span>{money(r.stats.net)}</span>
                  </>
                )}
                {r.stats.open > 0 && <span>{r.stats.open} open</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatsCard({ stats }: { stats: ReturnType<typeof summarise> }) {
  const size = useWidgetSize();
  const decided = stats.wins + stats.losses;

  if (!stats.trades) {
    return (
      <Card>
        <CardTitle>The numbers</CardTitle>
        <p className="text-xs leading-snug text-faint">
          Nothing logged yet. Win rate on its own will not tell you much — the number that
          decides whether this makes money is the average R.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>The numbers</CardTitle>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Readout label="Win rate" value={decided ? pct(stats.winRate) : "—"} />
        <Readout
          label="Avg R"
          value={`${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}`}
          tone={stats.avgR > 0 ? "good" : stats.avgR < 0 ? "bad" : undefined}
        />
        <Readout
          label="Net"
          value={money(stats.net)}
          tone={stats.net > 0 ? "good" : stats.net < 0 ? "bad" : undefined}
        />
      </div>

      {hasDetailRoom(size) && (
        <div className="mt-2 space-y-0.5 text-[0.65rem] tabular text-faint">
          <Line label="Trades" value={`${stats.trades}${stats.open ? ` (${stats.open} open)` : ""}`} />
          <Line label="Won / lost" value={`${stats.wins} / ${stats.losses}`} />
          <Line
            label="Profit factor"
            value={
              stats.profitFactor === Infinity
                ? "—"
                : stats.profitFactor.toFixed(2)
            }
          />
          <Line label="Best / worst" value={`${stats.bestR.toFixed(1)}R / ${stats.worstR.toFixed(1)}R`} />
          <Line label="Planned reward" value={`${stats.avgPlannedRR.toFixed(2)}R avg`} />
          {/* The two discipline numbers. They are the ones that explain the
              others when a good system reports bad results. */}
          <Line
            label="Inside the 1% rule"
            value={`${stats.withinRisk} of ${stats.trades}`}
            tone={stats.withinRisk < stats.trades ? "warn" : undefined}
          />
          <Line
            label="Closed by hand"
            value={String(stats.earlyExits)}
            tone={stats.earlyExits > 0 ? "warn" : undefined}
          />
        </div>
      )}
    </Card>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex justify-between gap-2 border-t border-border/60 pt-0.5">
      <span>{label}</span>
      <span className={cn("font-bold", tone === "warn" ? "text-warn" : "text-fg")}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ log -- */

function LogCard({ trades }: { trades: Trade[] }) {
  const removeTrade = useSoma((s) => s.removeTrade);
  const restoreTrade = useSoma((s) => s.restoreTrade);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  // Newest first. The stored order is what an undo restores into, so the two
  // are deliberately not the same list.
  const rows = useMemo(() => [...trades].sort((a, b) => b.openedAt - a.openedAt).slice(0, 40), [trades]);

  return (
    <Card>
      <CardTitle>The log</CardTitle>
      {rows.length === 0 ? (
        <p className="text-xs text-faint">Nothing logged yet.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((t) => {
            const o = outcome(t);
            const p = profit(t);
            const open = shown === t.id;
            return (
              <SwipeRow
                key={t.id}
                id={t.id}
                openId={swiped}
                setOpenId={setSwiped}
                onDelete={() => {
                  const idx = trades.findIndex((x) => x.id === t.id);
                  removeTrade(t.id);
                  toast.success("Trade removed", {
                    action: { label: "Undo", onClick: () => restoreTrade(idx, t) },
                  });
                }}
              >
                <button
                  type="button"
                  onClick={() => setShown(open ? null : t.id)}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-bold">{systemName(t.system)}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-extrabold tabular",
                        o === "win" ? "text-accent-text" : o === "loss" ? "text-danger" : "text-faint",
                      )}
                    >
                      {o === "open" ? "open" : `${money(p)} · ${rMultiple(t) >= 0 ? "+" : ""}${rMultiple(t).toFixed(2)}R`}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[0.6rem] tabular text-faint">
                    <span>{t.date}</span>
                    {/* What it was, next to the size, because "0.03 lots" is
                        a different amount of money in every market. */}
                    <span className="font-bold">{instrumentName(t.instrument)}</span>
                    <span className="uppercase">{t.direction}</span>
                    <span>{t.lots.toFixed(2)} lots</span>
                    <span>{unitLabel(t.instrument, stopPips(t))} stop</span>
                    {t.closedEarly && <span className="font-bold text-warn">closed by hand</span>}
                  </div>
                  {open && (
                    <div className="mt-1.5 border-t border-border/60 pt-1.5">
                      {t.reason && (
                        <p className="text-[0.68rem] italic leading-snug text-muted">“{t.reason}”</p>
                      )}
                      <p className="mt-1 text-[0.6rem] tabular text-faint">
                        in {price(t.entry, t.instrument)} · stop {price(t.stop, t.instrument)} ·
                        {" "}target {price(t.target, t.instrument)}
                        {typeof t.exit === "number" && ` · out ${price(t.exit, t.instrument)}`}
                      </p>
                      <p className="mt-0.5 text-[0.6rem] text-faint">
                        Confirmed {t.checks.length} of {checksFor(t.system).length} ·{" "}
                        {t.equityAtEntry > 0
                          ? `${(riskPercent(t, t.equityAtEntry) * 100).toFixed(1)}% risked`
                          : "risk unknown"}
                      </p>
                    </div>
                  )}
                </button>
              </SwipeRow>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- rules -- */

function RulesCard() {
  const [open, setOpen] = useState<SystemId | null>(null);
  return (
    <Card>
      <CardTitle>The rules</CardTitle>
      <p className="mb-2 flex items-start gap-1.5 text-[0.65rem] leading-snug text-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        EUR/USD, 15m, EMA 20 and 50, RSI 14 with its SMA 14 signal. A first version to test —
        the numbers above are what will say whether any of it works.
      </p>
      <div className="space-y-1.5">
        {SYSTEMS.map((s) => (
          <div key={s.id} className="rounded-xl border border-border bg-surface-2">
            <button
              type="button"
              onClick={() => setOpen(open === s.id ? null : s.id)}
              className="w-full px-3 py-2 text-left"
            >
              <span className="block text-xs font-bold">{s.name}</span>
              <span className="block text-[0.62rem] leading-snug text-faint">{s.gist}</span>
            </button>
            {open === s.id && (
              <div className="border-t border-border/60 px-3 py-2">
                <ul className="space-y-1">
                  {s.rules.map((r) => (
                    <li key={r} className="flex gap-1.5 text-[0.65rem] leading-snug text-muted">
                      <span aria-hidden className="text-faint">
                        ·
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[0.65rem] font-bold leading-snug text-warn">
                  Skip it if: {s.skip}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
