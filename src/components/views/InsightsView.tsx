import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BodyHeatmap } from "@/components/BodyHeatmap";
import { DatabaseView } from "@/components/views/DatabaseView";
import { GraphsView } from "@/components/views/GraphsView";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { computeBiologicalReadiness, heatColor, heatLabel, MUSCLE_REGIONS } from "@/lib/recovery";
import { SomaIntelligenceEngine, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

type InsightTab = "overview" | "strength" | "heatmap" | "database" | "graphs";

export function InsightsView() {
  const [tab, setTab] = useState<InsightTab>("overview");
  const tabs: { id: InsightTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "strength", label: "Strength" },
    { id: "database", label: "Database" },
    { id: "graphs", label: "Graphs" },
    { id: "heatmap", label: "Heatmap" },
  ];
  return (
    <div className="space-y-3 pb-4">
      <div className="flex gap-1 rounded-full border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "h-10 flex-1 rounded-full text-xs font-bold",
              tab === t.id ? "bg-accent text-accent-ink" : "text-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewPanel />}
      {tab === "strength" && <StrengthPanel />}
      {tab === "database" && <DatabaseView />}
      {tab === "graphs" && <GraphsView />}
      {tab === "heatmap" && <HeatmapPanel />}
    </div>
  );
}

function OverviewPanel() {
  const history = useSoma((s) => s.history);
  const settings = useSoma((s) => s.settings);
  const c = SomaIntelligenceEngine.computeConsistency(history, {
    sessionsPerWeek: settings.sessionsPerWeek,
    now: Date.now(),
  });
  const rows = SomaIntelligenceEngine.volumeReport(history, 7, Date.now());
  const attention = rows
    .filter((r: { tier: string }) => r.tier === "over" || r.tier === "under" || r.tier === "high")
    .slice(0, 8);
  const shown = attention.length ? attention : rows.filter((r: { sets: number }) => r.sets > 0).slice(0, 8);

  let axial = 0;
  let total = 0;
  let push = 0;
  let pull = 0;
  let leg = 0;
  const cutoff = Date.now() - 14 * 86400000;
  for (const s of Object.values(history)) {
    if ((s.timestamp || 0) < cutoff) continue;
    total += s.totalVol || 0;
    axial += s.axialVol || 0;
    const n = (s.split || "").toLowerCase();
    if (n.includes("push") || n.includes("upper")) push += s.totalVol || 0;
    else if (n.includes("pull")) pull += s.totalVol || 0;
    else if (n.includes("leg")) leg += s.totalVol || 0;
  }
  const ppl = push + pull + leg || 1;
  const axialRatio = Math.round((axial / (total || 1)) * 100);

  return (
    <>
      <Card className="overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_55%),var(--color-surface)]">
        <Badge tone="accent">Training consistency</Badge>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Big n={`${c.currentStreak}`} l="Week streak" />
          <Big n={`${c.bestStreak}`} l="Best" />
          <Big n={`${c.adherence}%`} l="Adherence" />
        </div>
        <div className="mt-4 flex gap-1.5">
          {c.weekDays.map((d: { date: string; done: boolean; future: boolean }) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[0.58rem] font-bold uppercase text-faint">
                {parseLocalDateKey(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
              <div
                className={cn(
                  "h-6 w-full rounded-md",
                  d.done ? "bg-accent" : d.future ? "bg-surface-2" : "bg-surface-3",
                )}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          {c.thisWeek}/{c.target} sessions this week · {c.totalSessions} logged total
        </p>
      </Card>

      <Card>
        <CardTitle>Weekly volume vs landmarks</CardTitle>
        <div className="space-y-3">
          {(shown.length ? shown : rows.slice(0, 8)).map(
            (r: { label: string; sets: number; mev: number; mav: number; mrv: number; tier: string; note: string }) => (
              <div key={r.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-bold">{r.label}</span>
                  <span className="text-muted">
                    {r.sets} sets · {r.note}
                  </span>
                </div>
                <Progress
                  value={Math.min(100, (r.sets / r.mrv) * 100)}
                  barClassName={
                    r.tier === "over"
                      ? "bg-danger"
                      : r.tier === "under" || r.tier === "none"
                        ? "bg-warn"
                        : "bg-accent"
                  }
                />
              </div>
            ),
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>CNS / axial load · 14d</CardTitle>
        <div className="mb-2 flex justify-between text-sm font-bold">
          <span>Spinal stress ratio</span>
          <span className={axialRatio > 40 ? "text-danger" : "text-accent-text"}>{axialRatio}%</span>
        </div>
        <Progress value={Math.min(100, axialRatio * 2)} barClassName={axialRatio > 40 ? "bg-danger" : "bg-accent"} />
        <div className="mt-4 flex h-3 overflow-hidden rounded-full">
          <div className="bg-fg" style={{ width: `${(push / ppl) * 100}%` }} />
          <div className="bg-accent" style={{ width: `${(pull / ppl) * 100}%` }} />
          <div className="bg-warn" style={{ width: `${(leg / ppl) * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[0.7rem] font-bold">
          <span>Push {Math.round((push / ppl) * 100)}%</span>
          <span className="text-accent-text">Pull {Math.round((pull / ppl) * 100)}%</span>
          <span className="text-warn">Legs {Math.round((leg / ppl) * 100)}%</span>
        </div>
      </Card>
    </>
  );
}

function StrengthPanel() {
  const history = useSoma((s) => s.history);
  const names: string[] = SomaIntelligenceEngine.loggedExerciseNames(history);
  const [pick, setPick] = useState(names[0] || "");
  const series = pick ? SomaIntelligenceEngine.strengthSeries(history, pick) : [];
  const prs = series.filter((p: { isPR: boolean }) => p.isPR).slice(-6).reverse();

  return (
    <>
      <Card>
        <CardTitle>Estimated 1RM</CardTitle>
        {names.length === 0 ? (
          <p className="text-sm text-muted">Log working sets to chart a lift.</p>
        ) : (
          <>
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            {series.length >= 2 && (
              <svg viewBox="0 0 320 90" className="mt-3 h-24 w-full">
                <polyline
                  fill="none"
                  stroke="var(--color-accent-text)"
                  strokeWidth="2.5"
                  points={sparkPoints(series.map((p: { est1RM: number }) => p.est1RM))}
                />
              </svg>
            )}
            {series.length > 0 && (
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted">{series.length} sessions</span>
                <span className="font-display text-lg font-extrabold tabular">
                  {series[series.length - 1].est1RM}
                  <span className="text-xs text-muted"> {series[series.length - 1].metric}</span>
                </span>
              </div>
            )}
          </>
        )}
      </Card>
      <Card>
        <CardTitle>Recent PRs</CardTitle>
        {prs.length === 0 && <p className="text-sm text-muted">No PRs on this lift yet.</p>}
        {prs.map((p: { date: string; est1RM: number; weight: number; reps: number }) => (
          <div key={p.date} className="flex justify-between border-b border-border py-2 text-sm last:border-0">
            <span className="text-muted">{p.date}</span>
            <span className="font-bold tabular">
              {p.weight} × {p.reps} · {p.est1RM}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

function HeatmapPanel() {
  const history = useSoma((s) => s.history);
  const [view, setView] = useState<"front" | "back">("front");
  const [sel, setSel] = useState<string | null>("chest");
  const map = useMemo(() => computeBiologicalReadiness(history), [history]);
  const list = MUSCLE_REGIONS.filter((m) => m.view === view);
  const active = sel ? map[sel] : null;

  // The anatomical map owns its own front/back switch, so the list below
  // follows whichever side it is showing rather than duplicating the control.
  const recoveryByKey = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) out[k] = v.recovery;
    return out;
  }, [map]);

  return (
    <>
      <Card>
        <CardTitle>Muscle recovery</CardTitle>
        <BodyHeatmap readiness={recoveryByKey} />
      </Card>

      <div className="flex gap-1 rounded-full border border-border bg-surface p-1">
        {(["front", "back"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "h-10 flex-1 rounded-full text-xs font-bold uppercase",
              view === v ? "bg-accent text-accent-ink" : "text-muted",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <Card>
        <CardTitle>Readiness</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          {list.map((m) => {
            const r = map[m.key];
            const rec = r?.recovery ?? 100;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSel(m.key)}
                className={cn(
                  "rounded-xl border p-3 text-left",
                  sel === m.key ? "border-accent-line bg-accent-soft" : "border-border bg-surface-2",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{m.label}</span>
                  <span className="text-xs font-extrabold tabular" style={{ color: heatColor(rec) }}>
                    {rec}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full" style={{ width: `${rec}%`, background: heatColor(rec) }} />
                </div>
              </button>
            );
          })}
        </div>
      </Card>
      {active && (
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-base font-bold">{active.label}</div>
              <div className="mt-1 text-sm text-muted">
                {heatLabel(active.recovery)}
                {active.hoursLeft > 0 ? ` · ${active.hoursLeft}h remaining` : " · fully recovered"}
              </div>
              {active.lastWorkedHours != null && (
                <div className="mt-1 text-xs text-faint">
                  Last trained {active.lastWorkedHours}h ago
                  {active.effortNote ? ` · ${active.effortNote}` : ""}
                </div>
              )}
            </div>
            <Badge>{active.recovery}%</Badge>
          </div>
        </Card>
      )}
    </>
  );
}

function CalendarPanel() {
  const history = useSoma((s) => s.history);
  const settings = useSoma((s) => s.settings);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const setTab = useSoma((s) => s.setTab);
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = getLocalDateKey();

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="size-10 rounded-xl border border-border" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
          <ChevronLeft className="mx-auto size-4" />
        </button>
        <div className="font-display font-bold">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <button type="button" className="size-10 rounded-xl border border-border" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
          <ChevronRight className="mx-auto size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.62rem] font-bold uppercase text-faint">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const key = getLocalDateKey(new Date(year, month, day));
          const logged = !!history[key];
          const proj = SomaIntelligenceEngine.getProgramProjectedDay(new Date(year, month, day, 12), settings.scheduleOverrides);
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveDate(key);
                if (logged) setTab("workout");
              }}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-xl text-xs font-bold",
                isToday && "ring-1 ring-accent",
                logged ? "bg-accent text-accent-ink" : proj.isRest ? "bg-surface-2 text-faint" : "bg-surface-3 text-muted",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[0.7rem] text-faint">Accent cells are logged sessions. Tap one to jump to that date.</p>
    </Card>
  );
}

function Big({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-extrabold tabular tracking-tight">{n}</div>
      <div className="text-[0.62rem] font-bold uppercase tracking-wider text-faint">{l}</div>
    </div>
  );
}

function sparkPoints(vals: number[]) {
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = Math.max(1, max - min);
  const w = 320;
  const h = 90;
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  return vals
    .map((v, i) => {
      const x = i * step;
      const y = h - 10 - ((v - min) / range) * (h - 20);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
