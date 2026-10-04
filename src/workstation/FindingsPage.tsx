import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  FINDING_STATUSES,
  SEVERITIES,
  STATUS_LABEL,
  countBySeverity,
  isClosed,
  sortFindings,
  type Finding,
  type FindingStatus,
  type Severity,
} from "@/lib/findings";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { clientsOf } from "./metrics";

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * The findings log: every issue an engagement turned up, worst and most
 * overdue first, with the fix's owner and deadline.
 */
export function FindingsPage({
  openId,
  onOpen,
}: {
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const findings = useSoma((s) => s.findings);
  const projects = useSoma((s) => s.projects);
  const addFinding = useSoma((s) => s.addFinding);
  const today = getLocalDateKey();
  const clients = useMemo(() => clientsOf(projects), [projects]);
  const [client, setClient] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sev, setSev] = useState<Severity | "">("");
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [draft, setDraft] = useState({ title: "", projectId: "", severity: "medium" as Severity });

  const proj = (id: string) => projects.find((p) => p.id === id);
  const scoped = useMemo(
    () =>
      findings.filter((f) => {
        const p = projects.find((x) => x.id === f.projectId);
        return (
          (!client || p?.client?.trim() === client) && (!projectId || f.projectId === projectId)
        );
      }),
    [findings, projects, client, projectId],
  );
  const rows = useMemo(
    () =>
      sortFindings(
        scoped.filter(
          (f) =>
            (!sev || f.severity === sev) &&
            (state === "all" || (state === "open" ? !isClosed(f) : isClosed(f))),
        ),
      ),
    [scoped, sev, state],
  );
  const counts = countBySeverity(scoped);
  const overdue = scoped.filter((f) => !isClosed(f) && f.due && f.due < today).length;

  const add = () => {
    const title = draft.title.trim();
    const pid = draft.projectId || projectId || projects.find((p) => p.status === "active")?.id;
    if (!title) return;
    if (!pid) return toast.error("Create a project first — every finding belongs to one");
    const id = addFinding({ title, projectId: pid, severity: draft.severity, status: "open" });
    setDraft((d) => ({ ...d, title: "" }));
    onOpen(id);
  };

  const open = findings.find((f) => f.id === openId) ?? null;

  return (
    <div className={`ws-split ${open ? "open" : ""}`}>
      <div className="ws-scroll">
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
            <h1 style={{ marginRight: 6 }}>Findings</h1>
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
              <option value="">All projects</option>
              {projects
                .filter((p) => !client || p.client?.trim() === client)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <div className="ws-seg">
              {(["open", "closed", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={state === s}
                  onClick={() => setState(s)}
                >
                  {cap(s)}
                </button>
              ))}
            </div>
          </div>

          <div className="ws-kpis">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                className={`ws-kpi ws-sev-kpi ${sev === s ? "on" : ""}`}
                onClick={() => setSev(sev === s ? "" : s)}
              >
                <span>
                  <span className={`ws-pill ${s}`}>{SEV_LABEL[s]}</span>
                </span>
                <b>{counts[s]}</b>
                <small>open</small>
              </button>
            ))}
            <div className={`ws-kpi ${overdue ? "bad" : ""}`}>
              <span>Overdue fixes</span>
              <b>{overdue}</b>
              <small>past their due date</small>
            </div>
          </div>

          <div className="ws-card" style={{ overflow: "hidden" }}>
            <div className="ws-addbar">
              <input
                className="ws-input"
                style={{ flex: 1 }}
                placeholder="New finding — e.g. “Bank reconciliations not reviewed monthly”"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
              <select
                className="ws-input"
                value={draft.projectId || projectId}
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
              <select
                className="ws-input"
                value={draft.severity}
                onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEV_LABEL[s]}
                  </option>
                ))}
              </select>
              <button type="button" className="ws-btn primary" onClick={add}>
                <Plus /> Add
              </button>
            </div>
            {rows.length ? (
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Finding</th>
                    <th>Project</th>
                    <th>Area</th>
                    <th>Owner</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const p = proj(f.projectId);
                    const late = !isClosed(f) && f.due && f.due < today;
                    return (
                      <tr
                        key={f.id}
                        aria-selected={f.id === openId}
                        onClick={() => onOpen(f.id === openId ? null : f.id)}
                      >
                        <td>
                          <span className={`ws-pill ${f.severity}`}>{SEV_LABEL[f.severity]}</span>
                        </td>
                        <td
                          style={{
                            fontWeight: 600,
                            maxWidth: 360,
                            textDecoration: isClosed(f) ? "line-through" : undefined,
                            color: isClosed(f) ? "var(--ws-faint)" : undefined,
                          }}
                        >
                          {f.title}
                        </td>
                        <td>
                          {p?.name ?? "—"}
                          {p?.client && <span className="ws-faint"> · {p.client}</span>}
                        </td>
                        <td className="ws-muted">{f.area ?? "—"}</td>
                        <td className="ws-muted">{f.owner ?? "—"}</td>
                        <td className={late ? "ws-red" : "ws-num"}>
                          {f.due
                            ? new Date(`${f.due}T00:00:00`).toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                              })
                            : "—"}
                        </td>
                        <td>
                          <span
                            className={`ws-pill ${f.status === "resolved" ? "done" : f.status === "accepted" ? "paused" : f.status === "in-progress" ? "active" : "stale"}`}
                          >
                            {STATUS_LABEL[f.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="ws-empty">
                {findings.length
                  ? "Nothing matches these filters."
                  : "No findings yet. Log the first one above — it attaches to a project, and so to a client."}
              </p>
            )}
          </div>
        </div>
      </div>
      {open && <FindingDetail key={open.id} finding={open} onClose={() => onOpen(null)} />}
    </div>
  );
}

