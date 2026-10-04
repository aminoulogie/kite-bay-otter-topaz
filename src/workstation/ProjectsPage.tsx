import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Play, Plus, Rows3, Square, Trash2, X } from "lucide-react";
import { formatMoney } from "@/lib/money-model";
import { clock, durationMs, hours, running } from "@/lib/time-tracking";
import { mondayOf } from "@/lib/todos";
import { useTick } from "./tick";
import { toast } from "sonner";
import {
  PROJECT_COLORS,
  daysLeft,
  doneCount,
  isStale,
  nextStep,
  progress,
  stepsOf,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
} from "@/lib/projects";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { clientsOf } from "./metrics";

type View = "table" | "board";
type SortKey = "name" | "client" | "status" | "priority" | "progress" | "due" | "activity";
const STATUS: ProjectStatus[] = ["active", "paused", "done"];
const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
};
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function dueText(p: Project, today: string): { text: string; cls: string } {
  const d = daysLeft(p, today);
  if (d === null) return { text: "—", cls: "ws-faint" };
  const date = new Date(`${p.due}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  if (p.status === "done") return { text: date, cls: "ws-faint" };
  if (d < 0) return { text: `${date} · ${-d}d late`, cls: "ws-red" };
  if (d <= 3) return { text: `${date} · ${d === 0 ? "today" : `${d}d`}`, cls: "ws-amber" };
  return { text: date, cls: "ws-num" };
}

function lastMoved(p: Project): string {
  const t = Number(p.touchedAt ?? p.createdAt);
  if (!Number.isFinite(t)) return "—";
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * Projects at a desk: a sortable table or a board, filtered by status and
 * client, with the selected project open in a panel on the right.
 */
export function ProjectsPage({
  openId,
  onOpen,
}: {
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const projects = useSoma((s) => s.projects);
  const addProject = useSoma((s) => s.addProject);
  const patchProject = useSoma((s) => s.patchProject);
  const today = getLocalDateKey();

  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem("soma-ws-projects-view") as View) || "table";
    } catch {
      return "table";
    }
  });
  const [status, setStatus] = useState<ProjectStatus | "all">("active");
  const [client, setClient] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const [draft, setDraft] = useState("");
  const clients = useMemo(() => clientsOf(projects), [projects]);

  useEffect(() => {
    try {
      localStorage.setItem("soma-ws-projects-view", view);
    } catch {
      /* per-device convenience */
    }
  }, [view]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter(
      (p) =>
        (status === "all" || view === "board" || p.status === status) &&
        (!client || p.client?.trim() === client) &&
        (!needle ||
          p.name.toLowerCase().includes(needle) ||
          (p.client ?? "").toLowerCase().includes(needle)),
    );
  }, [projects, status, client, q, view]);

  const sorted = useMemo(() => {
    const val = (p: Project): string | number => {
      switch (sort.key) {
        case "name":
          return p.name.toLowerCase();
        case "client":
          return (p.client ?? "~").toLowerCase();
        case "status":
          return STATUS.indexOf(p.status);
        case "priority":
          return PRIO_RANK[p.priority ?? ""] ?? 3;
        case "progress":
          return progress(p);
        case "due":
          return daysLeft(p, today) ?? 99999;
        case "activity":
          return -Number(p.touchedAt ?? p.createdAt ?? 0);
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [filtered, sort, today]);

  // Arrow keys move through the table, Enter opens, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "Escape") onOpen(null);
      if (view !== "table" || !sorted.length) return;
      const i = sorted.findIndex((p) => p.id === openId);
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        onOpen(sorted[Math.min(sorted.length - 1, i + 1)]!.id);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        onOpen(sorted[Math.max(0, i - 1)]!.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sorted, openId, onOpen, view]);

  const create = () => {
    const name = draft.trim();
    if (!name) return;
    const id = addProject(name, PROJECT_COLORS[projects.length % PROJECT_COLORS.length]!);
    if (client) patchProject(id, { client });
    setDraft("");
    onOpen(id);
  };

  const th = (key: SortKey, label: string) => (
    <th
      className="sort"
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
    >
      {label} {sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : ""}
    </th>
  );

  const open = projects.find((p) => p.id === openId) ?? null;

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
            <h1 style={{ marginRight: 8 }}>Projects</h1>
            <div className="ws-seg">
              <button
                type="button"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <Rows3 /> Table
              </button>
              <button
                type="button"
                aria-pressed={view === "board"}
                onClick={() => setView("board")}
              >
                <Columns3 /> Board
              </button>
            </div>
            {view === "table" && (
              <div className="ws-seg">
                {(["all", ...STATUS] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={status === s}
                    onClick={() => setStatus(s)}
                  >
                    {s === "all" ? "All" : STATUS_LABEL[s]}
                    <span className="ws-faint">
                      {s === "all"
                        ? projects.length
                        : projects.filter((p) => p.status === s).length}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <select className="ws-input" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className="ws-input"
              placeholder="Filter…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 180 }}
            />
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <input
                className="ws-input"
                placeholder="New project name…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                style={{ width: 220 }}
              />
              <button
                type="button"
                className="ws-btn primary"
                onClick={create}
                disabled={!draft.trim()}
              >
                <Plus /> Add
              </button>
            </div>
          </div>

          {view === "table" ? (
            <div className="ws-card" style={{ overflow: "hidden" }}>
              {sorted.length ? (
                <table className="ws-table">
                  <thead>
                    <tr>
                      {th("name", "Project")}
                      {th("client", "Client")}
                      {th("status", "Status")}
                      {th("priority", "Priority")}
                      {th("progress", "Progress")}
                      <th>Next step</th>
                      {th("due", "Due")}
                      {th("activity", "Last moved")}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((p) => {
                      const due = dueText(p, today);
                      const steps = stepsOf(p).length;
                      const late = p.status === "active" && (daysLeft(p, today) ?? 0) < 0;
                      return (
                        <tr
                          key={p.id}
                          aria-selected={p.id === openId}
                          onClick={() => onOpen(p.id === openId ? null : p.id)}
                        >
                          <td style={{ fontWeight: 600 }}>
                            <span className="ws-swatch" style={{ background: p.color }} />
                            {p.name}
                          </td>
                          <td className={p.client ? "" : "ws-faint"}>{p.client || "—"}</td>
                          <td>
                            <span
                              className={`ws-pill ${late ? "overdue" : isStale(p) ? "stale" : p.status}`}
                            >
                              {late ? "Overdue" : isStale(p) ? "Drifting" : STATUS_LABEL[p.status]}
                            </span>
                          </td>
                          <td>
                            {p.priority ? (
                              <span className={`ws-pill ${p.priority}`}>
                                {p.priority[0]!.toUpperCase() + p.priority.slice(1)}
                              </span>
                            ) : (
                              <span className="ws-faint">—</span>
                            )}
                          </td>
                          <td>
                            <span className="ws-bar">
                              <i style={{ width: `${Math.round(progress(p) * 100)}%` }} />
                            </span>
                            <span className="ws-num">
                              {doneCount(p)}/{steps}
                            </span>
                          </td>
                          <td className="ws-muted">
                            {nextStep(p)?.label ?? (steps ? "All done" : "No steps yet")}
                          </td>
                          <td className={due.cls}>{due.text}</td>
                          <td className="ws-faint">{lastMoved(p)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="ws-empty">
                  {projects.length
                    ? "Nothing matches these filters."
                    : "No projects yet — type a name in the box above and press Enter."}
                </p>
              )}
            </div>
          ) : (
            <Board projects={filtered} openId={openId} onOpen={onOpen} today={today} />
          )}
        </div>
      </div>
      {open && (
        <Detail key={open.id} project={open} clients={clients} onClose={() => onOpen(null)} />
      )}
    </div>
  );
}

function Board({
  projects,
  openId,
  onOpen,
  today,
}: {
  projects: Project[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  today: string;
}) {
  const patchProject = useSoma((s) => s.patchProject);
  const [over, setOver] = useState<ProjectStatus | null>(null);
  return (
    <div className="ws-board">
      {STATUS.map((s) => {
        const col = projects.filter((p) => p.status === s);
        return (
          <div
            key={s}
            className={`ws-col ${over === s ? "drop" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) patchProject(id, { status: s });
            }}
          >
            <header>
              <span className={`ws-pill ${s}`}>{STATUS_LABEL[s]}</span>
              <small>{col.length}</small>
            </header>
            <div className="ws-col-body">
              {col.map((p) => {
                const due = dueText(p, today);
                return (
                  <div
                    key={p.id}
                    className="ws-tile"
                    draggable
                    aria-selected={p.id === openId}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                    onClick={() => onOpen(p.id)}
                  >
                    <div className="name">
                      <span className="ws-swatch" style={{ background: p.color }} />
                      {p.name}
                    </div>
                    {p.client && <div className="ws-faint">{p.client}</div>}
                    <div className="meta">
                      <span className="ws-bar" style={{ width: 70 }}>
                        <i style={{ width: `${Math.round(progress(p) * 100)}%` }} />
                      </span>
                      {doneCount(p)}/{stepsOf(p).length}
                      {p.due && (
                        <span className={due.cls} style={{ marginLeft: "auto" }}>
                          {due.text}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!col.length && (
                <p className="ws-faint" style={{ padding: "6px 2px" }}>
                  Drop a project here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Detail({
  project: p,
  clients,
  onClose,
}: {
  project: Project;
  clients: string[];
  onClose: () => void;
}) {
  const patchProject = useSoma((s) => s.patchProject);
  const removeProject = useSoma((s) => s.removeProject);
  const restoreProject = useSoma((s) => s.restoreProject);
  const addProjectStep = useSoma((s) => s.addProjectStep);
  const setProjectStep = useSoma((s) => s.setProjectStep);
  const renameProjectStep = useSoma((s) => s.renameProjectStep);
  const moveProjectStep = useSoma((s) => s.moveProjectStep);
  const removeProjectStep = useSoma((s) => s.removeProjectStep);
  const [name, setName] = useState(p.name);
  const [note, setNote] = useState(p.note ?? "");
  const [stepDraft, setStepDraft] = useState("");
  const steps = stepsOf(p);

  const remove = () => {
    const all = useSoma.getState().projects;
    const idx = all.findIndex((x) => x.id === p.id);
    removeProject(p.id);
    onClose();
    toast.success(`Deleted “${p.name}”`, {
      action: { label: "Undo", onClick: () => restoreProject(idx, p) },
    });
  };

  return (
    <aside className="ws-detail">
      <header>
        <span className="ws-swatch" style={{ background: p.color }} />
        <span className="ws-muted" style={{ flex: 1 }}>
          {Math.round(progress(p) * 100)}% · {doneCount(p)} of {steps.length} steps
        </span>
        <button type="button" className="ws-icon" onClick={onClose} title="Close (Esc)">
          <X />
        </button>
      </header>
      <section>
        <input
          className="ws-title-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() =>
            name.trim() && name.trim() !== p.name && patchProject(p.id, { name: name.trim() })
          }
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <label className="ws-field">
          <span>Client</span>
          <input
            className="ws-input"
            list="ws-clients"
            defaultValue={p.client ?? ""}
            placeholder="Business or client"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (p.client ?? "")) patchProject(p.id, { client: v || undefined });
            }}
          />
          <datalist id="ws-clients">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <div className="ws-field">
          <span>Status</span>
          <div className="ws-seg">
            {STATUS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={p.status === s}
                onClick={() => patchProject(p.id, { status: s })}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="ws-field">
          <span>Priority</span>
          <div className="ws-seg">
            {(["high", "medium", "low"] as ProjectPriority[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={p.priority === v}
                onClick={() => patchProject(p.id, { priority: p.priority === v ? undefined : v })}
              >
                {v[0]!.toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="ws-field">
          <span>Due</span>
          <input
            type="date"
            className="ws-input"
            value={p.due ?? ""}
            onChange={(e) => patchProject(p.id, { due: e.target.value || undefined })}
          />
        </label>
        <div className="ws-field">
          <span>Colour</span>
          <div style={{ display: "flex", gap: 5 }}>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => patchProject(p.id, { color: c })}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  background: c,
                  border: c === p.color ? "2px solid var(--ws-text)" : "0",
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Steps</div>
        {steps.map((s, i) => (
          <div key={s.id} className={`ws-step ${s.done ? "done" : ""}`}>
            <input
              type="checkbox"
              checked={s.done}
              onChange={(e) => setProjectStep(p.id, s.id, e.target.checked)}
            />
            <input
              className="lbl"
              defaultValue={s.label}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value.trim() !== s.label &&
                renameProjectStep(p.id, s.id, e.target.value.trim())
              }
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <span className="tools">
              <button
                type="button"
                className="ws-icon"
                disabled={i === 0}
                onClick={() => moveProjectStep(p.id, s.id, -1)}
                title="Move up"
              >
                <ArrowUp />
              </button>
              <button
                type="button"
                className="ws-icon"
                disabled={i === steps.length - 1}
                onClick={() => moveProjectStep(p.id, s.id, 1)}
                title="Move down"
              >
                <ArrowDown />
              </button>
              <button
                type="button"
                className="ws-icon"
                onClick={() => removeProjectStep(p.id, s.id)}
                title="Delete step"
              >
                <Trash2 />
              </button>
            </span>
          </div>
        ))}
        <input
          className="ws-input"
          style={{ width: "100%", marginTop: 6 }}
          placeholder="Add a step and press Enter"
          value={stepDraft}
          onChange={(e) => setStepDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && stepDraft.trim()) {
              addProjectStep(p.id, stepDraft.trim());
              setStepDraft("");
            }
          }}
        />
      </section>

      <ProjectTime project={p} />

      <section>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Notes</div>
        <textarea
          className="ws-textarea"
          value={note}
          placeholder="Scope, contacts, findings, links…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (p.note ?? "") && patchProject(p.id, { note })}
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
        <span className="ws-faint">Created {new Date(p.createdAt).toLocaleDateString()}</span>
        <button type="button" className="ws-btn ghost danger" onClick={remove}>
          <Trash2 /> Delete project
        </button>
      </section>
    </aside>
  );
}

function ProjectTime({ project: p }: { project: Project }) {
  const entries = useSoma((s) => s.timeEntries);
  const startTimer = useSoma((s) => s.startTimer);
  const stopTimer = useSoma((s) => s.stopTimer);
  const patchProject = useSoma((s) => s.patchProject);
  const live = running(entries);
  const mine = entries.filter((e) => e.projectId === p.id);
  const isLive = live?.projectId === p.id;
  const now = useTick(isLive);
  const total = mine.reduce((a, e) => a + durationMs(e, now), 0);
  const monday = mondayOf(getLocalDateKey());
  const week = mine
    .filter((e) => getLocalDateKey(new Date(e.start)) >= monday)
    .reduce((a, e) => a + durationMs(e, now), 0);
  const billableMs = mine
    .filter((e) => e.billable !== false)
    .reduce((a, e) => a + durationMs(e, now), 0);
  const value = p.rate ? Math.round((billableMs / 3600_000) * p.rate) : 0;
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>Time</span>
        {isLive ? (
          <button
            type="button"
            className="ws-timer on"
            style={{ marginLeft: "auto" }}
            onClick={stopTimer}
          >
            <span className="ws-rec" />
            <b>{clock(durationMs(live!, now))}</b>
            <Square size={12} />
          </button>
        ) : (
          <button
            type="button"
            className="ws-btn"
            style={{ marginLeft: "auto" }}
            onClick={() => startTimer(p.id)}
          >
            <Play /> Start timer
          </button>
        )}
      </div>
      <div className="ws-field">
        <span>Logged</span>
        <span>
          <b>{hours(total)}</b> <span className="ws-faint">· {hours(week)} this week</span>
        </span>
      </div>
      <label className="ws-field">
        <span>Rate / hour</span>
        <input
          className="ws-input"
          inputMode="decimal"
          placeholder="e.g. 5000"
          defaultValue={p.rate ?? ""}
          onBlur={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            patchProject(p.id, { rate: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
        />
      </label>
      {p.rate ? (
        <div className="ws-field">
          <span>Billable</span>
          <span>
            <b style={{ color: "var(--ws-green)" }}>{formatMoney(value)}</b>{" "}
            <span className="ws-faint">for {hours(billableMs)}</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}
