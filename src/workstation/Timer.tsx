import { useMemo, useState } from "react";
import { useTick } from "./tick";
import { Coffee, LogIn, LogOut, Play, Square } from "lucide-react";
import { useSoma } from "@/lib/store";
import { clock, durationMs, running } from "@/lib/time-tracking";
import { onBreak, openShift, workedMs } from "@/lib/worklog";
import { useClients } from "./use-clients";

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

/**
 * The work clock in the top bar: clock in for a client, break, clock out.
 * Clocking out opens the shift so what was done gets written while it's fresh.
 */
export function TopClock({ onOpenShift }: { onOpenShift: (id: string) => void }) {
  const shifts = useSoma((s) => s.shifts);
  const clockIn = useSoma((s) => s.clockIn);
  const clockOut = useSoma((s) => s.clockOut);
  const toggleBreak = useSoma((s) => s.toggleBreak);
  const clients = useClients();
  const live = openShift(shifts);
  const now = useTick(!!live);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  if (live) {
    const paused = onBreak(live);
    return (
      <div className={`ws-clockpill ${paused ? "paused" : ""}`}>
        <button
          type="button"
          className="main"
          onClick={() => onOpenShift(live.id)}
          title="Open this shift"
        >
          <span className="ws-rec" />
          <span className="name">{paused ? "Break" : live.client}</span>
          <b>{clock(workedMs(live, now))}</b>
        </button>
        <button
          type="button"
          onClick={toggleBreak}
          title={paused ? "End the break" : "Take a break"}
        >
          {paused ? <Play size={13} /> : <Coffee size={13} />}
        </button>
        <button
          type="button"
          onClick={() => {
            const id = clockOut();
            if (id) onOpenShift(id);
          }}
          title="Clock out"
        >
          <LogOut size={13} />
        </button>
      </div>
    );
  }
  const list = clients.filter((c) => !q.trim() || c.toLowerCase().includes(q.trim().toLowerCase()));
  const go = (c: string) => {
    clockIn(c);
    setOpen(false);
    setQ("");
  };
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="ws-btn"
        onClick={() => setOpen((o) => !o)}
        title="Clock in for a client"
      >
        <LogIn /> Clock in
      </button>
      {open && (
        <>
          <div className="ws-pop-bg" onMouseDown={() => setOpen(false)} />
          <div className="ws-menu">
            <input
              autoFocus
              className="ws-input"
              style={{ width: "100%" }}
              placeholder="Which client? Type a new one and press Enter"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (list[0] || q.trim())) go(list[0] ?? q.trim());
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <ul>
              {list.map((c) => (
                <li key={c} onMouseDown={() => go(c)}>
                  <LogIn size={13} /> {c}
                </li>
              ))}
              {q.trim() && !clients.includes(q.trim()) && (
                <li onMouseDown={() => go(q.trim())}>
                  <LogIn size={13} /> New client “{q.trim()}”
                </li>
              )}
              {!list.length && !q.trim() && <li className="ws-faint">Type a client name</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
