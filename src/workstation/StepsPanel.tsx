import { useMemo, useState } from "react";
import { Play, Plus, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { stepsOf } from "@/lib/projects";
import { useSoma } from "@/lib/store";
import {
  clock,
  durationMs,
  hours,
  minutesLabel,
  parseEstimate,
  running,
  stepActuals,
} from "@/lib/time-tracking";
import { useTick } from "./tick";

/**
 * A project's steps as a work plan: each with an estimate, the time actually
 * logged against it, a timer that runs on it, and a button that hands it to
 * the entry form. Estimated against actual is the point — it is how the next
 * estimate gets better.
 */
export function StepsPanel({
  onLog,
}: {
  /** Fill the manual entry form with this step. */
  onLog: (projectId: string, stepId: string, label: string) => void;
}) {
  const projects = useSoma((s) => s.projects);
  const entries = useSoma((s) => s.timeEntries);
  const addProjectStep = useSoma((s) => s.addProjectStep);
  const renameProjectStep = useSoma((s) => s.renameProjectStep);
  const setProjectStep = useSoma((s) => s.setProjectStep);
  const setStepEstimate = useSoma((s) => s.setStepEstimate);
  const startTimer = useSoma((s) => s.startTimer);
  const stopTimer = useSoma((s) => s.stopTimer);
  const patchProject = useSoma((s) => s.patchProject);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const active = projects.filter((p) => p.status !== "done");
  const live = running(entries);
  const now = useTick(!!live);
  // The project last worked on, so the panel opens where you left off.
  const recent = useMemo(
    () => [...entries].sort((a, b) => b.start - a.start).find((e) => active.some((p) => p.id === e.projectId))?.projectId,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, projects],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const pid = picked ?? recent ?? active[0]?.id ?? "";
  const project = projects.find((p) => p.id === pid);
  const steps = stepsOf(project);
  const actual = useMemo(() => stepActuals(entries, pid, now), [entries, pid, now]);
  const unassigned = useMemo(
    () => entries.filter((e) => e.projectId === pid && !e.stepId).reduce((a, e) => a + durationMs(e, now), 0),
    [entries, pid, now],
  );

  const [label, setLabel] = useState("");
  const [est, setEst] = useState("");

  const estimated = steps.reduce((a, s) => a + (s.estimateMin ?? 0), 0);
  const logged = [...actual.values()].reduce((a, b) => a + b, 0);
  const remaining = steps
    .filter((s) => !s.done && s.estimateMin)
    .reduce((a, s) => a + Math.max(0, s.estimateMin! * 60_000 - (actual.get(s.id) ?? 0)), 0);

  /** Delete steps, with an Undo that puts the whole list back as it was. */
  const removeSteps = (ids: string[]) => {
    if (!project || !ids.length) return;
    const before = stepsOf(project);
    patchProject(project.id, { steps: before.filter((s) => !ids.includes(s.id)) });
    setSel(new Set());
    setSelecting(false);
    toast.success(`Deleted ${ids.length} step${ids.length === 1 ? "" : "s"}`, {
      action: { label: "Undo", onClick: () => patchProject(project.id, { steps: before }) },
    });
  };
  const toggle = (id: string) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () => {
    const name = label.trim();
    if (!name || !project) return;
    addProjectStep(project.id, name);
    const minutes = parseEstimate(est);
    if (minutes) {
      const fresh = stepsOf(useSoma.getState().projects.find((p) => p.id === project.id));
      const step = fresh[fresh.length - 1];
      if (step) setStepEstimate(project.id, step.id, minutes);
    }
    setLabel("");
    setEst("");
  };

  return (
    <section className="ws-card" style={{ marginBottom: 12 }}>
      <header style={{ flexWrap: "wrap" }}>
        Steps
        <select
          className="ws-cell"
          value={pid}
          onChange={(e) => {
            setPicked(e.target.value);
            setSel(new Set());
            setSelecting(false);
          }}
          style={{ fontWeight: 400 }}
        >
          {!active.length && <option value="">No active projects</option>}
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.client ? ` · ${p.client}` : ""}
            </option>
          ))}
        </select>
        {project && steps.length > 0 && (
          <span style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
            {selecting ? (
              <>
                <button
                  type="button"
                  className="ws-btn ghost"
                  style={{ height: 26 }}
                  onClick={() => setSel(sel.size === steps.length ? new Set() : new Set(steps.map((x) => x.id)))}
                >
                  {sel.size === steps.length ? "Select none" : "Select all"}
                </button>
                <button
                  type="button"
                  className="ws-btn danger"
                  style={{ height: 26 }}
                  disabled={!sel.size}
                  onClick={() => removeSteps([...sel])}
                >
                  <Trash2 /> Delete{sel.size ? ` ${sel.size}` : ""}
                </button>
                <button
                  type="button"
                  className="ws-btn ghost"
                  style={{ height: 26 }}
                  onClick={() => {
                    setSelecting(false);
                    setSel(new Set());
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="ws-btn ghost" style={{ height: 26 }} onClick={() => setSelecting(true)}>
                Select
              </button>
            )}
          </span>
        )}
        {project && (
          <small>
            Estimated <b>{minutesLabel(estimated)}</b> · logged <b>{hours(logged)}</b>
            {remaining > 0 && (
              <>
                {" "}
                · <b>{hours(remaining)}</b> left
              </>
            )}
          </small>
        )}
      </header>
      {project && (
        <div style={{ padding: "4px 14px 10px" }}>
          {steps.map((s) => {
            const ms = actual.get(s.id) ?? 0;
            const pct = s.estimateMin ? ms / (s.estimateMin * 60_000) : 0;
            const tone = pct > 1.25 ? "var(--ws-red)" : pct > 1 ? "var(--ws-amber)" : "var(--ws-green)";
            const isLive = live?.projectId === pid && live.stepId === s.id;
            return (
              <div
                key={s.id}
                className={`ws-steprow ${s.done ? "done" : ""} ${selecting ? "selecting" : ""} ${sel.has(s.id) ? "picked" : ""}`}
                onClick={selecting ? () => toggle(s.id) : undefined}
              >
                {selecting ? (
                  <input
                    type="checkbox"
                    className="pick"
                    checked={sel.has(s.id)}
                    onChange={() => toggle(s.id)}
                    onClick={(e) => e.stopPropagation()}
                    title="Select"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={(e) => setProjectStep(pid, s.id, e.target.checked)}
                    title="Done"
                  />
                )}
                <input
                  className="ws-cell plain lbl"
                  defaultValue={s.label}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value.trim() !== s.label &&
                    renameProjectStep(pid, s.id, e.target.value.trim())
                  }
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <input
                  className="ws-cell plain est"
                  key={`${s.id}-${s.estimateMin ?? ""}`}
                  defaultValue={s.estimateMin ? minutesLabel(s.estimateMin) : ""}
                  placeholder="Estimate"
                  title="Estimate: 45m, 1.5h, 2h 30m"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const m = v ? parseEstimate(v) : undefined;
                    if (m === null) return;
                    if (m !== s.estimateMin) setStepEstimate(pid, s.id, m);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <span className="ws-num act">{ms ? (isLive ? clock(ms) : hours(ms)) : "—"}</span>
                <span className="bar" title={s.estimateMin ? `${Math.round(pct * 100)}% of the estimate` : "No estimate"}>
                  {s.estimateMin ? <i style={{ width: `${Math.min(100, pct * 100)}%`, background: tone }} /> : null}
                </span>
                {isLive ? (
                  <button type="button" className="ws-timer on" onClick={stopTimer} title="Stop">
                    <span className="ws-rec" />
                    <Square size={12} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ws-icon"
                    onClick={() => startTimer(pid, s.label, s.id)}
                    title="Start the timer on this step"
                    disabled={s.done}
                  >
                    <Play />
                  </button>
                )}
                <span className="tools">
                  <button
                    type="button"
                    className="ws-icon"
                    onClick={() => onLog(pid, s.id, s.label)}
                    title="Log time on this step below"
                  >
                    <Plus />
                  </button>
                  <button type="button" className="ws-icon del" onClick={() => removeSteps([s.id])} title="Delete step">
                    <Trash2 />
                  </button>
                </span>
              </div>
            );
          })}
          {!steps.length && <p className="ws-faint" style={{ padding: "8px 0" }}>No steps yet — add the first below.</p>}
          {unassigned > 0 && (
            <p className="ws-faint" style={{ padding: "6px 0 0", fontSize: 12 }}>
              {hours(unassigned)} logged on {project.name} without a step.
            </p>
          )}
          <div className="ws-steprow add">
            <Plus size={14} className="ws-faint" />
            <input
              className="ws-cell plain lbl"
              placeholder="New step — press Enter"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <input
              className="ws-cell plain est"
              placeholder="Estimate"
              value={est}
              onChange={(e) => setEst(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <span />
            <span />
            <span />
            {label.trim() ? (
              <button type="button" className="ws-btn primary" style={{ height: 26, padding: "0 8px" }} onClick={add}>
                Add
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
