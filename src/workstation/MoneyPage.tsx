import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BASE, shiftMonth } from "@/lib/money";
import {
  accountBalance,
  accountsOf,
  budgetRows,
  categoriesOf,
  formatMoney,
  monthFlows,
  ratesOf,
  totalBalance,
} from "@/lib/money-model";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { LedgerEntry, MoneyCurrency } from "@/lib/types";
import { byClient, filterLedger, type KindFilter } from "./money";

const KINDS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "spend", label: "Spending" },
  { id: "income", label: "Income" },
  { id: "save", label: "Savings" },
];

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y!, (mo ?? 1) - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Money at a desk: every transaction in one sortable ledger you can add to and
 * edit in place, with balances, budgets and — for business — revenue and cost
 * per client through the project each entry is tagged with.
 */
export function MoneyPage() {
  const ledger = useSoma((s) => s.ledger);
  const settings = useSoma((s) => s.settings);
  const projects = useSoma((s) => s.projects);
  const addLedger = useSoma((s) => s.addLedger);
  const updateLedger = useSoma((s) => s.updateLedger);
  const removeLedger = useSoma((s) => s.removeLedger);
  const restoreLedger = useSoma((s) => s.restoreLedger);

  const today = getLocalDateKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [kind, setKind] = useState<KindFilter>("all");
  const [accountId, setAccountId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [q, setQ] = useState("");

  const rates = useMemo(() => ratesOf(settings), [settings]);
  const accounts = useMemo(() => accountsOf(settings), [settings]);
  const cats = useMemo(() => categoriesOf(settings, ledger), [settings, ledger]);
  const rows = useMemo(
    () =>
      filterLedger(ledger, {
        month,
        kind,
        accountId: accountId || undefined,
        projectId: projectId || undefined,
        q,
      }),
    [ledger, month, kind, accountId, projectId, q],
  );
  const flows = useMemo(() => monthFlows(ledger, month, rates), [ledger, month, rates]);
  const budgets = useMemo(
    () => budgetRows(ledger, month, cats, settings.categoryBudgets, rates),
    [ledger, month, cats, settings.categoryBudgets, rates],
  );
  const clients = useMemo(
    () => byClient(ledger, projects, rates, month),
    [ledger, projects, rates, month],
  );
  const total = useMemo(() => totalBalance(accounts, ledger, rates), [accounts, ledger, rates]);
  const net = flows.income - flows.spend;

  // The add row.
  const [d, setD] = useState({
    date: today,
    kind: "spend" as LedgerEntry["kind"],
    amount: "",
    category: "",
    note: "",
    accountId: accounts[0]?.id ?? "main",
    projectId: "",
    currency: BASE as MoneyCurrency,
  });
  const add = () => {
    const amount = Number(String(d.amount).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount");
      return;
    }
    const category =
      d.category ||
      cats.find((c) => c.kind === (d.kind === "income" ? "income" : "spend"))?.name ||
      "Other";
    addLedger({
      date: d.date,
      kind: d.kind,
      amount,
      category,
      note: d.note.trim() || undefined,
      accountId: d.accountId === "main" ? undefined : d.accountId,
      currency: d.currency === BASE ? undefined : d.currency,
      projectId: d.projectId || undefined,
    });
    setD((x) => ({ ...x, amount: "", note: "" }));
  };

  const remove = (e: LedgerEntry) => {
    const idx = useSoma.getState().ledger.findIndex((x) => x.id === e.id);
    removeLedger(e.id);
    toast.success("Transaction deleted", {
      action: { label: "Undo", onClick: () => restoreLedger(idx, e) },
    });
  };

  const catColor = (name: string) => cats.find((c) => c.name === name)?.color ?? "var(--ws-faint)";
  const catsFor = (k: LedgerEntry["kind"]) =>
    cats.filter((c) => c.kind === (k === "income" ? "income" : "spend"));
  const activeProjects = projects.filter((p) => p.status !== "done");

  return (
    <div className="ws-page" style={{ maxWidth: "none" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ marginRight: 6 }}>Money</h1>
        <button type="button" className="ws-icon" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft />
        </button>
        <b style={{ minWidth: 120, textAlign: "center" }}>{monthLabel(month)}</b>
        <button type="button" className="ws-icon" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight />
        </button>
        {month !== today.slice(0, 7) && (
          <button
            type="button"
            className="ws-btn ghost"
            onClick={() => setMonth(today.slice(0, 7))}
          >
            This month
          </button>
        )}
      </div>

      <div className="ws-kpis">
        <div className="ws-kpi">
          <span>Total balance</span>
          <b>{formatMoney(total)}</b>
          <small>
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </small>
        </div>
        <div className="ws-kpi">
          <span>Income</span>
          <b style={{ color: "var(--ws-green)" }}>{formatMoney(flows.income)}</b>
          <small>{monthLabel(month)}</small>
        </div>
        <div className="ws-kpi">
          <span>Spending</span>
          <b>{formatMoney(flows.spend)}</b>
          <small>{monthLabel(month)}</small>
        </div>
        <div className={`ws-kpi ${net < 0 ? "bad" : ""}`}>
          <span>Net</span>
          <b style={net >= 0 ? { color: "var(--ws-green)" } : undefined}>
            {formatMoney(net, BASE, { sign: true })}
          </b>
          <small>
            {flows.income > 0
              ? `${Math.round((net / flows.income) * 100)}% kept`
              : "no income logged"}
          </small>
        </div>
      </div>

      <div
        className="ws-grid"
        style={{
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.25fr)",
          alignItems: "start",
          marginBottom: 12,
        }}
      >
        <section className="ws-card">
          <header>Accounts</header>
          <ul className="ws-list">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="click"
                onClick={() => setAccountId(accountId === a.id ? "" : a.id)}
                style={accountId === a.id ? { background: "var(--ws-hover)" } : undefined}
              >
                <span className="ws-swatch" style={{ background: a.color }} />
                <span className="t">{a.name}</span>
                <b className="ws-num" style={{ color: "var(--ws-text)" }}>
                  {formatMoney(accountBalance(a, ledger, rates), a.currency)}
                </b>
              </li>
            ))}
          </ul>
        </section>

        <section className="ws-card">
          <header>
            Budgets <small>{monthLabel(month)}</small>
          </header>
          {budgets.length ? (
            <ul className="ws-list">
              {budgets.slice(0, 10).map((r) => (
                <li key={r.category.name} style={{ display: "block" }}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
                  >
                    <span>
                      <span
                        className="ws-swatch"
                        style={{ background: r.category.color, borderRadius: "50%" }}
                      />
                      {r.category.name}
                    </span>
                    <span
                      className={
                        r.tone === "over" ? "ws-red" : r.tone === "warn" ? "ws-amber" : "ws-num"
                      }
                    >
                      {formatMoney(r.spent)}
                      {r.budget > 0 && <span className="ws-faint"> / {formatMoney(r.budget)}</span>}
                    </span>
                  </div>
                  <span className="ws-bar" style={{ width: "100%", marginRight: 0 }}>
                    <i
                      style={{
                        width: `${Math.min(100, Math.round((r.used ?? (flows.spend ? r.spent / flows.spend : 0)) * 100))}%`,
                        background:
                          r.tone === "over"
                            ? "var(--ws-red)"
                            : r.tone === "warn"
                              ? "var(--ws-amber)"
                              : r.category.color,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-empty">No spending this month.</p>
          )}
        </section>

        <section className="ws-card">
          <header>
            By client <small>{monthLabel(month)}</small>
          </header>
          {clients.length ? (
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                  <th style={{ textAlign: "right" }}>Costs</th>
                  <th style={{ textAlign: "right" }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.client}>
                    <td>{c.client}</td>
                    <td className="ws-num" style={{ textAlign: "right" }}>
                      {formatMoney(c.income)}
                    </td>
                    <td className="ws-num" style={{ textAlign: "right" }}>
                      {formatMoney(c.cost)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: c.net >= 0 ? "var(--ws-green)" : "var(--ws-red)",
                      }}
                    >
                      {formatMoney(c.net, BASE, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ws-empty">
              Tag a transaction with a project to see revenue and costs per client.
            </p>
          )}
        </section>
      </div>

      <section className="ws-card" style={{ overflow: "hidden" }}>
        <header style={{ flexWrap: "wrap", gap: 8 }}>
          Transactions{" "}
          <span className="ws-faint" style={{ fontWeight: 400 }}>
            {rows.length}
          </span>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              fontWeight: 400,
            }}
          >
            <div className="ws-seg">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kind === k.id}
                  onClick={() => setKind(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <select
              className="ws-input"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              className="ws-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client ? `${p.client} · ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="ws-input"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 140 }}
            />
          </div>
        </header>
        <div style={{ overflowX: "auto" }}>
          <table className="ws-table ws-ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Note</th>
                <th>Account</th>
                <th>Project</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr className="ws-addrow">
                <td>
                  <input
                    type="date"
                    className="ws-cell"
                    value={d.date}
                    onChange={(e) => setD({ ...d, date: e.target.value || today })}
                  />
                </td>
                <td>
                  <select
                    className="ws-cell"
                    value={d.kind}
                    onChange={(e) =>
                      setD({ ...d, kind: e.target.value as LedgerEntry["kind"], category: "" })
                    }
                  >
                    <option value="spend">Spend</option>
                    <option value="income">Income</option>
                    <option value="save">Save</option>
                  </select>
                </td>
                <td>
                  <select
                    className="ws-cell"
                    value={d.category}
                    onChange={(e) => setD({ ...d, category: e.target.value })}
                  >
                    <option value="">Category…</option>
                    {catsFor(d.kind).map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="ws-cell"
                    placeholder="Note"
                    value={d.note}
                    onChange={(e) => setD({ ...d, note: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </td>
                <td>
                  <select
                    className="ws-cell"
                    value={d.accountId}
                    onChange={(e) => setD({ ...d, accountId: e.target.value })}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="ws-cell"
                    value={d.projectId}
                    onChange={(e) => setD({ ...d, projectId: e.target.value })}
                  >
                    <option value="">—</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <input
                      className="ws-cell"
                      inputMode="decimal"
                      placeholder="0"
                      style={{ width: 90, textAlign: "right" }}
                      value={d.amount}
                      onChange={(e) => setD({ ...d, amount: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && add()}
                    />
                    <select
                      className="ws-cell"
                      value={d.currency}
                      onChange={(e) => setD({ ...d, currency: e.target.value as MoneyCurrency })}
                    >
                      <option value="DZD">DA</option>
                      <option value="EUR">€</option>
                      <option value="USD">$</option>
                    </select>
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="ws-btn primary"
                    style={{ height: 26, padding: "0 8px" }}
                    onClick={add}
                    title="Add (Enter)"
                  >
                    <Plus />
                  </button>
                </td>
              </tr>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="ws-num">
                    {new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td>
                    <span
                      className={`ws-pill ${e.kind === "income" ? "done" : e.kind === "save" ? "active" : "paused"}`}
                    >
                      {e.kind === "income" ? "Income" : e.kind === "save" ? "Saved" : "Spend"}
                    </span>
                  </td>
                  <td>
                    <span
                      className="ws-swatch"
                      style={{ background: catColor(e.category), borderRadius: "50%" }}
                    />
                    <select
                      className="ws-cell plain"
                      value={e.category}
                      onChange={(ev) => updateLedger(e.id, { category: ev.target.value })}
                    >
                      {!catsFor(e.kind).some((c) => c.name === e.category) && (
                        <option value={e.category}>{e.category}</option>
                      )}
                      {catsFor(e.kind).map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="ws-cell plain"
                      defaultValue={e.note ?? ""}
                      placeholder="—"
                      onBlur={(ev) =>
                        ev.target.value !== (e.note ?? "") &&
                        updateLedger(e.id, { note: ev.target.value || undefined })
                      }
                      onKeyDown={(ev) =>
                        ev.key === "Enter" && (ev.target as HTMLInputElement).blur()
                      }
                    />
                  </td>
                  <td className="ws-muted">
                    {accounts.find((a) => a.id === (e.accountId || "main"))?.name ?? "Main"}
                  </td>
                  <td>
                    <select
                      className="ws-cell plain"
                      value={e.projectId ?? ""}
                      onChange={(ev) =>
                        updateLedger(e.id, { projectId: ev.target.value || undefined })
                      }
                    >
                      <option value="">—</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: e.kind === "income" ? "var(--ws-green)" : undefined,
                    }}
                  >
                    {formatMoney(
                      e.kind === "income" ? Math.abs(e.amount) : -Math.abs(e.amount),
                      e.currency ?? BASE,
                      { sign: true },
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ws-icon"
                      onClick={() => remove(e)}
                      title="Delete"
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="ws-empty">No transactions match. Add one in the top row.</p>
          )}
        </div>
      </section>
    </div>
  );
}
