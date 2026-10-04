import { useMemo, useState } from "react";
import { useTick } from "./tick";
import { Play, Square } from "lucide-react";
import { useSoma } from "@/lib/store";
import { clock, durationMs, running } from "@/lib/time-tracking";

/** The running timer in the top bar, or a button to start one. */
export function TopTimer() {
  const entries = useSoma((s) => s.timeEntries);
  const projects = useSoma((s) => s.projects);
  const startTimer = useSoma((s) => s.startTimer);
  const stopTimer = useSoma((s) => s.stopTimer);
  const live = running(entries);
  const now = useTick(!!live);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      projects
        .filter((p) => p.status !== "done")
        .filter(
          (p) =>
            !q.trim() ||
            `${p.name} ${p.client ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
        ),
    [projects, q],
  );

  if (live) {
    const p = projects.find((x) => x.id === live.projectId);
    return (
      <button type="button" className="ws-timer on" onClick={stopTimer} title="Stop the timer">
        <span className="ws-rec" />
        <span className="name">{p?.name ?? "Project"}</span>
        <b>{clock(durationMs(live, now))}</b>
        <Square size={12} />
      </button>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="ws-btn"
        onClick={() => setOpen((o) => !o)}
        title="Start a timer on a project"
      >
        <Play /> Timer
      </button>
      {open && (
        <>
          <div className="ws-pop-bg" onMouseDown={() => setOpen(false)} />
          <div className="ws-menu">
            <input
              autoFocus
              className="ws-input"
              style={{ width: "100%" }}
              placeholder="Which project?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <ul>
              {list.map((p) => (
                <li
                  key={p.id}
                  onMouseDown={() => {
                    startTimer(p.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span className="ws-swatch" style={{ background: p.color }} />
                  {p.name}
                  {p.client && <small>{p.client}</small>}
                </li>
              ))}
              {!list.length && <li className="ws-faint">No active projects</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
