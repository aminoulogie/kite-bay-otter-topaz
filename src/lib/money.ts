/**
 * Money, summarised.
 *
 * Kept apart from the view because the same three numbers are wanted in two
 * places — the Money tab and, shortly, the dashboard — and a second copy of
 * "what did this month cost" is a second answer waiting to disagree.
 */

import type { LedgerEntry } from "./types.ts";

export const CATEGORIES = [
  "Food", "Gym", "Transport", "Supplements", "Rent", "Bills",
  "Clothes", "Health", "Fun", "Other",
] as const;

/** The YYYY-MM a date key belongs to. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function inMonth(entries: LedgerEntry[], month: string): LedgerEntry[] {
  return entries.filter((e) => monthOf(e.date) === month);
}

export interface MonthTotals {
  spend: number;
  income: number;
  /** Income minus spend. Negative is overspending, and is meant to look it. */
  net: number;
  byCategory: { category: string; total: number }[];
}

/**
 * Totals for a set of entries.
 *
 * Amounts are stored positive with the direction in `kind`, so nothing here
 * has to guess whether a negative number means a refund or a typo.
 */
export function totals(entries: LedgerEntry[]): MonthTotals {
  let spend = 0;
  let income = 0;
  const cats = new Map<string, number>();
  for (const e of entries) {
    const amount = Math.abs(Number(e.amount) || 0);
    if (e.kind === "income") {
      income += amount;
      continue;
    }
    spend += amount;
    cats.set(e.category || "Other", (cats.get(e.category || "Other") ?? 0) + amount);
  }
  return {
    spend: Math.round(spend * 100) / 100,
    income: Math.round(income * 100) / 100,
    net: Math.round((income - spend) * 100) / 100,
    byCategory: [...cats.entries()]
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total),
  };
}

/**
 * What a training session cost this month.
 *
 * The number that makes a gym membership feel like a decision rather than a
 * direct debit: everything spent on Gym and Supplements, divided by sessions
 * actually trained. Null with no sessions rather than Infinity — a month you
 * did not train has no cost per session, and showing ∞ would be a joke at the
 * user's expense.
 */
export function costPerSession(entries: LedgerEntry[], sessions: number): number | null {
  if (sessions <= 0) return null;
  const training = entries
    .filter((e) => e.kind === "spend" && /gym|supplement/i.test(e.category))
    .reduce((a, e) => a + Math.abs(Number(e.amount) || 0), 0);
  if (!training) return null;
  return Math.round((training / sessions) * 100) / 100;
}

/** A month key shifted by n months, so the picker can walk backwards. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date((y ?? 2000), (m ?? 1) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