function FindingDetail({ finding: f, onClose }: { finding: Finding; onClose: () => void }) {
  const projects = useSoma((s) => s.projects);
  const patchFinding = useSoma((s) => s.patchFinding);
  const removeFinding = useSoma((s) => s.removeFinding);
  const restoreFinding = useSoma((s) => s.restoreFinding);
  const [title, setTitle] = useState(f.title);
  const text = (k: "area" | "owner" | "description" | "recommendation") => ({
    defaultValue: f[k] ?? "",
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value.trim();
      if (v !== (f[k] ?? "")) patchFinding(f.id, { [k]: v || undefined });
    },
  });
  const remove = () => {
    const idx = useSoma.getState().findings.findIndex((x) => x.id === f.id);
    removeFinding(f.id);
    onClose();
    toast.success("Finding deleted", {
      action: { label: "Undo", onClick: () => restoreFinding(idx, f) },
    });
  };
  return (
    <aside className="ws-detail">
      <header>
        <span className={`ws-pill ${f.severity}`}>{SEV_LABEL[f.severity]}</span>
        <span className="ws-muted" style={{ flex: 1 }}>
          {STATUS_LABEL[f.status]}
          {f.closedAt ? ` · ${new Date(f.closedAt).toLocaleDateString()}` : ""}
        </span>
        <button type="button" className="ws-icon" onClick={onClose} title="Close (Esc)">
          <X />
        </button>
      </header>
      <section>
        <input
          className="ws-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() =>
            title.trim() && title.trim() !== f.title && patchFinding(f.id, { title: title.trim() })
          }
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <div className="ws-field">
          <span>Severity</span>
          <div className="ws-seg">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={f.severity === s}
                onClick={() => patchFinding(f.id, { severity: s })}
              >
                {SEV_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <label className="ws-field">
          <span>Status</span>
          <select
            className="ws-input"
            value={f.status}
            onChange={(e) => patchFinding(f.id, { status: e.target.value as FindingStatus })}
          >
            {FINDING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="ws-field">
          <span>Project</span>
          <select
            className="ws-input"
            value={f.projectId}
            onChange={(e) => patchFinding(f.id, { projectId: e.target.value })}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.client ? ` · ${p.client}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="ws-field">
          <span>Area</span>
          <input className="ws-input" placeholder="Payroll, access control…" {...text("area")} />
        </label>
        <label className="ws-field">
          <span>Owner</span>
          <input className="ws-input" placeholder="Who fixes it" {...text("owner")} />
        </label>
        <label className="ws-field">
          <span>Due</span>
          <input
            type="date"
            className="ws-input"
            value={f.due ?? ""}
            onChange={(e) => patchFinding(f.id, { due: e.target.value || undefined })}
          />
        </label>
      </section>
      <section>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>What was found</div>
        <textarea
          className="ws-textarea"
          placeholder="Condition, criteria, cause, effect…"
          {...text("description")}
        />
        <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>Recommendation</div>
        <textarea
          className="ws-textarea"
          placeholder="What should be done"
          {...text("recommendation")}
        />
      </section>
      <section
        style={{
          borderBottom: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="ws-faint">Logged {new Date(f.createdAt).toLocaleDateString()}</span>
        <button type="button" className="ws-btn ghost danger" onClick={remove}>
          <Trash2 /> Delete
        </button>
      </section>
    </aside>
  );
}
