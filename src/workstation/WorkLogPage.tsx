import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Coffee,
  Download,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money-model";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { clock, decimalHours, hours } from "@/lib/time-tracking";
import { mondayOf } from "@/lib/todos";
import {
  breakMs,
  byClient,
  hhmm,
  newActivityId,
  onBreak,
  openShift,
  shiftDay,
  timeAfter,
  workedMs,
  type Activity,
  type Shift,
} from "@/lib/worklog";
import { useTick } from "./tick";
import { useClients } from "./use-clients";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Hours worked for clients: clock in and out, breaks, and what was done in
 * each shift. Activities name a project; their next step becomes a step on
 * it, and their notes land in its notes feed.
 */
export function WorkLogPage({
  openId,
  onOpen,
}: {
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const shifts = useSoma((s) => s.shifts);
  const rates = useSoma((s) => s.settings.clientRates);
  const patchSettings = useSoma((s) => s.patchSettings);
  const addShift = useSoma((s) => s.addShift);
  const clients = useClients();
  const today = getLocalDateKey();
  const [monday, setMonday] = useState(() => mondayOf(today));
  const live = openShift(shifts);
  const now = useTick(!!live);
  const next = getLocalDateKey(addDays(parseLocalDateKey(monday), 7));
  const sunday = getLocalDateKey(addDays(parseLocalDateKey(monday), 6));

  const week = useMemo(
    () =>
      shifts
        .filter((s) => {
          const d = shiftDay(s);
          return d >= monday && d < next;
        })
        .sort((a, b) => b.start - a.start),
    [shifts, monday, next],
  );
  const perClient = useMemo(
    () => byClient(shifts, monday, sunday, now),
    [shifts, monday, sunday, now],
  );
  const worked = week.reduce((a, s) => a + workedMs(s, now), 0);
  const breaks = week.reduce((a, s) => a + breakMs(s, now), 0);
  const rateOf = (c: string) => rates?.[c] ?? 0;
  const value = [...perClient].reduce((a, [c, r]) => a + (r.ms / 3600_000) * rateOf(c), 0);
  const days = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of week) m.set(shiftDay(s), [...(m.get(shiftDay(s)) ?? []), s]);
    return [...m];
  }, [week]);
  const open = openId ? shifts.find((s) => s.id === openId) : undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) onOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen]);

  const addPast = () => {
    const client = clients[0] ?? "Client";
    const start = timeAfter(today, "09:00")!;
    const id = addShift({
      client,
      start,
      end: timeAfter(today, "17:00")!,
      breaks: [],
      activities: [],
    });
    onOpen(id);
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      [
        "Date",
        "Client",
        "Start",
        "End",
        "Breaks (h)",
        "Worked (h)",
        "Rate",
        "Value",
        "Project",
        "What I did",
        "Next step",
        "Done",
        "Notes",
      ],
    ];
    const projects = useSoma.getState().projects;
    for (const s of [...week].reverse()) {
      const h = decimalHours(workedMs(s, now));
      const base = [
        shiftDay(s),
        s.client,
        hhmm(s.start),
        s.end ? hhmm(s.end) : "running",
        decimalHours(breakMs(s, now)),
        h,
        rateOf(s.client) || "",
        rateOf(s.client) ? Math.round(h * rateOf(s.client)) : "",
      ];
      const acts = s.activities.length ? s.activities : [null];
      acts.forEach((a, i) => {
        const p = a?.projectId ? projects.find((x) => x.id === a.projectId) : undefined;
        rows.push([
          ...(i === 0 ? base : base.map((v, j) => (j < 2 ? v : ""))),
          p?.name ?? "",
          a?.text ?? "",
          a?.nextStep ?? "",
          a ? (a.done ? "yes" : "no") : "",
          a?.notes ?? s.notes ?? "",
        ]);
      });
    }
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], {
      type: "text/csv",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `work-log-${monday}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const label = `${parseLocalDateKey(monday).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${parseLocalDateKey(sunday).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className={`ws-split ${open ? "open" : ""}`}>
      <div className="ws-scroll">
        <div className="ws-page" style={{ maxWidth: "none" }}>
          <div className="ws-pagehead">
            <h1>Work log</h1>
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
              <button
                type="button"
                className="ws-btn ghost"
                onClick={() => setMonday(mondayOf(today))}
              >
                This week
              </button>
            )}
            <span style={{ marginLeft: "auto" }} />
            <button type="button" className="ws-btn" onClick={addPast}>
              <Plus /> Add a past shift
            </button>
            <button type="button" className="ws-btn" onClick={exportCsv} disabled={!week.length}>
              <Download /> Export CSV
            </button>
          </div>

          <div className="ws-kpis">
            <div className="ws-kpi">
              <span>Worked</span>
              <b>{hours(worked)}</b>
              <small>{week.length} shifts this week</small>
            </div>
            <div className="ws-kpi">
              <span>Breaks</span>
              <b>{hours(breaks)}</b>
              <small>not counted as worked</small>
            </div>
            <div className="ws-kpi">
              <span>Owed</span>
              <b style={{ color: "var(--ws-green)" }}>{formatMoney(Math.round(value))}</b>
              <small>at each client's rate</small>
            </div>
            <div className="ws-kpi">
              <span>Activities</span>
              <b>{week.reduce((a, s) => a + s.activities.length, 0)}</b>
              <small>
                {week.reduce((a, s) => a + s.activities.filter((x) => x.done).length, 0)} marked
                done
              </small>
            </div>
          </div>

          <div className="ws-worklog">
            <div className="ws-grid" style={{ alignContent: "start" }}>
              <ClockCard live={live} now={now} clients={clients} onOpen={onOpen} />

              <div className="ws-card">
                <header>
                  Shifts
                  <small>click one to fill in what you did</small>
                </header>
                {!days.length && (
                  <div className="ws-empty">
                    No shifts this week. Clock in above, or add one you forgot.
                  </div>
                )}
                {days.map(([day, list]) => (
                  <div key={day}>
                    <div className="ws-dayhead">
                      {parseLocalDateKey(day).toLocaleDateString(undefined, {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}
                      <span>{hours(list.reduce((a, s) => a + workedMs(s, now), 0))}</span>
                    </div>
                    {list.map((s) => (
                      <ShiftRow
                        key={s.id}
                        s={s}
                        now={now}
                        selected={s.id === openId}
                        onClick={() => onOpen(s.id === openId ? null : s.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="ws-card" style={{ alignSelf: "start" }}>
              <header>
                By client
                <small>rate per hour</small>
              </header>
              {!clients.length && (
                <div className="ws-empty">Clients appear here once you log a shift.</div>
              )}
              <ul className="ws-list">
                {clients.map((c) => {
                  const r = perClient.get(c);
                  return (
                    <li key={c}>
                      <span className="t">
                        <b>{c}</b>
                        <br />
                        <span className="ws-faint">
                          {r
                            ? `${hours(r.ms)} · ${r.shifts} shift${r.shifts === 1 ? "" : "s"}`
                            : "No shifts this week"}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <input
                          className="ws-cell"
                          style={{ width: 84, textAlign: "right" }}
                          inputMode="decimal"
                          placeholder="Rate"
                          defaultValue={rates?.[c] ?? ""}
                          onBlur={(e) => {
                            const n = Number(e.target.value.replace(",", "."));
                            const nextRates = { ...(rates ?? {}) };
                            if (Number.isFinite(n) && n > 0) nextRates[c] = n;
                            else delete nextRates[c];
                            patchSettings({ clientRates: nextRates });
                          }}
                        />
                        {r && rateOf(c) > 0 && (
                          <div style={{ color: "var(--ws-green)", fontSize: 12, marginTop: 2 }}>
                            {formatMoney(Math.round((r.ms / 3600_000) * rateOf(c)))}
                          </div>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
      {open && (
        <ShiftDetail key={open.id} shift={open} clients={clients} onClose={() => onOpen(null)} />
      )}
    </div>
  );
}

function ClockCard({
  live,
  now,
  clients,
  onOpen,
}: {
  live: Shift | null;
  now: number;
  clients: string[];
  onOpen: (id: string) => void;
}) {
  const clockIn = useSoma((s) => s.clockIn);
  const clockOut = useSoma((s) => s.clockOut);
  const toggleBreak = useSoma((s) => s.toggleBreak);
  const [client, setClient] = useState(clients[0] ?? "");

  if (!live) {
    return (
      <div className="ws-card ws-clockcard">
        <div className="ws-clock-idle">
          <div>
            <b>Not clocked in</b>
            <div className="ws-faint">Pick the client you're working for and start the clock.</div>
          </div>
          <input
            className="ws-input"
            list="ws-shift-clients"
            placeholder="Client"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && client.trim() && clockIn(client)}
            style={{ width: 220 }}
          />
          <datalist id="ws-shift-clients">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button
            type="button"
            className="ws-btn primary"
            disabled={!client.trim()}
            onClick={() => clockIn(client)}
          >
            <LogIn /> Clock in
          </button>
        </div>
        {clients.length > 1 && (
          <div className="ws-quick">
            {clients.slice(0, 6).map((c) => (
              <button key={c} type="button" className="ws-chip" onClick={() => clockIn(c)}>
                <LogIn size={12} /> {c}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  const paused = onBreak(live);
  return (
    <div className={`ws-card ws-clockcard on ${paused ? "paused" : ""}`}>
      <div className="ws-clock-live">
        <div>
          <span className="ws-faint">
            {paused ? "On a break" : "Clocked in"} · {live.client} · since {hhmm(live.start)}
          </span>
          <div className="ws-bigclock">{clock(workedMs(live, now))}</div>
          <span className="ws-faint">
            {hours(breakMs(live, now))} of breaks · {live.activities.length} activities logged
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
          <button type="button" className="ws-btn" onClick={() => onOpen(live.id)}>
            <Plus /> Log what I'm doing
          </button>
          <button type="button" className="ws-btn" onClick={toggleBreak}>
            <Coffee /> {paused ? "End break" : "Take a break"}
          </button>
          <button
            type="button"
            className="ws-btn primary"
            onClick={() => {
              const id = clockOut();
              if (id) onOpen(id);
            }}
          >
            <LogOut /> Clock out
          </button>
        </div>
      </div>
    </div>
  );
}

function ShiftRow({
  s,
  now,
  selected,
  onClick,
}: {
  s: Shift;
  now: number;
  selected: boolean;
  onClick: () => void;
}) {
  const projects = useSoma((st) => st.projects);
  const names = [
    ...new Set(
      s.activities
        .map((a) => projects.find((p) => p.id === a.projectId))
        .filter(Boolean)
        .map((p) => p!),
    ),
  ];
  const missing = s.end !== undefined && !s.activities.some((a) => a.text.trim());
  return (
    <div className={`ws-shift ${selected ? "sel" : ""}`} onClick={onClick}>
      <div className="when">
        <b>
          {hhmm(s.start)} – {s.end ? hhmm(s.end) : "now"}
        </b>
        <span className="ws-faint">{s.client}</span>
      </div>
      <div className="what">
        {s.activities
          .filter((a) => a.text.trim())
          .slice(0, 2)
          .map((a) => (
            <div key={a.id} className="ws-ellip">
              {a.done && (
                <span className="ws-pill done" style={{ marginRight: 6 }}>
                  Done
                </span>
              )}
              {a.text}
            </div>
          ))}
        {missing && <span className="ws-amber">Nothing logged yet — what did you do?</span>}
        {!s.end && !s.activities.length && <span className="ws-faint">In progress</span>}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
          {names.map((p) => (
            <span key={p.id} className="ws-chip">
              <span className="ws-swatch" style={{ background: p.color, margin: 0 }} /> {p.name}
            </span>
          ))}
        </div>
      </div>
      <div className="hrs">
        <b>{hours(workedMs(s, now))}</b>
        {s.breaks.length > 0 && <span className="ws-faint">{hours(breakMs(s, now))} break</span>}
      </div>
    </div>
  );
}

function ShiftDetail({
  shift: s,
  clients,
  onClose,
}: {
  shift: Shift;
  clients: string[];
  onClose: () => void;
}) {
  const patchShift = useSoma((st) => st.patchShift);
  const removeShift = useSoma((st) => st.removeShift);
  const restoreShift = useSoma((st) => st.restoreShift);
  const fileActivity = useSoma((st) => st.fileActivity);
  const upsertProjectNote = useSoma((st) => st.upsertProjectNote);
  const live = s.end === undefined;
  const now = useTick(live);
  const day = shiftDay(s);

  const setTimes = (date: string, from: string, to: string | null) => {
    const start = timeAfter(date, from);
    if (start === null) return;
    const end = to === null ? undefined : timeAfter(date, to, start + 60_000);
    if (end === null) return;
    // Breaks keep their clock times on the new day.
    const breaks = s.breaks.map((b) => {
      const bs = timeAfter(date, hhmm(b.start), start)!;
      return {
        start: bs,
        end: b.end === undefined ? undefined : timeAfter(date, hhmm(b.end), bs)!,
      };
    });
    patchShift(s.id, { start, end, breaks });
  };

  const setBreak = (i: number, from: string, to: string) => {
    const bs = timeAfter(day, from, s.start);
    const be = to ? timeAfter(day, to, bs ?? s.start) : undefined;
    if (bs === null || be === null) return;
    patchShift(s.id, { breaks: s.breaks.map((b, j) => (j === i ? { start: bs, end: be } : b)) });
  };

  const saveActivity = (a: Activity) => {
    const st = useSoma.getState().shifts.find((x) => x.id === s.id);
    if (!st) return;
    patchShift(s.id, {
      activities: st.activities.map((x) => (x.id === a.id ? { ...x, ...a, stepId: x.stepId } : x)),
    });
    fileActivity(s.id, a.id);
  };

  const addActivity = () => {
    const last = s.activities[s.activities.length - 1];
    patchShift(s.id, {
      activities: [...s.activities, { id: newActivityId(), projectId: last?.projectId, text: "" }],
    });
  };

  const removeActivity = (a: Activity) => {
    patchShift(s.id, { activities: s.activities.filter((x) => x.id !== a.id) });
    if (a.projectId) upsertProjectNote(a.projectId, { id: a.id, at: 0, text: "" });
  };

  const remove = () => {
    const idx = useSoma.getState().shifts.findIndex((x) => x.id === s.id);
    removeShift(s.id);
    for (const a of s.activities)
      if (a.projectId) upsertProjectNote(a.projectId, { id: a.id, at: 0, text: "" });
    onClose();
    toast.success("Shift deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          restoreShift(idx, s);
          for (const a of s.activities) fileActivity(s.id, a.id);
        },
      },
    });
  };

  return (
    <aside className="ws-detail">
      <header>
        <b style={{ flex: 1 }}>
          {parseLocalDateKey(day).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
          <span className="ws-faint" style={{ fontWeight: 400 }}>
            {" "}
            · {hours(workedMs(s, now))} worked
          </span>
        </b>
        <button type="button" className="ws-icon" onClick={onClose} title="Close (Esc)">
          <X />
        </button>
      </header>

      <section>
        <label className="ws-field">
          <span>Client</span>
          <input
            className="ws-input"
            list="ws-shift-clients-d"
            defaultValue={s.client}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== s.client) patchShift(s.id, { client: v });
            }}
          />
          <datalist id="ws-shift-clients-d">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="ws-field">
          <span>Date</span>
          <input
            type="date"
            className="ws-input"
            value={day}
            onChange={(e) =>
              e.target.value && setTimes(e.target.value, hhmm(s.start), s.end ? hhmm(s.end) : null)
            }
          />
        </label>
        <div className="ws-field">
          <span>Hours</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="time"
              className="ws-input"
              value={hhmm(s.start)}
              onChange={(e) => setTimes(day, e.target.value, s.end ? hhmm(s.end) : null)}
            />
            –
            {live ? (
              <span className="ws-faint">still clocked in</span>
            ) : (
              <input
                type="time"
                className="ws-input"
                value={hhmm(s.end!)}
                onChange={(e) => setTimes(day, hhmm(s.start), e.target.value)}
              />
            )}
          </span>
        </div>
        <div className="ws-field" style={{ alignItems: "start" }}>
          <span style={{ paddingTop: 5 }}>Breaks</span>
          <div style={{ display: "grid", gap: 4 }}>
            {s.breaks.map((b, i) => (
              <span key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="time"
                  className="ws-cell"
                  value={hhmm(b.start)}
                  onChange={(e) => setBreak(i, e.target.value, b.end ? hhmm(b.end) : "")}
                />
                –
                {b.end === undefined ? (
                  <span className="ws-faint">now</span>
                ) : (
                  <input
                    type="time"
                    className="ws-cell"
                    value={hhmm(b.end)}
                    onChange={(e) => setBreak(i, hhmm(b.start), e.target.value)}
                  />
                )}
                <button
                  type="button"
                  className="ws-icon"
                  title="Remove break"
                  onClick={() => patchShift(s.id, { breaks: s.breaks.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="ws-btn ghost"
              style={{ justifySelf: "start" }}
              onClick={() => {
                const st = s.start + 4 * 3600_000;
                patchShift(s.id, { breaks: [...s.breaks, { start: st, end: st + 30 * 60_000 }] });
              }}
            >
              <Coffee /> Add a break
            </button>
          </div>
        </div>
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 600 }}>What I did</span>
          <span className="ws-faint" style={{ marginLeft: 8, fontSize: 12 }}>
            next steps and notes go to the project
          </span>
        </div>
        {s.activities.map((a) => (
          <ActivityEditor
            key={a.id}
            a={a}
            client={s.client}
            onSave={saveActivity}
            onRemove={() => removeActivity(a)}
          />
        ))}
        <button
          type="button"
          className="ws-btn"
          onClick={addActivity}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Plus /> Add what I worked on
        </button>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Shift notes</div>
        <textarea
          className="ws-textarea"
          placeholder="Anything about the day itself: who you met, where you were…"
          defaultValue={s.notes ?? ""}
          onBlur={(e) =>
            e.target.value !== (s.notes ?? "") &&
            patchShift(s.id, { notes: e.target.value.trim() || undefined })
          }
        />
      </section>

      <section style={{ borderBottom: 0, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="ws-btn ghost danger" onClick={remove}>
          <Trash2 /> Delete shift
        </button>
      </section>
    </aside>
  );
}

function ActivityEditor({
  a,
  client,
  onSave,
  onRemove,
}: {
  a: Activity;
  client: string;
  onSave: (a: Activity) => void;
  onRemove: () => void;
}) {
  const projects = useSoma((s) => s.projects);
  const [d, setD] = useState(a);
  useEffect(() => setD(a), [a]);
  const theirs = projects.filter((p) => p.client === client && p.status !== "done");
  const others = projects.filter((p) => !(p.client === client && p.status !== "done"));
  const commit = (patch: Partial<Activity> = {}) => {
    const n = { ...d, ...patch };
    setD(n);
    onSave({
      ...n,
      text: n.text,
      nextStep: n.nextStep?.trim() || undefined,
      notes: n.notes?.trim() || undefined,
    });
  };
  return (
    <div className={`ws-activity ${d.done ? "done" : ""}`}>
      <div className="row">
        <select
          className="ws-cell"
          value={d.projectId ?? ""}
          onChange={(e) => commit({ projectId: e.target.value || undefined })}
          style={{ flex: 1, minWidth: 0 }}
        >
          <option value="">No project</option>
          {theirs.length > 0 && (
            <optgroup label={client}>
              {theirs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Other projects">
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.client ? ` · ${p.client}` : ""}
              </option>
            ))}
          </optgroup>
        </select>
        <label className="ws-done">
          <input
            type="checkbox"
            checked={!!d.done}
            onChange={(e) => commit({ done: e.target.checked || undefined })}
          />
          Done
        </label>
        <button type="button" className="ws-icon" title="Remove" onClick={onRemove}>
          <Trash2 />
        </button>
      </div>
      <input
        className="ws-input"
        autoFocus={!a.text}
        placeholder="What I did"
        value={d.text}
        onChange={(e) => setD({ ...d, text: e.target.value })}
        onBlur={() => commit()}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {!d.done && (
        <input
          className="ws-input"
          placeholder="Next step (added to the project)"
          value={d.nextStep ?? ""}
          onChange={(e) => setD({ ...d, nextStep: e.target.value })}
          onBlur={() => commit()}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
      <textarea
        className="ws-textarea"
        style={{ minHeight: 54 }}
        placeholder={
          d.done
            ? "Notes on how it ended — kept in the project file"
            : "Notes — kept in the project file"
        }
        value={d.notes ?? ""}
        onChange={(e) => setD({ ...d, notes: e.target.value })}
        onBlur={() => commit()}
      />
    </div>
  );
}
