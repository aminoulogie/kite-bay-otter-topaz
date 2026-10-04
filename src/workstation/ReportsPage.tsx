import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, Printer } from "lucide-react";
import { formatMoney, ratesOf } from "@/lib/money-model";
import { progress, stepsOf } from "@/lib/projects";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { buildXlsx } from "@/lib/xlsx";
import { clientsOf } from "./metrics";
import { buildReport, reportSheets, type ReportData } from "./report";

type Period = "month" | "last" | "quarter" | "year" | "all" | "custom";

function range(
  p: Period,
  today: string,
  custom: { from: string; to: string },
): { from?: string; to?: string; label: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const key = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const last = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();
  const name = (yy: number, mm: number) =>
    new Date(yy, mm - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  switch (p) {
    case "month":
      return { from: key(y, m, 1), to: key(y, m, last(y, m)), label: name(y, m) };
    case "last": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: key(ly, lm, 1), to: key(ly, lm, last(ly, lm)), label: name(ly, lm) };
    }
    case "quarter": {
      const q = Math.floor((m - 1) / 3);
      return {
        from: key(y, q * 3 + 1, 1),
        to: key(y, q * 3 + 3, last(y, q * 3 + 3)),
        label: `Q${q + 1} ${y}`,
      };
    }
    case "year":
      return { from: key(y, 1, 1), to: key(y, 12, 31), label: String(y) };
    case "all":
      return { label: "All time" };
    case "custom":
      return {
        from: custom.from || undefined,
        to: custom.to || undefined,
        label: `${custom.from || "…"} to ${custom.to || "…"}`,
      };
  }
}

/**
 * Client reports: pick a client or project and a period, read it here, and
 * save it as a PDF (through the print dialog) or an Excel workbook.
 */
