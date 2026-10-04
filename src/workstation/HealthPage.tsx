import { useMemo, useState } from "react";
import { DEFAULT_GOALS, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { BarChart, LineChart } from "./Charts";
import { avg, intake, lastDays, sleep, weeklyVolume, weights } from "./health";
import type { PageId } from "./Workstation";

const RANGES = [14, 28, 90] as const;
const short = (d: string) =>
  parseLocalDateKey(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const long = (d: string) =>
  parseLocalDateKey(d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const n0 = (n: number) => Math.round(n).toLocaleString();

/**
 * Body, food and training at a desk: the trends a phone screen is too small
 * to show side by side, with every session in a table.
 */
export function HealthPage({ onGo }: { onGo: (p: PageId) => void }) {
  const nutrition = useSoma((s) => s.nutrition);
  const history = useSoma((s) => s.history);
  const today = getLocalDateKey();
  const [range, setRange] = useState<(typeof RANGES)[number]>(28);

  const days = useMemo(() => lastDays(today, range), [today, range]);
  const food = useMemo(() => intake(nutrition, days), [nutrition, days]);
  const weight = useMemo(() => weights(nutrition, days), [nutrition, days]);
  const sleepS = useMemo(() => sleep(nutrition, days), [nutrition, days]);
  const volume = useMemo(() => weeklyVolume(history, today, 12), [history, today]);
  const goals =
    nutrition[today]?.goals ??
    [...Object.keys(nutrition)]
      .sort()
      .reverse()
      .map((k) => nutrition[k]?.goals)
      .find(Boolean) ??
    DEFAULT_GOALS;

  const avgCals = avg(food.map((f) => f.cals));
  const avgProt = avg(food.map((f) => f.protein));
  const logged = food.filter((f) => f.cals !== null).length;
  const wVals = weight.filter((w) => w.value !== null);
  const wNow = wVals.length ? wVals[wVals.length - 1]!.value! : null;
  const wChange = wVals.length > 1 ? wNow! - wVals[0]!.value! : null;
  const avgSleep = avg(sleepS.map((s) => s.value));
  const sessions = Object.entries(history)
    .filter(([d, s]) => s && d >= days[0]!)
    .sort((a, b) => b[0].localeCompare(a[0]));
  const every = range === 14 ? 2 : range === 28 ? 4 : 14;

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
        <h1 style={{ marginRight: 6 }}>Health</h1>
        <div className="ws-seg">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r} days
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="ws-btn ghost" onClick={() => onGo("fuel")}>
            Log food
          </button>
          <button type="button" className="ws-btn ghost" onClick={() => onGo("train")}>
            Training
          </button>
        </div>
      </div>

      <div className="ws-kpis">
        <div className="ws-kpi">
          <span>Calories / day</span>
          <b>{avgCals === null ? "—" : n0(avgCals)}</b>
          <small>
            goal {n0(goals.cals)} · {logged} of {range} days logged
          </small>
        </div>
        <div
          className={`ws-kpi ${avgProt !== null && avgProt < goals.protein * 0.85 ? "warn" : ""}`}
        >
          <span>Protein / day</span>
          <b>{avgProt === null ? "—" : `${n0(avgProt)} g`}</b>
          <small>goal {goals.protein} g</small>
        </div>
        <div className="ws-kpi">
          <span>Bodyweight</span>
          <b>{wNow === null ? "—" : `${wNow.toFixed(1)} kg`}</b>
          <small>
            {wChange === null
              ? "log weight to see a trend"
              : `${wChange >= 0 ? "+" : "−"}${Math.abs(wChange).toFixed(1)} kg over ${range} days`}
          </small>
        </div>
        <div className="ws-kpi">
          <span>Sessions</span>
          <b>{sessions.length}</b>
          <small>
            in {range} days · {(sessions.length / (range / 7)).toFixed(1)}/week
          </small>
        </div>
        <div className="ws-kpi">
          <span>Sleep / night</span>
          <b>{avgSleep === null ? "—" : `${avgSleep.toFixed(1)} h`}</b>
          <small>where logged</small>
        </div>
      </div>

      <div className="ws-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <section className="ws-card">
          <header>
            Calories <small>per day, against your goal</small>
          </header>
          <div className="ws-chart-card">
            <BarChart
              data={food.map((f) => ({
                key: f.date,
                label: short(f.date),
                value: f.cals,
                note: long(f.date),
              }))}
              goal={goals.cals}
              every={every}
            />
          </div>
        </section>
        <section className="ws-card">
          <header>
            Protein <small>grams per day, against your goal</small>
          </header>
          <div className="ws-chart-card">
            <BarChart
              data={food.map((f) => ({
                key: f.date,
                label: short(f.date),
                value: f.protein,
                note: long(f.date),
              }))}
              goal={goals.protein}
              format={(n) => `${Math.round(n)}`}
              every={every}
            />
          </div>
        </section>
        <section className="ws-card">
          <header>
            Bodyweight <small>kg</small>
          </header>
          <div className="ws-chart-card">
            <LineChart
              data={weight.map((w) => ({
                key: w.date,
                label: short(w.date),
                value: w.value,
                note: long(w.date),
              }))}
              unit=" kg"
              every={every}
            />
          </div>
        </section>
        <section className="ws-card">
          <header>
            Sleep <small>hours per night</small>
          </header>
          <div className="ws-chart-card">
            <BarChart
              data={sleepS.map((s) => ({
                key: s.date,
                label: short(s.date),
                value: s.value,
                note: long(s.date),
              }))}
              goal={8}
              goalLabel="Aim"
              format={(n) => n.toFixed(n % 1 ? 1 : 0)}
              every={every}
            />
          </div>
        </section>
        <section className="ws-card">
          <header>
            Training volume <small>kg lifted per week, last 12 weeks</small>
          </header>
          <div className="ws-chart-card">
            <BarChart
              data={volume.map((v) => ({
                key: v.week,
                label: short(v.week),
                value: v.volume || null,
                note: `Week of ${short(v.week)} · ${v.sessions} session${v.sessions === 1 ? "" : "s"}`,
              }))}
              format={(n) =>
                n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`
              }
              every={2}
            />
          </div>
        </section>
        <section className="ws-card">
          <header>
            Sessions <small>{range} days</small>
          </header>
          {sessions.length ? (
            <div style={{ maxHeight: 214, overflow: "auto" }}>
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th>Time</th>
                    <th style={{ textAlign: "right" }}>Sets</th>
                    <th style={{ textAlign: "right" }}>Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(([d, s]) => (
                    <tr key={d}>
                      <td className="ws-num">{long(d)}</td>
                      <td>{s!.split}</td>
                      <td className="ws-muted">{s!.durationFormatted}</td>
                      <td className="ws-num" style={{ textAlign: "right" }}>
                        {s!.totalSets}
                      </td>
                      <td className="ws-num" style={{ textAlign: "right" }}>
                        {n0(s!.totalVol)} kg
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ws-empty">No sessions in this period.</p>
          )}
        </section>
      </div>
    </div>
  );
}
