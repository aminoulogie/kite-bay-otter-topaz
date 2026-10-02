import { useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Receipt,
  Target, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { EntrySheet } from "@/components/money/EntrySheet";
import { ICON_CHOICES, MoneyBar, MoneySheet, MoneyTile, TONE_COLOR } from "@/components/money/money-ui";
import { SwipeRow } from "@/components/SwipeRow";
import { TopTabs } from "@/components/TopTabs";
import { TradingView } from "@/components/views/TradingView";
import { parseDecimal } from "@/components/ui/decimal-input";
import { Sized, WidgetGrid } from "@/components/WidgetGrid";
import { periodOf } from "@/lib/life-goals";
import { monthOf, shiftMonth, toBase } from "@/lib/money";
import {
  CATEGORY_PALETTE, CURRENCIES, MAIN_ID, accountBalance, accountIdOf, accountsOf, budgetRows,
  categoriesOf, categoryOf, colorsOf, dailySpend, formatMoney, goalSaved, monthFlows, ratesOf,
  toneOf, totalBalance,
} from "@/lib/money-model";
import { getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { LedgerEntry, MoneyAccount, MoneyCategory, MoneyCurrency, SavingsGoal } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Money, laid out like a money app: a dashboard of accounts, every
 * transaction, budgets per category, where it went, and savings goals —
 * with the trading journal kept as its own page.
 *
 * Every amount is stored in the currency it was paid in and converted to
 * dinars for totals at the rates set in Settings.
 */
const PAGES = [
  { id: "dash", label: "Dashboard" },
  { id: "tx", label: "Transactions" },
  { id: "budgets", label: "Budgets" },
  { id: "insights", label: "Insights" },
  { id: "goals", label: "Goals" },
  { id: "trade", label: "Trading" },
] as const;
type Page = (typeof PAGES)[number]["id"];

export function MoneyView({ initialPage = "dash" }: { initialPage?: Page }) {
  const [page, setPage] = useState<Page>(initialPage);
  const [adding, setAdding] = useState<null | "spend" | "income">(null);
  return (
    <>
      <TopTabs tabs={PAGES} value={page} onChange={setPage} className="mb-3" />
      {page === "dash" && <Dashboard go={setPage} add={setAdding} />}
      {page === "tx" && <Transactions add={setAdding} />}
      {page === "budgets" && <Budgets />}
      {page === "insights" && <Insights />}
      {page === "goals" && <Goals />}
      {page === "trade" && <TradingView />}
      {adding && <EntrySheet defaultKind={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

/** Everything the pages share, read once. */
function useMoney() {
  const ledger = useSoma((s) => s.ledger);
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const rates = useMemo(() => ratesOf(settings), [settings]);
  const accounts = useMemo(() => accountsOf(settings), [settings]);
  const cats = useMemo(() => categoriesOf(settings, ledger), [settings, ledger]);
  const colors = colorsOf(settings);
  const hidden = !!settings.moneyHidden;
  const show = (n: number, c: MoneyCurrency = "DZD", sign = false) =>
    hidden ? "•••••" : formatMoney(n, c, { sign });
  return { ledger, settings, patchSettings, rates, accounts, cats, colors, hidden, show };
}

const today = () => getLocalDateKey(new Date());
const monthLabel = (m: string) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const shortDate = (d: string) =>
  parseLocalDateKey(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function MonthPicker({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
        <ChevronLeft className="size-5 text-muted" />
      </button>
      <div className="font-display text-sm font-extrabold">{monthLabel(month)}</div>
      <button
        type="button"
        aria-label="Next month"
        disabled={month >= monthOf(today())}
        onClick={() => setMonth(shiftMonth(month, 1))}
        className="disabled:opacity-30"
      >
        <ChevronRight className="size-5 text-muted" />
      </button>
    </div>
  );
}

/** One transaction as a row: tile, what it was, when, and the amount in colour. */
function TxRow({ e, cats, show, colors, accountName }: {
  e: LedgerEntry;
  cats: MoneyCategory[];
  show: (n: number, c?: MoneyCurrency, sign?: boolean) => string;
  colors: ReturnType<typeof colorsOf>;
  accountName?: string;
}) {
  const income = e.kind === "income";
  const cat = e.kind === "save"
    ? { name: "Savings", icon: "piggy", color: colors.card }
    : categoryOf(cats, e.category, income ? "income" : "spend");
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5">
      <MoneyTile icon={cat.icon} color={cat.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-bold">
          <span className="truncate">{e.note || cat.name}</span>
          {e.photo && <Receipt className="size-3 shrink-0 text-faint" aria-label="Has a receipt" />}
        </div>
        <div className="truncate text-[0.7rem] text-faint">
          {shortDate(e.date)}
          {e.note ? ` · ${cat.name}` : ""}
          {accountName ? ` · ${accountName}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-sm font-bold tabular" style={{ color: income ? colors.income : colors.expense }}>
        {show(income ? e.amount : -e.amount, e.currency ?? "DZD", true)}
      </div>
    </div>
  );
}

/* ============================================================ dashboard == */

function Dashboard({ go, add }: { go: (p: Page) => void; add: (k: "spend" | "income") => void }) {
  const m = useMoney();
  const { ledger, accounts, rates, colors, show, settings } = m;
  const month = monthOf(today());
  const [editingAccount, setEditingAccount] = useState<MoneyAccount | "new" | null>(null);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const recent = useMemo(
    () => [...ledger].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 6),
    [ledger],
  );
  const total = totalBalance(accounts, ledger, rates);
  const flows = monthFlows(ledger, month, rates);
  const budget = settings.monthlyBudget ?? 0;
  const used = budget > 0 ? flows.spend / budget : null;
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name;

  return (
    <WidgetGrid tab="money-dash">
      <Sized key="accounts" glance={() => ({
          label: "Balance",
          icon: Wallet,
          color: colors.card,
          value: m.hidden ? "•••" : formatMoney(total).replace(" DA", ""),
          unit: "DA",
          sub: `in ${formatMoney(flows.income)} · out ${formatMoney(flows.spend)}`,
          stats: accounts.slice(0, 4).map((a) => ({ label: a.name, value: show(accountBalance(a, ledger, rates), a.currency) })),
        })}>
        <div>
          {/* One card per account, swiped through. */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-no-swipe-nav>
            {accounts.map((a) => {
              const bal = accountBalance(a, ledger, rates);
              const f = monthFlows(ledger, month, rates, a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setEditingAccount(a)}
                  className="relative w-[86%] shrink-0 snap-center overflow-hidden rounded-3xl p-5 text-left text-white"
                  style={{ background: `linear-gradient(135deg, ${a.color || colors.card}, color-mix(in srgb, ${a.color || colors.card} 55%, #000))` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold opacity-80">{a.name} · {a.currency}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={m.hidden ? "Show amounts" : "Hide amounts"}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        m.patchSettings({ moneyHidden: !m.hidden });
                      }}
                      className="grid size-8 place-items-center rounded-full bg-white/15"
                    >
                      {m.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </span>
                  </div>
                  <div className="mt-2 font-display text-3xl font-extrabold tabular">{show(bal, a.currency)}</div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-3 text-xs">
                    <div>
                      <div className="opacity-75">Income</div>
                      <div className="font-bold tabular">{show(f.income)}</div>
                    </div>
                    <div>
                      <div className="opacity-75">Expenses</div>
                      <div className="font-bold tabular">{show(f.spend)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setEditingAccount("new")}
              className="grid w-[40%] shrink-0 snap-center place-items-center rounded-3xl border-2 border-dashed border-border text-sm font-bold text-muted"
            >
              <span className="flex flex-col items-center gap-1">
                <Plus className="size-5" /> Account
              </span>
            </button>
          </div>
          {accounts.length > 1 && (
            <div className="mt-2 text-center text-[0.7rem] font-bold text-faint">
              Total {show(total)}
            </div>
          )}
        </div>
      </Sized>

      {/* The mockup's four round actions. */}
      <div key="actions" className="grid grid-cols-4 gap-2">
        {[
          { label: "Expense", icon: ArrowUpRight, color: colors.expense, on: () => add("spend") },
          { label: "Income", icon: ArrowDownLeft, color: colors.income, on: () => add("income") },
          { label: "Budget", icon: BarChart3, color: "#bf5af2", on: () => go("budgets") },
          { label: "Goals", icon: Target, color: "#ff9f0a", on: () => go("goals") },
        ].map((b) => (
          <button key={b.label} type="button" onClick={b.on} className="flex flex-col items-center gap-1.5">
            <span
              className="grid size-14 place-items-center rounded-2xl"
              style={{ background: `color-mix(in srgb, ${b.color} 18%, transparent)`, color: b.color }}
            >
              <b.icon className="size-6" strokeWidth={2.2} />
            </span>
            <span className="text-[0.7rem] font-bold">{b.label}</span>
          </button>
        ))}
      </div>

      {used != null && (
        <button key="budget" type="button" onClick={() => go("budgets")} className="w-full rounded-3xl border border-border bg-surface p-4 text-left">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-bold">This month's budget</span>
            <span className="text-xs font-bold tabular text-muted">{Math.round(used * 100)}%</span>
          </div>
          <MoneyBar value={used} color={toneOf(used) === "ok" ? colors.card : TONE_COLOR[toneOf(used) as "warn" | "over"]} />
          <div className="mt-1.5 text-xs text-faint">
            {show(Math.max(0, budget - flows.spend))} left of {show(budget)}
          </div>
        </button>
      )}

      <Sized key="recent" glance={() => ({
          label: "Recent",
          icon: Receipt,
          lines: recent.map((e) => ({
            text: e.note || e.category,
            value: show(e.kind === "income" ? e.amount : -e.amount, e.currency ?? "DZD", true),
            color: categoryOf(m.cats, e.category).color,
          })),
          empty: "No transactions yet",
        })}>
        <div>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <span className="font-display text-base font-extrabold">Recent transactions</span>
            <button type="button" onClick={() => go("tx")} className="text-xs font-bold text-muted">
              See all
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">Nothing yet. Add an expense or income above.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((e) => (
                <button key={e.id} type="button" className="block w-full text-left" onClick={() => e.kind !== "save" && setEditing(e)}>
                  <TxRow e={e} cats={m.cats} show={show} colors={colors} accountName={accounts.length > 1 ? accName(accountIdOf(e)) : undefined} />
                </button>
              ))}
            </div>
          )}
        </div>
      </Sized>

      {editingAccount && (
        <AccountSheet account={editingAccount === "new" ? null : editingAccount} onClose={() => setEditingAccount(null)} />
      )}
      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </WidgetGrid>
  );
}

/** Add an account, or rename one and set what it holds. */
function AccountSheet({ account, onClose }: { account: MoneyAccount | null; onClose: () => void }) {
  const m = useMoney();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<MoneyAccount["kind"]>(account?.kind ?? "bank");
  const [currency, setCurrency] = useState<MoneyCurrency>(account?.currency ?? "DZD");
  const now = account ? accountBalance(account, m.ledger, m.rates) : 0;
  const [balance, setBalance] = useState(account ? String(now) : "");
  const [color, setColor] = useState(account?.color ?? m.colors.card);

  const save = () => {
    const n = parseDecimal(balance) ?? 0;
    const t = today();
    const id = account?.id ?? `acc-${Date.now().toString(36)}`;
    // The balance typed is what it holds NOW, so the opening point moves to
    // today with today's entries taken back out — they are already in the
    // number just typed, and counting them again would double them.
    const draft: MoneyAccount = { id, name: name.trim() || "Account", kind, currency, color, opening: 0, openingDate: t };
    const todays = accountBalance({ ...draft, opening: 0 }, m.ledger.filter((e) => e.date === t), m.rates);
    draft.opening = Math.round((n - todays) * 100) / 100;
    const list = m.accounts.filter((a) => a.id !== id);
    const at = m.accounts.findIndex((a) => a.id === id);
    list.splice(at >= 0 ? at : list.length, 0, draft);
    m.patchSettings({ moneyAccounts: list });
    toast.success(account ? "Account saved" : "Account added");
    onClose();
  };

  const remove = () => {
    if (!account || account.id === MAIN_ID) return;
    if (m.ledger.some((e) => accountIdOf(e) === account.id)) {
      toast.error("It has transactions. Move or delete them first.");
      return;
    }
    m.patchSettings({ moneyAccounts: m.accounts.filter((a) => a.id !== account.id) });
    onClose();
  };

  return (
    <MoneySheet title={account ? account.name : "New account"} onClose={onClose}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cash, Bank card, Savings…" className={INPUT} />
      </Field>
      <Field label="Type">
        <Chips value={kind} options={[["cash", "Cash"], ["bank", "Bank"], ["card", "Card"], ["savings", "Savings"]]} onPick={setKind} />
      </Field>
      <Field label="Currency">
        <Chips value={currency} options={CURRENCIES.map((c) => [c, c])} onPick={setCurrency} />
      </Field>
      <Field label="What it holds now">
        <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" className={INPUT} />
      </Field>
      <Field label="Colour">
        <Swatches value={color} onPick={setColor} />
      </Field>
      <button type="button" onClick={save} className="mt-2 h-12 w-full rounded-2xl text-sm font-bold text-white" style={{ background: m.colors.card }}>
        Save account
      </button>
      {account && account.id !== MAIN_ID && (
        <button type="button" onClick={remove} className="mt-2 h-10 w-full text-sm font-bold text-danger">
          Delete account
        </button>
      )}
    </MoneySheet>
  );
}

/* ========================================================= transactions == */

function Transactions({ add }: { add: (k: "spend" | "income") => void }) {
  const m = useMoney();
  const removeLedger = useSoma((s) => s.removeLedger);
  const restoreLedger = useSoma((s) => s.restoreLedger);
  const [filter, setFilter] = useState<"all" | "income" | "spend">("all");
  const [swiped, setSwiped] = useState<string | null>(null);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);

  const groups = useMemo(() => {
    const rows = m.ledger
      .filter((e) => filter === "all" || e.kind === filter)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const out: { month: string; net: number; rows: LedgerEntry[] }[] = [];
    for (const e of rows) {
      const mo = monthOf(e.date);
      let g = out[out.length - 1];
      if (!g || g.month !== mo) out.push((g = { month: mo, net: 0, rows: [] }));
      const v = toBase(Math.abs(e.amount), e.currency, m.rates);
      g.net += e.kind === "income" ? v : -v;
      g.rows.push(e);
    }
    return out;
  }, [m.ledger, filter, m.rates]);

  const del = (e: LedgerEntry) => {
    const index = m.ledger.findIndex((x) => x.id === e.id);
    removeLedger(e.id);
    toast.success("Deleted", { action: { label: "Undo", onClick: () => restoreLedger(index, e) } });
  };
  const accName = (id: string) => m.accounts.find((a) => a.id === id)?.name;

  return (
    <WidgetGrid tab="money-tx">
      <div key="filters" className="flex items-center gap-2">
        {([["all", "All"], ["income", "Income"], ["spend", "Expenses"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn("h-9 flex-1 rounded-full text-xs font-bold", filter === id ? "text-white" : "bg-surface-2 text-muted")}
            style={filter === id ? { background: m.colors.card } : undefined}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Add transaction"
          onClick={() => add(filter === "income" ? "income" : "spend")}
          className="grid size-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: m.colors.card }}
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div key="list" className="space-y-4">
        {groups.length === 0 && <p className="py-10 text-center text-sm text-faint">No transactions.</p>}
        {groups.map((g) => (
          <section key={g.month}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <span className="font-display text-sm font-extrabold">{monthLabel(g.month)}</span>
              <span className="text-xs font-bold tabular" style={{ color: g.net < 0 ? m.colors.expense : m.colors.income }}>
                {m.show(g.net, "DZD", true)}
              </span>
            </div>
            <div className="space-y-2">
              {g.rows.map((e) => (
                <SwipeRow
                  key={e.id}
                  id={e.id}
                  openId={swiped}
                  setOpenId={setSwiped}
                  onEdit={e.kind === "save" ? undefined : () => setEditing(e)}
                  onDelete={() => del(e)}
                >
                  <TxRow e={e} cats={m.cats} show={m.show} colors={m.colors} accountName={m.accounts.length > 1 ? accName(accountIdOf(e)) : undefined} />
                </SwipeRow>
              ))}
            </div>
          </section>
        ))}
      </div>

      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </WidgetGrid>
  );
}

/* ============================================================== budgets == */

function Budgets() {
  const m = useMoney();
  const [month, setMonth] = useState(monthOf(today()));
  const [editing, setEditing] = useState<MoneyCategory | "total" | "new" | null>(null);
  const rows = budgetRows(m.ledger, month, m.cats, m.settings.categoryBudgets, m.rates);
  const spent = monthFlows(m.ledger, month, m.rates).spend;
  const total = m.settings.monthlyBudget ?? 0;
  const used = total > 0 ? spent / total : null;
  const toneColor = (u: number | null, base: string) => {
    const t = toneOf(u);
    return t === "ok" ? base : TONE_COLOR[t];
  };
  // Categories with no spending and no budget yet, offered underneath.
  const idle = m.cats.filter((c) => c.kind === "spend" && !rows.some((r) => r.category.name === c.name));

  return (
    <WidgetGrid tab="money-budgets">
      <Sized key="total" glance={() => ({
          label: "Monthly budget",
          icon: BarChart3,
          color: m.colors.card,
          value: total > 0 ? m.show(Math.max(0, total - spent)) : null,
          sub: total > 0 ? `left of ${m.show(total)}` : null,
          progress: used,
          empty: "No monthly budget",
        })}>
        <div className="rounded-3xl border border-border bg-surface p-4">
          <MonthPicker month={month} setMonth={setMonth} />
          <button type="button" onClick={() => setEditing("total")} className="mt-3 block w-full text-left">
            <div className="text-xs font-bold text-muted">Monthly budget</div>
            {total > 0 ? (
              <>
                <div className="mt-1 font-display text-3xl font-extrabold tabular">
                  {m.show(Math.max(0, total - spent))} <span className="text-base font-bold text-muted">{total - spent < 0 ? "over" : "left"}</span>
                </div>
                <div className="mt-3">
                  <MoneyBar value={used ?? 0} color={toneColor(used, m.colors.card)} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-faint">
                  <span>{m.show(spent)} of {m.show(total)}</span>
                  <span className="font-bold tabular">{Math.round((used ?? 0) * 100)}%</span>
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm font-bold" style={{ color: m.colors.card }}>Set a monthly budget</div>
            )}
          </button>
        </div>
      </Sized>

      <div key="categories" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-display text-base font-extrabold">Categories</span>
          <button type="button" aria-label="New category" onClick={() => setEditing("new")} className="grid size-8 place-items-center rounded-full bg-surface-2">
            <Plus className="size-4" />
          </button>
        </div>
        {rows.map((r) => (
          <button key={r.category.name} type="button" onClick={() => setEditing(r.category)} className="flex w-full items-center gap-3 rounded-2xl bg-surface px-3 py-3 text-left">
            <MoneyTile icon={r.category.icon} color={r.category.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold">{r.category.name}</span>
                {r.used != null && <span className="shrink-0 text-xs font-bold tabular text-muted">{Math.round(r.used * 100)}%</span>}
              </div>
              <div className="mb-1.5 text-[0.7rem] text-faint">
                {m.show(r.spent)}{r.budget > 0 ? ` of ${m.show(r.budget)}` : " · no budget"}
              </div>
              {r.budget > 0 && <MoneyBar value={r.used ?? 0} color={toneColor(r.used, r.category.color)} />}
            </div>
          </button>
        ))}
        {idle.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {idle.map((c) => (
              <button key={c.name} type="button" onClick={() => setEditing(c)} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-xs font-bold text-muted">
                <MoneyTile icon={c.icon} color={c.color} size={22} /> {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {editing === "total" && (
        <AmountSheet
          title="Monthly budget"
          value={total}
          onSave={(n) => m.patchSettings({ monthlyBudget: n > 0 ? n : undefined })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing && editing !== "total" && (
        <CategorySheet category={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </WidgetGrid>
  );
}

/** A category: its budget, icon and colour; or a new one. */
function CategorySheet({ category, onClose }: { category: MoneyCategory | null; onClose: () => void }) {
  const m = useMoney();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<"spend" | "income">(category?.kind ?? "spend");
  const [icon, setIcon] = useState(category?.icon ?? "tag");
  const [color, setColor] = useState(category?.color ?? CATEGORY_PALETTE[0]!);
  const [budget, setBudget] = useState(
    category && m.settings.categoryBudgets?.[category.name] ? String(m.settings.categoryBudgets[category.name]) : "",
  );

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (!category && m.cats.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      toast.error("That category already exists.");
      return;
    }
    const next: MoneyCategory = { name: category?.name ?? n, icon, color, kind };
    const list = category ? m.cats.map((c) => (c.name === category.name ? next : c)) : [...m.cats, next];
    const budgets = { ...(m.settings.categoryBudgets ?? {}) };
    const b = parseDecimal(budget);
    if (b && b > 0 && kind === "spend") budgets[next.name] = b;
    else delete budgets[next.name];
    m.patchSettings({ moneyCategories: list, categoryBudgets: budgets });
    onClose();
  };

  const remove = () => {
    if (!category) return;
    if (m.ledger.some((e) => e.category === category.name)) {
      toast.error("Transactions use it, so it stays.");
      return;
    }
    m.patchSettings({ moneyCategories: m.cats.filter((c) => c.name !== category.name) });
    onClose();
  };

  return (
    <MoneySheet title={category ? category.name : "New category"} onClose={onClose}>
      {!category && (
        <>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee" className={INPUT} />
          </Field>
          <Field label="Kind">
            <Chips value={kind} options={[["spend", "Expense"], ["income", "Income"]]} onPick={setKind} />
          </Field>
        </>
      )}
      {kind === "spend" && (
        <Field label="Monthly budget (DA)">
          <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="No budget" className={INPUT} />
        </Field>
      )}
      <Field label="Icon">
        <div className="grid grid-cols-7 gap-1.5">
          {ICON_CHOICES.map((i) => (
            <button key={i} type="button" onClick={() => setIcon(i)} className={cn("grid place-items-center rounded-xl p-1", icon === i && "bg-surface-3")}>
              <MoneyTile icon={i} color={color} size={34} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Colour">
        <Swatches value={color} onPick={setColor} />
      </Field>
      <button type="button" onClick={save} className="mt-2 h-12 w-full rounded-2xl text-sm font-bold text-white" style={{ background: m.colors.card }}>
        Save
      </button>
      {category && (
        <button type="button" onClick={remove} className="mt-2 h-10 w-full text-sm font-bold text-danger">
          Remove category
        </button>
      )}
    </MoneySheet>
  );
}

/* ============================================================= insights == */

function Insights() {
  const m = useMoney();
  const [month, setMonth] = useState(monthOf(today()));
  const rows = budgetRows(m.ledger, month, m.cats, undefined, m.rates).filter((r) => r.spent > 0);
  const total = rows.reduce((a, r) => a + r.spent, 0);
  const days = dailySpend(m.ledger, month, m.rates);
  const peak = Math.max(1, ...days);

  // The donut: one arc per category, in its own colour.
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <WidgetGrid tab="money-insights">
      <div key="month" className="rounded-3xl border border-border bg-surface px-4 py-3">
        <MonthPicker month={month} setMonth={setMonth} />
      </div>

      <Sized key="donut" glance={() => ({
          label: "Spending",
          icon: BarChart3,
          value: m.show(total),
          lines: rows.slice(0, 5).map((r) => ({ text: r.category.name, value: `${Math.round((r.spent / (total || 1)) * 100)}%`, color: r.category.color })),
          empty: "Nothing spent this month",
        })}>
        <div className="rounded-3xl border border-border bg-surface p-4">
          <div className="mb-3 font-display text-base font-extrabold">Expenses by category</div>
          {total === 0 ? (
            <p className="py-6 text-center text-sm text-faint">Nothing spent in {monthLabel(month)}.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative size-36 shrink-0">
                <svg viewBox="0 0 140 140" className="size-full -rotate-90">
                  <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-surface-3)" strokeWidth="20" />
                  {rows.map((r) => {
                    const len = (r.spent / total) * C;
                    const dash = `${Math.max(0, len - 2)} ${C}`;
                    const el = (
                      <circle key={r.category.name} cx="70" cy="70" r={R} fill="none" stroke={r.category.color} strokeWidth="20" strokeDasharray={dash} strokeDashoffset={-offset} />
                    );
                    offset += len;
                    return el;
                  })}
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-sm font-extrabold tabular">{m.show(total)}</div>
                    <div className="text-[0.62rem] text-faint">Total</div>
                  </div>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {rows.slice(0, 7).map((r) => (
                  <li key={r.category.name} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.category.color }} />
                    <span className="min-w-0 flex-1 truncate">{r.category.name}</span>
                    <span className="shrink-0 font-bold tabular">{Math.round((r.spent / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Sized>

      <div key="daily" className="rounded-3xl border border-border bg-surface p-4">
        <div className="mb-3 font-display text-base font-extrabold">Spending each day</div>
        <div className="flex h-32 items-end gap-[2px]">
          {days.map((v, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${i + 1}: ${formatMoney(v)}`}>
              <div className="w-full rounded-t-[3px]" style={{ height: `${(v / peak) * 100}%`, minHeight: v ? 2 : 0, background: m.colors.card }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[0.6rem] text-faint">
          <span>1</span>
          <span>{Math.ceil(days.length / 2)}</span>
          <span>{days.length}</span>
        </div>
      </div>
    </WidgetGrid>
  );
}

/* ================================================================ goals == */

function Goals() {
  const m = useMoney();
  const addGoal = useSoma((s) => s.addGoal);
  const patchGoal = useSoma((s) => s.patchGoal);
  const removeGoal = useSoma((s) => s.removeGoal);
  const addLedger = useSoma((s) => s.addLedger);
  const goals = m.settings.savingsGoals ?? [];
  const [editing, setEditing] = useState<SavingsGoal | "new" | null>(null);
  const [adding, setAdding] = useState<SavingsGoal | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);

  /** Keep the counted goal in Projects › Goals in step with what is saved. */
  const syncLife = (g: SavingsGoal, saved: number) => {
    if (!g.lifeGoalId) return;
    patchGoal(g.lifeGoalId, {
      progress: saved,
      target: g.target,
      title: g.name,
      done: saved >= g.target,
      doneAt: saved >= g.target ? Date.now() : undefined,
    });
  };

  const saveGoal = (draft: { name: string; target: number; icon: string; color: string }, existing: SavingsGoal | null) => {
    if (existing) {
      const g = { ...existing, ...draft };
      m.patchSettings({ savingsGoals: goals.map((x) => (x.id === g.id ? g : x)) });
      syncLife(g, goalSaved(g, m.ledger, m.rates));
      return;
    }
    const lifeGoalId = addGoal({
      title: draft.name, horizon: "year", period: periodOf("year"),
      target: draft.target, progress: 0, unit: "DA", color: draft.color,
    });
    const g: SavingsGoal = { id: `goal-${Date.now().toString(36)}`, createdAt: Date.now(), lifeGoalId, ...draft };
    m.patchSettings({ savingsGoals: [...goals, g] });
  };

  const contribute = (g: SavingsGoal, amount: number, accountId: string) => {
    addLedger({
      date: today(), kind: "save", amount, category: "Savings", note: g.name,
      goalId: g.id, accountId: accountId === MAIN_ID ? undefined : accountId,
    });
    const saved = goalSaved(g, useSoma.getState().ledger, m.rates);
    syncLife(g, saved);
    toast.success(saved >= g.target ? `${g.name} reached!` : `Added to ${g.name}`);
  };

  const remove = (g: SavingsGoal) => {
    m.patchSettings({ savingsGoals: goals.filter((x) => x.id !== g.id) });
    if (g.lifeGoalId) removeGoal(g.lifeGoalId);
    toast.success(`${g.name} removed — what you saved stays in its account`);
  };

  return (
    <WidgetGrid tab="money-goals">
      <Sized key="goals" glance={() => ({
          label: "Savings goals",
          icon: Target,
          lines: goals.map((g) => ({
            text: g.name,
            value: `${Math.round((goalSaved(g, m.ledger, m.rates) / (g.target || 1)) * 100)}%`,
            color: g.color,
          })),
          empty: "No savings goals",
        })}>
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="font-display text-base font-extrabold">Goals</span>
            <button type="button" aria-label="New goal" onClick={() => setEditing("new")} className="grid size-8 place-items-center rounded-full bg-surface-2">
              <Plus className="size-4" />
            </button>
          </div>
          {goals.length === 0 && (
            <p className="py-8 text-center text-sm text-faint">
              Something to save for — a trip, a laptop, a car. Tap + to start one.
            </p>
          )}
          {goals.map((g) => {
            const saved = goalSaved(g, m.ledger, m.rates);
            const p = g.target > 0 ? saved / g.target : 0;
            return (
              <SwipeRow key={g.id} id={g.id} openId={swiped} setOpenId={setSwiped} onEdit={() => setEditing(g)} onDelete={() => remove(g)}>
                <button type="button" onClick={() => setAdding(g)} className="flex w-full items-center gap-3 rounded-3xl bg-surface p-4 text-left">
                  <MoneyTile icon={g.icon} color={g.color} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold">{g.name}</div>
                    <div className="mb-2 text-xs text-faint">{m.show(saved)} of {m.show(g.target)}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><MoneyBar value={p} color={m.colors.card} /></div>
                      <span className="text-xs font-bold tabular text-muted">{Math.round(p * 100)}%</span>
                    </div>
                  </div>
                </button>
              </SwipeRow>
            );
          })}
        </div>
      </Sized>

      {editing && (
        <GoalSheet
          goal={editing === "new" ? null : editing}
          onSave={(d) => saveGoal(d, editing === "new" ? null : editing)}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && (
        <ContributeSheet goal={adding} onSave={(n, acc) => contribute(adding, n, acc)} onClose={() => setAdding(null)} />
      )}
    </WidgetGrid>
  );
}

function GoalSheet({ goal, onSave, onClose }: {
  goal: SavingsGoal | null;
  onSave: (d: { name: string; target: number; icon: string; color: string }) => void;
  onClose: () => void;
}) {
  const m = useMoney();
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? String(goal.target) : "");
  const [icon, setIcon] = useState(goal?.icon ?? "palmtree");
  const [color, setColor] = useState(goal?.color ?? "#64d2ff");
  return (
    <MoneySheet title={goal ? goal.name : "New savings goal"} onClose={onClose}>
      <Field label="What for">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacation, new laptop…" className={INPUT} />
      </Field>
      <Field label="Target (DA)">
        <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="200000" className={INPUT} />
      </Field>
      <Field label="Icon">
        <div className="grid grid-cols-7 gap-1.5">
          {ICON_CHOICES.map((i) => (
            <button key={i} type="button" onClick={() => setIcon(i)} className={cn("grid place-items-center rounded-xl p-1", icon === i && "bg-surface-3")}>
              <MoneyTile icon={i} color={color} size={34} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Colour">
        <Swatches value={color} onPick={setColor} />
      </Field>
      <p className="mb-3 text-[0.7rem] leading-snug text-faint">It also shows in Projects › Goals as this year's counted goal.</p>
      <button
        type="button"
        onClick={() => {
          const t = parseDecimal(target);
          if (!name.trim() || !t || t <= 0) {
            toast.error("A name and a target, please.");
            return;
          }
          onSave({ name: name.trim(), target: t, icon, color });
          onClose();
        }}
        className="h-12 w-full rounded-2xl text-sm font-bold text-white"
        style={{ background: m.colors.card }}
      >
        Save goal
      </button>
    </MoneySheet>
  );
}

function ContributeSheet({ goal, onSave, onClose }: {
  goal: SavingsGoal;
  onSave: (amount: number, accountId: string) => void;
  onClose: () => void;
}) {
  const m = useMoney();
  const [amount, setAmount] = useState("");
  const [acc, setAcc] = useState(MAIN_ID);
  const saved = goalSaved(goal, m.ledger, m.rates);
  return (
    <MoneySheet title={`Add to ${goal.name}`} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <MoneyTile icon={goal.icon} color={goal.color} size={48} />
        <div className="text-sm text-muted">{m.show(saved)} of {m.show(goal.target)} saved</div>
      </div>
      <Field label="Amount (DA)">
        <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={INPUT} />
      </Field>
      <Field label="From account">
        <Chips value={acc} options={m.accounts.map((a) => [a.id, a.name])} onPick={setAcc} />
      </Field>
      <button
        type="button"
        onClick={() => {
          const n = parseDecimal(amount);
          if (!n || n <= 0) return;
          onSave(n, acc);
          onClose();
        }}
        className="mt-2 h-12 w-full rounded-2xl text-sm font-bold text-white"
        style={{ background: m.colors.card }}
      >
        Add to goal
      </button>
    </MoneySheet>
  );
}

/* ============================================================== shared == */

function AmountSheet({ title, value, onSave, onClose }: {
  title: string;
  value: number;
  onSave: (n: number) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(value > 0 ? String(value) : "");
  return (
    <MoneySheet title={title} onClose={onClose}>
      <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0 = no budget" className={INPUT} />
      <button
        type="button"
        onClick={() => {
          onSave(parseDecimal(v) ?? 0);
          onClose();
        }}
        className="mt-3 h-12 w-full rounded-2xl bg-fg text-sm font-bold text-bg"
      >
        Save
      </button>
    </MoneySheet>
  );
}

const INPUT = "h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      {children}
    </div>
  );
}

function Chips<T extends string>({ value, options, onPick }: {
  value: T;
  options: readonly (readonly [T, string])[] | [T, string][];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onPick(id)}
          className={cn("h-9 rounded-full px-3.5 text-xs font-bold", value === id ? "bg-fg text-bg" : "bg-surface-2 text-muted")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["#1f8a4c", ...CATEGORY_PALETTE].map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onPick(c)}
          className={cn("size-8 rounded-full border-2", value === c ? "border-fg" : "border-transparent")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