export function ReportsPage() {
  const projects = useSoma((s) => s.projects);
  const timeEntries = useSoma((s) => s.timeEntries);
  const ledger = useSoma((s) => s.ledger);
  const findings = useSoma((s) => s.findings);
  const settings = useSoma((s) => s.settings);
  const today = getLocalDateKey();
  const clients = useMemo(() => clientsOf(projects), [projects]);
  const [client, setClient] = useState("");
  const [projectId, setProjectId] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState({ from: "", to: today });
  const [printing, setPrinting] = useState(false);

  const r = range(period, today, custom);
  const report = useMemo(
    () =>
      buildReport(
        { client, projectId: projectId || undefined, from: r.from, to: r.to },
        { projects, timeEntries, ledger, findings, rates: ratesOf(settings) },
      ),
    [client, projectId, r.from, r.to, projects, timeEntries, ledger, findings, settings],
  );
  const scoped = projects.filter((p) => !client || p.client?.trim() === client);
  const fileBase = `report-${(report.title || "all").replace(/[^\w-]+/g, "-").toLowerCase()}-${r.label.replace(/[^\w-]+/g, "-").toLowerCase()}`;

  const toExcel = () => {
    const bytes = buildXlsx(reportSheets(report, r.label));
    const blob = new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const toPdf = () => {
    setPrinting(true);
    const prev = document.title;
    document.title = fileBase;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        document.title = prev;
        setPrinting(false);
      }),
    );
  };

  return (
    <div className="ws-page" style={{ maxWidth: "none" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ marginRight: 6 }}>Reports</h1>
        <select
          className="ws-input"
          value={client}
          onChange={(e) => {
            setClient(e.target.value);
            setProjectId("");
          }}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="ws-input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All their projects</option>
          {scoped.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="ws-seg">
          {(
            [
              ["month", "This month"],
              ["last", "Last month"],
              ["quarter", "Quarter"],
              ["year", "Year"],
              ["all", "All time"],
              ["custom", "Custom"],
            ] as [Period, string][]
          ).map(([id, l]) => (
            <button
              key={id}
              type="button"
              aria-pressed={period === id}
              onClick={() => setPeriod(id)}
            >
              {l}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <>
            <input
              type="date"
              className="ws-input"
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
            <input
              type="date"
              className="ws-input"
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="ws-btn" onClick={toExcel}>
            <FileSpreadsheet /> Excel
          </button>
          <button type="button" className="ws-btn primary" onClick={toPdf}>
            <Printer /> Save as PDF
          </button>
        </div>
      </div>

      <div className="ws-paper-wrap">
        <ReportDoc report={report} period={r.label} />
      </div>
      {printing &&
        createPortal(
          <div className="ws-print-root">
            <ReportDoc report={report} period={r.label} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function ReportDoc({ report: r, period }: { report: ReportData; period: string }) {
  const s = r.summary;
  const money = (n: number) => formatMoney(n);
  return (
    <article className="ws-paper">
      <header className="ws-paper-head">
        <div>
          <div className="kicker">Client report</div>
          <h2>{r.title}</h2>
          <div className="muted">{period}</div>
        </div>
        <div className="muted" style={{ textAlign: "right" }}>
          Prepared{" "}
          {new Date().toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          <br />
          SOMA
        </div>
      </header>

      <div className="ws-paper-kpis">
        <div>
          <span>Hours</span>
          <b>{s.hours.toFixed(2)}</b>
          <small>{s.billableHours.toFixed(2)} billable</small>
        </div>
        <div>
          <span>Billable value</span>
          <b>{money(s.billableValue)}</b>
          <small>at agreed rates</small>
        </div>
        <div>
          <span>Revenue</span>
          <b>{money(s.revenue)}</b>
          <small>received</small>
        </div>
        <div>
          <span>Costs</span>
          <b>{money(s.costs)}</b>
          <small>net {formatMoney(s.net, "DZD", { sign: true })}</small>
        </div>
        <div>
          <span>Progress</span>
          <b>{s.stepsTotal ? Math.round((s.stepsDone / s.stepsTotal) * 100) : 0}%</b>
          <small>
            {s.stepsDone} of {s.stepsTotal} steps
          </small>
        </div>
      </div>

      <h3>Projects</h3>
      {r.projects.length ? (
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {r.projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.client ?? "—"}</td>
                <td style={{ textTransform: "capitalize" }}>{p.status}</td>
                <td>
                  {Math.round(progress(p) * 100)}% ({stepsOf(p).filter((x) => x.done).length}/
                  {stepsOf(p).length})
                </td>
                <td>{p.due ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No projects.</p>
      )}

      <h3>Time</h3>
      {r.time.length ? (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Work</th>
              <th className="num">Hours</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {r.time.map((t, i) => (
              <tr key={i}>
                <td>{t.date}</td>
                <td>{t.project}</td>
                <td>
                  {t.note || "—"}
                  {!t.billable && <em> (not billed)</em>}
                </td>
                <td className="num">{t.hours.toFixed(2)}</td>
                <td className="num">{t.value ? money(t.value) : "—"}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={3}>Total</td>
              <td className="num">{s.hours.toFixed(2)}</td>
              <td className="num">{money(s.billableValue)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="muted">No time logged in this period.</p>
      )}

      <h3>Money</h3>
      {r.money.length ? (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Type</th>
              <th>Category</th>
              <th>Note</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {r.money.map((m, i) => (
              <tr key={i}>
                <td>{m.date}</td>
                <td>{m.project}</td>
                <td style={{ textTransform: "capitalize" }}>
                  {m.kind === "spend" ? "Cost" : m.kind}
                </td>
                <td>{m.category}</td>
                <td>{m.note || "—"}</td>
                <td className="num">
                  {m.kind === "income" ? "" : "−"}
                  {money(m.amount)}
                </td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={5}>Net</td>
              <td className="num">{formatMoney(s.net, "DZD", { sign: true })}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="muted">No transactions tagged to these projects in this period.</p>
      )}

      <h3>Findings</h3>
      {r.findings.length ? (
        <div className="ws-paper-findings">
          {r.findings.map((f) => (
            <div key={f.id} className="finding">
              <div className="row">
                <span className={`sev ${f.severity}`}>{f.severity}</span>
                <b>{f.title}</b>
                <span className="muted" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {f.status === "in-progress"
                    ? "In progress"
                    : f.status === "accepted"
                      ? "Risk accepted"
                      : f.status[0]!.toUpperCase() + f.status.slice(1)}
                </span>
              </div>
              <div className="muted">
                {f.project}
                {f.area ? ` · ${f.area}` : ""}
                {f.owner ? ` · Owner: ${f.owner}` : ""}
                {f.due ? ` · Due ${f.due}` : ""}
              </div>
              {f.description && (
                <p>
                  <b>Finding.</b> {f.description}
                </p>
              )}
              {f.recommendation && (
                <p>
                  <b>Recommendation.</b> {f.recommendation}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No findings.</p>
      )}

      {r.openSteps.length > 0 && (
        <>
          <h3>Next steps</h3>
          <ul>
            {r.openSteps.map((o, i) => (
              <li key={i}>
                <b>{o.project}:</b> {o.step}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
