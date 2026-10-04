/**
 * The Money tab's model: accounts, currencies, categories with icons and
 * colours, monthly budgets per category, and savings goals.
 *
 * Everything is derived from the ledger plus a few settings, so there is
 * nothing to migrate: an entry logged before accounts existed simply belongs
 * to Main, and Main opens with the balance that used to be the single
 * balance anchor.
 */
import { BASE, DEFAULT_RATES, fromBase, monthOf, toBase, type Rates } from "./money.ts";
import type { LedgerEntry, MoneyAccount, MoneyCategory, MoneyCurrency, SavingsGoal, Settings } from "./types.ts";

export const MAIN_ID = "main";

export const CURRENCIES: MoneyCurrency[] = ["DZD", "EUR", "USD"];
export const SYMBOL: Record<MoneyCurrency, string> = { DZD: "DA", EUR: "€", USD: "$" };

export const MONEY_COLORS = { card: "#1f8a4c", income: "#30d158", expense: "#ff453a" };

/** Category colours, the mockup's: one each, distinct on dark and light. */
export const CATEGORY_PALETTE = [
  "#ff9f0a", "#ff375f", "#0a84ff", "#bf5af2", "#ffd60a", "#30d158",
  "#64d2ff", "#ff6b3d", "#5e5ce6", "#ac8e68", "#8e8e93",
];

export const DEFAULT_MONEY_CATEGORIES: MoneyCategory[] = [
  { name: "Food", icon: "utensils", color: "#ff9f0a", kind: "spend" },
  { name: "Groceries", icon: "shopping-cart", color: "#ff375f", kind: "spend" },
  { name: "Rent", icon: "home", color: "#ff6b3d", kind: "spend" },
  { name: "Bills", icon: "zap", color: "#ffd60a", kind: "spend" },
  { name: "Transport", icon: "car", color: "#0a84ff", kind: "spend" },
  { name: "Shopping", icon: "shopping-bag", color: "#ff2d92", kind: "spend" },
  { name: "Entertainment", icon: "gamepad", color: "#bf5af2", kind: "spend" },
  { name: "Gym", icon: "dumbbell", color: "#30d158", kind: "spend" },
  { name: "Supplements", icon: "pill", color: "#64d2ff", kind: "spend" },
  { name: "Health", icon: "heart", color: "#ff453a", kind: "spend" },
  { name: "Clothes", icon: "shirt", color: "#5e5ce6", kind: "spend" },
  { name: "Subscriptions", icon: "tv", color: "#e50914", kind: "spend" },
  { name: "Other", icon: "circle", color: "#8e8e93", kind: "spend" },
  { name: "Salary", icon: "wallet", color: "#30d158", kind: "income" },
  { name: "Freelance", icon: "briefcase", color: "#0a84ff", kind: "income" },
  { name: "Trading", icon: "trending-up", color: "#ffd60a", kind: "income" },
  { name: "Gift", icon: "gift", color: "#ff375f", kind: "income" },
  { name: "Other income", icon: "plus-circle", color: "#8e8e93", kind: "income" },
];

/** Stable colour for a category name with none set. */
function colorFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length]!;
}

/**
 * The categories to offer: the user's own list if set, else the defaults —
 * plus every older spending category (from Settings or used by an entry),
 * so nothing logged before this tab existed loses its label.
 */
