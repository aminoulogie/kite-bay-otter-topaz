import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money-model";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import {
  billable,
  clock,
  dayOf,
  decimalHours,
  durationMs,
  hours,
  running,
  timesheet,
  type TimeEntry,
} from "@/lib/time-tracking";
import { mondayOf } from "@/lib/todos";
import { useTick } from "./tick";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const at = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Where the hours went: a timesheet for the week, every entry editable, and
 * what the billable part is worth at each project's rate.
 */
export function TimePage() {
  const entries = useSoma((s) => s.timeEntries);
  const projects = useSoma((s) => s.projects);
  const addTimeEntry = useSoma((s) => s.addTimeEntry);
  const patchTimeEntry = useSoma((s) => s.patchTimeEntry);
  const removeTimeEntry = useSoma((s) => s.removeTimeEntry);
  const restoreTimeEntry = useSoma((s) => s.restoreTimeEntry);
  const stopTimer = useSoma((s) => s.stopTimer);

  const today = getLocalDateKey();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const live = running(entries);
  const now = useTick(!!live);
  const next = getLocalDateKey(addDays(parseLocalDateKey(monday), 7));
  const sheet = useMemo(() => timesheet(entries, monday, now), [entries, monday, now]);
  const proj = (id: string) => projects.find((p) => p.id === id);
  const money = useMemo(() => {
    const rates = new Map(projects.map((p) => [p.id, p.rate ?? 0]));
    return billable(entries, (id) => rates.get(id) ?? 0, monday, next, now);
  }, [entries, monday, next, now, projects]);
  const weekEntries = useMemo(
    () =>
      entries
        .filter((e) => {
          const d = dayOf(e.start);
          return d >= monday && d < next;
        })
        .sort((a, b) => b.start - a.start),
    [entries, monday, next],
  );
  const value = [...money.values()].reduce((a, r) => a + r.value, 0);
  const billableMs = [...money.values()].reduce((a, r) => a + r.billableMs, 0);

  const [draft, setDraft] = useState({
    date: today,
    from: "09:00",
    to: "10:00",
    projectId: projects.find((p) => p.status === "active")?.id ?? "",
    note: "",
  });
  const addManual = () => {
    if (!draft.projectId) return toast.error("Pick a project");
    const start = at(draft.date, draft.from);
    const end = at(draft.date, draft.to);
    if (!(end > start)) return toast.error("End must be after start");
    addTimeEntry({ projectId: draft.projectId, start, end, note: draft.note.trim() || undefined });
    setDraft((d) => ({ ...d, note: "" }));
  };

  const remove = (e: TimeEntry) => {
    const idx = useSoma.getState().timeEntries.findIndex((x) => x.id === e.id);
    removeTimeEntry(e.id);
    toast.success("Entry deleted", {
      action: { label: "Undo", onClick: () => restoreTimeEntry(idx, e) },
    });
  };

  const exportCsv = () => {
    const rows = [
      ["Date", "Start", "End", "Hours", "Client", "Project", "Note", "Billable", "Rate", "Value"],
    ];
    for (const e of [...weekEntries].reverse()) {
      const p = proj(e.projectId);
      const h = decimalHours(durationMs(e, now));
      const billed = e.billable !== false;
      rows.push([
        dayOf(e.start),
        hm(e.start),
        e.end ? hm(e.end) : "running",
        String(h),
        p?.client ?? "",
        p?.name ?? "",
        e.note ?? "",
        billed ? "yes" : "no",
        String(p?.rate ?? ""),
        billed && p?.rate ? String(Math.round(h * p.rate)) : "",
      ]);
    }
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], {
      type: "text/csv",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timesheet-${monday}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const label = `${parseLocalDateKey(monday).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${parseLocalDateKey(sheet.days[6]!).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

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
        <h1 style={{ marginRight: 6 }}>Time tracking</h1>
        <button
          type="button"
          className="ws-icon"
          onClick={() => setMonday(getLocalDateKey(addDays(parseLocalDateKey(monday), -7)))}
        >
          <ChevronLeft />
        </button>
        <b>{label}</b>
        <button type="button" className="ws-icon" onClick={() => setMonday(next)}>
          <ChevronRight />
        </button>
        {monday !== mondayOf(today) && (
          <button type="button" className="ws-btn ghost" onClick={() => setMonday(mondayOf(today))}>
            This week
          </button>
        )}
        <button
          type="button"
          className="ws-btn"
          style={{ marginLeft: "auto" }}
          onClick={exportCsv}
          disabled={!weekEntries.length}
        >
          <Download /> Export CSV
        </button>
      </div>

      <div className="ws-kpis">
        <div className="ws-kpi">
          <span>Tracked</span>
          <b>{hours(sheet.total)}</b>
          <small>this week</small>
        </div>
        <div className="ws-kpi">
          <span>Billable</span>
          <b>{hours(billableMs)}</b>
          <small>
            {sheet.total ? `${Math.round((billableMs / sheet.total) * 100)}% of tracked` : "—"}
          </small>
        </div>
        <div className="ws-kpi">
          <span>Billable value</span>
          <b style={{ color: "var(--ws-green)" }}>{formatMoney(value)}</b>
          <small>at each project's rate</small>
        </div>
        {live && (
          <div
            className="ws-kpi"
            style={{ borderColor: "color-mix(in srgb, var(--ws-red) 40%, transparent)" }}
          >
            <span>Running now · {proj(live.projectId)?.name}</span>
            <b>{clock(durationMs(live, now))}</b>
            <small>
              <button
                type="button"
                className="ws-btn ghost"
                style={{ height: 22, padding: "0 6px" }}
                onClick={stopTimer}
              >
                <Square /> Stop
              </button>
            </small>
          </div>
        )}
      </div>

      <section className="ws-card" style={{ marginBottom: 12 }}>
        <header>Timesheet</header>
        <table className="ws-table">
          <thead>
            <tr>
              <th>Project</th>
              {sheet.days.map((d, i) => (
                <th
                  key={d}
                  style={{ textAlign: "right", color: d === today ? "var(--ws-text)" : undefined }}
                >
                  {DAY[i]} {parseLocalDateKey(d).getDate()}
                </th>
              ))}
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {[...sheet.rows.entries()].map(([pid, row]) => {
              const p = proj(pid);
              const tot = row.reduce((a, b) => a + b, 0);
              return (
                <tr key={pid}>
                  <td>
                    <span
                      className="ws-swatch"
                      style={{ background: p?.color ?? "var(--ws-faint)" }}
                    />
                    {p?.name ?? "Deleted project"}
                    {p?.client && <span className="ws-faint"> · {p.client}</span>}
                  </td>
                  {row.map((ms, i) => (
                    <td key={i} className="ws-num" style={{ textAlign: "right" }}>
                      {ms ? decimalHours(ms).toFixed(2) : <span className="ws-faint">–</span>}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {decimalHours(tot).toFixed(2)}
                  </td>
                  <td className="ws-num" style={{ textAlign: "right" }}>
                    {money.get(pid)?.value ? formatMoney(money.get(pid)!.value) : "—"}
                  </td>
                </tr>
              );
            })}
            {sheet.rows.size > 0 && (
              <tr>
                <td style={{ fontWeight: 600 }}>Total</td>
                {sheet.dayTotals.map((ms, i) => (
                  <td key={i} style={{ textAlign: "right", fontWeight: 600 }}>
                    {ms ? decimalHours(ms).toFixed(2) : ""}
                  </td>
                ))}
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  {decimalHours(sheet.total).toFixed(2)}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "var(--ws-green)" }}>
                  {value ? formatMoney(value) : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!sheet.rows.size && (
          <p className="ws-empty">
            No time this week. Start the timer from the top bar or a project, or add an entry below.
          </p>
        )}
      </section>

      <section className="ws-card">
        <header>Entries</header>
        <div style={{ padding: "6px 14px 10px" }}>
          <div
            className="ws-entry"
            style={{ borderBottom: "1px solid var(--ws-line-2)", paddingBottom: 8 }}
          >
            <input
              type="date"
              className="ws-cell"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value || today })}
            />
            <span style={{ display: "flex", gap: 4 }}>
              <input
                type="time"
                className="ws-cell"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
              <input
                type="time"
                className="ws-cell"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </span>
            <span className="ws-faint" style={{ textAlign: "right" }}>
              {(() => {
                const ms = at(draft.date, draft.to) - at(draft.date, draft.from);
                return ms > 0 ? hours(ms) : "—";
              })()}
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <select
                className="ws-cell"
                value={draft.projectId}
                onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
              >
                <option value="">Project…</option>
                {projects
                  .filter((p) => p.status !== "done")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <input
                className="ws-cell"
                style={{ flex: 1 }}
                placeholder="What was done"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addManual()}
              />
            </span>
            <span />
            <button
              type="button"
              className="ws-btn primary"
              style={{ height: 26 }}
              onClick={addManual}
            >
              <Plus /> Add
            </button>
          </div>
          {weekEntries.map((e) => {
            const date = dayOf(e.start);
            return (
              <div key={e.id} className="ws-entry">
                <span className="ws-num">
                  {parseLocalDateKey(date).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span style={{ display: "flex", gap: 4 }}>
                  <input
                    type="time"
                    className="ws-cell plain"
                    defaultValue={hm(e.start)}
                    onBlur={(ev) =>
                      ev.target.value && patchTimeEntry(e.id, { start: at(date, ev.target.value) })
                    }
                  />
                  {e.end ? (
                    <input
                      type="time"
                      className="ws-cell plain"
                      defaultValue={hm(e.end)}
                      onBlur={(ev) =>
                        ev.target.value &&
                        at(date, ev.target.value) > e.start &&
                        patchTimeEntry(e.id, { end: at(date, ev.target.value) })
                      }
                    />
                  ) : (
                    <span className="ws-red" style={{ fontSize: 12 }}>
                      running
                    </span>
                  )}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {hours(durationMs(e, now))}
                </span>
                <span style={{ display: "flex", gap: 6, minWidth: 0 }}>
                  <select
                    className="ws-cell plain"
                    value={e.projectId}
                    onChange={(ev) => patchTimeEntry(e.id, { projectId: ev.target.value })}
                  >
                    {!proj(e.projectId) && <option value={e.projectId}>Deleted project</option>}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="ws-cell plain"
                    style={{ flex: 1, minWidth: 0 }}
                    defaultValue={e.note ?? ""}
                    placeholder="—"
                    onBlur={(ev) =>
                      ev.target.value !== (e.note ?? "") &&
                      patchTimeEntry(e.id, { note: ev.target.value || undefined })
                    }
                  />
                </span>
                <label
                  className="ws-faint"
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                  title="Counts towards billing"
                >
                  <input
                    type="checkbox"
                    checked={e.billable !== false}
                    onChange={(ev) =>
                      patchTimeEntry(e.id, { billable: ev.target.checked ? undefined : false })
                    }
                  />
                  Billable
                </label>
                <button type="button" className="ws-icon" onClick={() => remove(e)} title="Delete">
                  <Trash2 />
                </button>
              </div>
            );
          })}
          {!weekEntries.length && (
            <p className="ws-faint" style={{ padding: "10px 0" }}>
              No entries this week.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
