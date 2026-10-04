/** Money maths for the workstation that the phone pages do not need. */

import { toBase, type Rates } from "../lib/money.ts";
import type { Project } from "../lib/projects.ts";
import type { LedgerEntry } from "../lib/types.ts";

export type KindFilter = "all" | "spend" | "income" | "save";

export function filterLedger(
  ledger: LedgerEntry[],
  o: { month?: string; kind?: KindFilter; accountId?: string; projectId?: string; q?: string },
): LedgerEntry[] {
  const q = o.q?.trim().toLowerCase();
  return ledger
    .filter(
      (e) =>
        (!o.month || e.date.startsWith(o.month)) &&
        (!o.kind || o.kind === "all" || e.kind === o.kind) &&
        (!o.accountId || (e.accountId || "main") === o.accountId) &&
        (!o.projectId || e.projectId === o.projectId) &&
        (!q || e.category.toLowerCase().includes(q) || (e.note ?? "").toLowerCase().includes(q)),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface ClientMoney {
  client: string;
  income: number;
  cost: number;
  net: number;
}

/** Income and costs per client, through the projects entries are tagged with, in base currency. */
export function byClient(ledger: LedgerEntry[], projects: Project[], rates?: Rates, month?: string): ClientMoney[] {
  const clientOf = new Map(projects.map((p) => [p.id, p.client?.trim() || p.name]));
  const out = new Map<string, ClientMoney>();
  for (const e of ledger) {
    if (!e.projectId || (month && !e.date.startsWith(month))) continue;
    const c = clientOf.get(e.projectId);
    if (!c) continue;
    const row = out.get(c) ?? { client: c, income: 0, cost: 0, net: 0 };
    const v = toBase(Math.abs(Number(e.amount) || 0), e.currency, rates);
    if (e.kind === "income") row.income += v;
    else if (e.kind === "spend") row.cost += v;
    row.net = row.income - row.cost;
    out.set(c, row);
  }
  return [...out.values()]
    .map((r) => ({ ...r, income: Math.round(r.income), cost: Math.round(r.cost), net: Math.round(r.net) }))
    .sort((a, b) => b.income - a.income || a.client.localeCompare(b.client));
}