export function categoriesOf(settings: Settings, ledger: LedgerEntry[]): MoneyCategory[] {
  const base = settings.moneyCategories?.length ? settings.moneyCategories : DEFAULT_MONEY_CATEGORIES;
  const out = [...base];
  const seen = new Set(out.map((c) => c.name.toLowerCase()));
  const add = (name: string, kind: "spend" | "income") => {
    const n = name.trim();
    if (!n || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    out.push({ name: n, icon: kind === "income" ? "plus-circle" : "tag", color: colorFor(n), kind });
  };
  for (const n of settings.spendCategories ?? []) add(n, "spend");
  for (const e of ledger) {
    if (e.kind === "save") continue;
    add(e.category || (e.kind === "income" ? "Other income" : "Other"), e.kind);
  }
  return out;
}

export function categoryOf(cats: MoneyCategory[], name: string, kind: "spend" | "income" = "spend"): MoneyCategory {
  return (
    cats.find((c) => c.name.toLowerCase() === (name || "").toLowerCase()) ?? {
      name: name || (kind === "income" ? "Income" : "Other"),
      icon: kind === "income" ? "plus-circle" : "tag",
      color: colorFor(name || "Other"),
      kind,
    }
  );
}

/** The accounts: the user's, or one Main account made from the old balance anchor. */
export function accountsOf(settings: Settings): MoneyAccount[] {
  const list = settings.moneyAccounts?.length ? [...settings.moneyAccounts] : [];
  if (!list.some((a) => a.id === MAIN_ID)) {
    list.unshift({
      id: MAIN_ID,
      name: "Main",
      kind: "bank",
      currency: BASE,
      opening: settings.moneyBalance ?? 0,
      openingDate: settings.moneyBalanceDate ?? "0000-00-00",
      color: MONEY_COLORS.card,
    });
  }
  return list;
}

export const accountIdOf = (e: LedgerEntry) => e.accountId || MAIN_ID;

/**
 * What an account holds now, in its own currency: the opening amount plus
 * every entry from its opening date on, each converted from the currency it
 * was paid in.
 */
export function accountBalance(account: MoneyAccount, ledger: LedgerEntry[], rates?: Rates): number {
  let bal = account.opening;
  for (const e of ledger) {
    if (accountIdOf(e) !== account.id || e.date < account.openingDate) continue;
    const inBase = toBase(Math.abs(Number(e.amount) || 0), e.currency, rates);
    const inAccount = fromBase(inBase, account.currency, rates);
    bal += e.kind === "income" ? inAccount : -inAccount;
  }
  return Math.round(bal * 100) / 100;
}

/** Every account together, in dinars. */
export function totalBalance(accounts: MoneyAccount[], ledger: LedgerEntry[], rates?: Rates): number {
  return Math.round(
    accounts.reduce((a, acc) => a + toBase(accountBalance(acc, ledger, rates), acc.currency, rates), 0) * 100,
  ) / 100;
}

/** A month's flows for one account (or all), in dinars. */
export function monthFlows(ledger: LedgerEntry[], month: string, rates?: Rates, accountId?: string) {
  let income = 0;
  let spend = 0;
  for (const e of ledger) {
    if (monthOf(e.date) !== month || (accountId && accountIdOf(e) !== accountId)) continue;
    const v = toBase(Math.abs(Number(e.amount) || 0), e.currency, rates);
    if (e.kind === "income") income += v;
    else if (e.kind === "spend") spend += v;
  }
  return { income: Math.round(income), spend: Math.round(spend) };
}

export interface BudgetRow {
  category: MoneyCategory;
  spent: number;
  budget: number;
  /** 0–1+, null without a budget. */
  used: number | null;
  tone: "ok" | "warn" | "over";
}

export function toneOf(used: number | null): BudgetRow["tone"] {
  if (used == null) return "ok";
  if (used > 1) return "over";
  return used >= 0.8 ? "warn" : "ok";
}

/** Spending per category for a month, with each budget, biggest first. */
export function budgetRows(
  ledger: LedgerEntry[], month: string, cats: MoneyCategory[], budgets: Record<string, number> | undefined, rates?: Rates,
): BudgetRow[] {
  const spent = new Map<string, number>();
  for (const e of ledger) {
    if (e.kind !== "spend" || monthOf(e.date) !== month) continue;
    const name = categoryOf(cats, e.category).name;
    spent.set(name, (spent.get(name) ?? 0) + toBase(Math.abs(Number(e.amount) || 0), e.currency, rates));
  }
  const rows: BudgetRow[] = [];
  for (const c of cats) {
    if (c.kind !== "spend") continue;
    const s = Math.round(spent.get(c.name) ?? 0);
    const b = budgets?.[c.name] ?? 0;
    if (!s && !(b > 0)) continue;
    const used = b > 0 ? s / b : null;
    rows.push({ category: c, spent: s, budget: b, used, tone: toneOf(used) });
  }
  return rows.sort((a, b) => b.spent - a.spent || b.budget - a.budget);
}

/** What has been put into a savings goal, in dinars. */
export function goalSaved(goal: SavingsGoal, ledger: LedgerEntry[], rates?: Rates): number {
  let s = 0;
  for (const e of ledger) {
    if (e.kind === "save" && e.goalId === goal.id) s += toBase(Math.abs(Number(e.amount) || 0), e.currency, rates);
  }
  return Math.round(s);
}

/** Spending per day of a month, in dinars: index 0 is the 1st. */
export function dailySpend(ledger: LedgerEntry[], month: string, rates?: Rates): number[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y ?? 2000, m ?? 1, 0).getDate();
  const out = new Array<number>(days).fill(0);
  for (const e of ledger) {
    if (e.kind !== "spend" || monthOf(e.date) !== month) continue;
    const d = Number(e.date.slice(8, 10)) - 1;
    if (d >= 0 && d < days) out[d]! += toBase(Math.abs(Number(e.amount) || 0), e.currency, rates);
  }
  return out.map((v) => Math.round(v));
}

/** "12 480 DA", "€85.50", "$1,200". */
export function formatMoney(amount: number, currency: MoneyCurrency = BASE, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(amount);
  const digits = currency === BASE ? 0 : 2;
  const num = abs.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = opts.sign ? (amount < 0 ? "−" : "+") : amount < 0 ? "−" : "";
  return currency === BASE ? `${sign}${num} DA` : `${sign}${SYMBOL[currency]}${num}`;
}

export const ratesOf = (settings: Settings): Rates => ({ ...DEFAULT_RATES, ...(settings.moneyRates ?? {}) });
export const colorsOf = (settings: Settings) => ({ ...MONEY_COLORS, ...(settings.moneyColors ?? {}) });
