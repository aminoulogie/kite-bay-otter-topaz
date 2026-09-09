import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import {
  budgetState, categoriesFor, costPerSession, daysInMonth, inMonth, monthOf, shiftMonth, totals,
} from "@/lib/money";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { LedgerEntry } from "@/lib/types";

/**
 * Spending, logged the way food is: one line at a time, in seconds.
 *
 * The month is the unit rather than the day, because that is the horizon a
 * budget is felt on. Amounts are entered positive and the direction comes from
 * the Spend/Income switch — asking someone to type a minus sign is asking for
 * a month of sign errors.
 */
export function MoneyView() {
  const ledger = useSoma((s) => s.ledger);
  const addLedger = useSoma((s) => s.addLedger);
  const removeLedger = useSoma((s) => s.removeLedger);
  const restoreLedger = useSoma((s) => s.restoreLedger);
  const history = useSoma((s) => s.history);
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);

  const today = getLocalDateKey(new Date());
  const [month, setMonth] = useState(() => monthOf(today));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Food");
  const [newCategory, setNewCategory] = useState("");
  const [kind, setKind] = useState<"spend" | "income">("spend");
  const [note, setNote] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);

  const categories = useMemo(
    () => categoriesFor(settings.spendCategories, ledger),
    [settings.spendCategories, ledger],
  );

  const rows = useMemo(
    () => inMonth(ledger, month).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [ledger, month],
  );
  const t = useMemo(() => totals(rows), [rows]);
  const sessions = useMemo(
    () => Object.keys(history).filter((d) => monthOf(d) === month).length,
    [history, month],
  );
  const perSession = costPerSession(rows, sessions);
  const currency = settings.currency || "DZD";

  // Pace against the budget, for the month actually being looked at. A past
  // month is finished, so it is judged on the whole month rather than on how
  // far through today happens to be.
  const isThisMonth = month === monthOf(today);
  const days = daysInMonth(month);
  const budget = budgetState(
    settings.monthlyBudget ?? 0,
    t.spend,
    isThisMonth ? new Date().getDate() : days,
    days,
  );

  const submit = () => {
    const value = Math.abs(Number(String(amount).replace(",", ".")));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    // Logged against today, not against the month being browsed: a spend is
    // recorded when it happens, and browsing August must not date it there.
    addLedger({ date: today, kind, amount: value, category, note: note.trim() || undefined });
    setAmount("");
    setNote("");
    toast.success(`${kind === "income" ? "Income" : "Spend"} logged`);
    if (monthOf(today) !== month) setMonth(monthOf(today));
  };

  const del = (entry: LedgerEntry) => {
    const index = ledger.findIndex((x) => x.id === entry.id);
    removeLedger(entry.id);
    toast.success("Removed", {
      action: { label: "Undo", onClick: () => restoreLedger(index, entry) },
    });
  };

  const money = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;

  return (
    <div className="space-y-3 pb-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="size-5 text-muted" />
          </button>
          <div className="font-display text-sm font-extrabold">
            {new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
              month: "long", year: "numeric",
            })}
          </div>
          <button
            type="button"
            aria-label="Next month"
            // Nothing has been spent in the future, so there is nowhere to go.
            disabled={month >= monthOf(today)}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="disabled:opacity-30"
          >
            <ChevronRight className="size-5 text-muted" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Spent", money(t.spend), "text-fg"],
            ["In", money(t.income), "text-fg"],
            ["Net", money(t.net), t.net < 0 ? "text-danger" : "text-accent-text"],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-border bg-surface-2 p-2">
              <div className="text-[0.55rem] font-bold uppercase tracking-wider text-faint">{label}</div>
              <div className={cn("truncate font-display text-sm font-extrabold tabular", tone)}>{value}</div>
            </div>
          ))}
        </div>

        {budget && (
          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-bold text-muted">Budget</span>
              <span className={cn("tabular font-bold", budget.left < 0 ? "text-danger" : "text-muted")}>
                {budget.left < 0
                  ? `${money(Math.abs(budget.left))} over`
                  : `${money(budget.left)} left`}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  budget.used > 1 ? "bg-danger" : budget.aheadOfPace ? "bg-warn" : "bg-accent",
                )}
                style={{ width: `${Math.min(100, budget.used * 100)}%` }}
              />
              {/* Where the month is, so the bar has something to be judged
                  against. 60% spent means nothing without knowing it is the 3rd. */}
              {isThisMonth && (
                <span
                  aria-hidden
                  className="absolute top-0 h-full w-0.5 bg-fg/60"
                  style={{ left: `${budget.elapsed * 100}%` }}
                />
              )}
            </div>
            <p className="mt-1 text-[0.68rem] text-faint">
              {budget.aheadOfPace
                ? `Ahead of pace — ${Math.round(budget.used * 100)}% spent, ${Math.round(budget.elapsed * 100)}% through the month.`
                : budget.projected != null && isThisMonth
                  ? `On track for about ${money(budget.projected)} this month.`
                  : `${Math.round(budget.used * 100)}% of ${money(budget.budget)}.`}
            </p>
          </div>
        )}

        {perSession != null && (
          <p className="mt-2 text-center text-[0.7rem] text-muted">
            Gym and supplements worked out to{" "}
            <b className="text-fg">{money(perSession)}</b> per session over {sessions} sessions.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Log</CardTitle>
        <div className="mb-2 flex gap-1.5">
          {(["spend", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "h-8 flex-1 rounded-full text-xs font-bold capitalize transition-colors",
                kind === k ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="mb-2 flex gap-2">
          <Input
            type="text"
            inputMode="decimal"
            placeholder={`Amount in ${currency}`}
            value={amount}
            onChange={(ev) => setAmount(ev.target.value)}
          />
          <Button variant="primary" onClick={submit} aria-label="Add entry">
            <Plus className="size-4" />
          </Button>
        </div>
        {kind === "spend" && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-bold transition-colors",
                  category === c ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <Input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </Card>

      {t.byCategory.length > 0 && (
        <Card>
          <CardTitle>Where it went</CardTitle>
          <div className="space-y-1.5">
            {t.byCategory.map((c) => (
              <div key={c.category}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-bold">{c.category}</span>
                  <span className="shrink-0 tabular text-muted">{money(c.total)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${t.spend ? (c.total / t.spend) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>{rows.length} entries</CardTitle>
        {rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-faint">Nothing logged this month.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <SwipeRow key={r.id} id={r.id} openId={swiped} setOpenId={setSwiped} onDelete={() => del(r)}>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">
                      {r.kind === "income" ? "Income" : r.category}
                      {r.note ? <span className="font-normal text-muted"> · {r.note}</span> : null}
                    </div>
                    <div className="text-[0.7rem] text-faint">{r.date}</div>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 tabular text-sm font-bold",
                      r.kind === "income" ? "text-accent-text" : "text-fg",
                    )}
                  >
                    {r.kind === "income" ? "+" : "−"}
                    {money(Math.abs(r.amount))}
                  </div>
                </div>
              </SwipeRow>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Budget</CardTitle>
        <p className="mb-2 text-[0.7rem] leading-snug text-faint">
          A monthly ceiling to measure against. Leave it empty and this tab reports what
          you spent without judging it.
        </p>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="decimal"
            placeholder={`Monthly budget in ${currency}`}
            defaultValue={settings.monthlyBudget ? String(settings.monthlyBudget) : ""}
            onBlur={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              patchSettings({ monthlyBudget: Number.isFinite(n) && n > 0 ? n : undefined });
            }}
          />
          <Input
            className="w-24 text-center"
            defaultValue={currency}
            aria-label="Currency"
            onBlur={(e) => patchSettings({ currency: e.target.value.trim() || "DZD" })}
          />
        </div>

        <div className="mt-3">
          <div className="mb-1 text-xs font-bold text-muted">Categories</div>
          <p className="mb-2 text-[0.68rem] leading-snug text-faint">
            The shipped ones are guesses. Remove what you never use and add what you do —
            entries already filed under a removed category keep their label.
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const inUse = ledger.some((e) => e.kind !== "income" && e.category === c);
              return (
                <span
                  key={c}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-surface-2 pl-3 pr-1.5 text-xs font-bold text-muted"
                >
                  {c}
                  <button
                    type="button"
                    aria-label={`Remove ${c}`}
                    // A category still on entries cannot be removed from the
                    // list here, because it would come straight back from
                    // categoriesFor and look like the tap did nothing.
                    disabled={inUse}
                    onClick={() =>
                      patchSettings({ spendCategories: categories.filter((x) => x !== c) })
                    }
                    className="grid size-5 place-items-center rounded-full text-faint disabled:opacity-25"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <Button
              onClick={() => {
                const name = newCategory.trim();
                if (!name) return;
                if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
                  toast.error("Already there.");
                  return;
                }
                patchSettings({ spendCategories: [...categories, name] });
                setNewCategory("");
              }}
              aria-label="Add category"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      <p className="px-1 text-center text-[0.7rem] text-faint">
        Swipe an entry left to delete it.
      </p>
    </div>
  );
}
