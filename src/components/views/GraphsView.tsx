import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import {
  buildTrainingLog, dayBest, estimated1RM, groupsOf, type ExerciseLog, type LoggedSet,
  formatSet,
} from "@/lib/training-log";
import { microMuscleStrength } from "@/lib/micro-muscle";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Progression over the whole history.
 *
 * Three metrics rather than one, because they disagree in useful ways: a top
 * set can stall while volume climbs, and estimated 1RM can climb on fewer,
 * heavier reps while volume falls. Showing only one would hide the other two.
 */

type Metric = "top" | "e1rm" | "volume";
type Range = "3M" | "6M" | "1Y" | "All";

const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "top", label: "Top set", unit: "kg" },
  { id: "e1rm", label: "Est. 1RM", unit: "kg" },
  { id: "volume", label: "Volume", unit: "kg" },
];

const RANGES: { id: Range; days: number | null }[] = [
  { id: "3M", days: 90 }, { id: "6M", days: 182 },
  { id: "1Y", days: 365 }, { id: "All", days: null },
];

// Distinguishable in both themes and reasonably colourblind-safe.
const SERIES_COLORS = ["#38bdf8", "#f97316", "#a78bfa", "#34d399", "#f472b6"];

/** The heaviest set of a day, for labelling — "Top set" means a set, not a number. */
function topSetOf(sets: LoggedSet[]): LoggedSet | null {
  if (!sets.length) return null;
  return sets.reduce((a, b) => (b.weight > a.weight ? b : a));
}

function metricOf(sets: LoggedSet[], m: Metric): number {
  if (!sets.length) return 0;
  if (m === "top") return Math.max(...sets.map((s) => s.weight));
  if (m === "e1rm") return dayBest(sets);
  return sets.reduce((t, s) => t + s.weight * s.reps, 0);
}

export function GraphsView() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  // Bodyweight lifts need the body's own load, which lives in the nutrition log.
  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);
  const log = useMemo(() => buildTrainingLog(history, bodyweights), [history, bodyweights]);
  const groups = useMemo(() => groupsOf(log), [log]);
  const micro = useMemo(() => microMuscleStrength(log), [log]);

  const [group, setGroup] = useState<string>("Chest");
  const [picked, setPicked] = useState<string[]>([]);
  const [metric, setMetric] = useState<Metric>("e1rm");
  const [range, setRange] = useState<Range>("All");

  const inGroup = useMemo(
    () => log.filter((e) => e.group === group).sort((a, b) =>
      Object.keys(b.days).length - Object.keys(a.days).length),
    [log, group],
  );

  // Default to the most-trained lift in the group rather than an empty chart.
  const active = picked.length ? picked : inGroup.slice(0, 1).map((e) => e.name);

  const cutoff = useMemo(() => {
    const d = RANGES.find((r) => r.id === range)?.days;
    if (!d) return null;
    return Date.now() - d * 86400000;
  }, [range]);

  const { data, prs } = useMemo(() => {
    const series = active
      .map((n) => log.find((e) => e.name === n))
      .filter((e): e is ExerciseLog => !!e);

    const dates = new Set<string>();
    for (const e of series) {
      for (const d of Object.keys(e.days)) {
        if (!cutoff || new Date(d).getTime() >= cutoff) dates.add(d);
      }
    }

    const rows = [...dates].sort().map((d) => {
      const row: Record<string, string | number> = { date: d, t: new Date(d).getTime() };
      for (const e of series) {
        const sets = e.days[d];
        if (!sets?.length) continue;
        row[e.name] = Math.round(metricOf(sets, metric) * 10) / 10;
        // Carried alongside the number so the tooltip can say "80kg x 12"
        // rather than leaving the reps to be guessed at.
        const top = topSetOf(sets);
        if (top) row[`${e.name}__label`] = formatSet(top);
      }
      return row;
    });

    // A PR is the point where this metric first exceeds everything before it.
    const marks: { name: string; t: number; v: number }[] = [];
    for (const e of series) {
      let best = 0;
      for (const row of rows) {
        const v = row[e.name];
        if (typeof v === "number" && v > best) {
          best = v;
          marks.push({ name: e.name, t: row.t as number, v });
        }
      }
      // only the final record for each lift, not every step toward it
      const last = marks.filter((m) => m.name === e.name).pop();
      for (let i = marks.length - 1; i >= 0; i--) {
        if (marks[i]!.name === e.name && marks[i] !== last) marks.splice(i, 1);
      }
    }
    return { data: rows, prs: marks };
  }, [active, log, metric, cutoff]);

  const unit = METRICS.find((m) => m.id === metric)!.unit;

  return (
    <div className="space-y-3">
      <MicroMusclePanel micro={micro} group={group} />

      <Card>
        <CardTitle>Progression</CardTitle>

        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => { setGroup(g); setPicked([]); }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[0.7rem] font-bold transition-colors",
                group === g ? "border-accent bg-accent text-accent-ink"
                            : "border-border bg-surface-2 text-muted",
              )}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="mb-2 flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className={cn(
                "h-9 flex-1 rounded-lg text-[0.7rem] font-bold transition-colors",
                metric === m.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={cn(
                "h-8 flex-1 rounded-lg text-[0.68rem] font-bold transition-colors",
                range === r.id ? "bg-surface-3 text-fg" : "bg-surface-2 text-faint",
              )}
            >
              {r.id}
            </button>
          ))}
        </div>

        {data.length < 2 ? (
          <p className="py-10 text-center text-xs text-muted">
            {data.length === 1
              ? "Only one session in this range — pick a wider range to see a trend."
              : "Nothing logged in this range."}
          </p>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  stroke="var(--color-border)"
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => new Date(t as number).toLocaleDateString()}
                  formatter={(v, n, item) => {
                    const label = (item?.payload as Record<string, string>)?.[`${n as string}__label`];
                    return [label ? `${v} ${unit} · top set ${label}` : `${v} ${unit}`, n as string];
                  }}
                />
                {active.map((n, i) => (
                  <Line
                    key={n}
                    type="monotone"
                    dataKey={n}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                    isAnimationActive
                    animationDuration={420}
                  />
                ))}
                {prs.map((p) => (
                  <ReferenceDot
                    key={p.name + p.t}
                    x={p.t}
                    y={p.v}
                    r={5}
                    fill="#ef4444"
                    stroke="var(--color-bg)"
                    strokeWidth={2}
                    label={{ value: "PR", position: "top", fill: "#ef4444", fontSize: 9, fontWeight: 800 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Exercises</CardTitle>
        <p className="mb-2 text-[0.7rem] text-muted">Tap to plot several at once.</p>
        <div className="flex flex-wrap gap-1.5">
          {inGroup.map((e, i) => {
            const on = active.includes(e.name);
            const colour = SERIES_COLORS[active.indexOf(e.name) % SERIES_COLORS.length];
            return (
              <button
                key={e.name}
                type="button"
                onClick={() =>
                  setPicked((p) => {
                    const base = p.length ? p : active;
                    return base.includes(e.name)
                      ? base.filter((x) => x !== e.name)
                      : [...base, e.name].slice(0, 5);
                  })}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.68rem] font-bold transition-colors",
                  on ? "border-transparent bg-surface-3 text-fg" : "border-border text-muted",
                )}
              >
                {on && <span className="size-2 rounded-full" style={{ background: colour }} />}
                {e.name}
                <span className="text-faint">{Object.keys(e.days).length}</span>
              </button>
            );
          })}
        </div>
        {active.length >= 5 && (
          <p className="mt-2 text-[0.65rem] text-faint">
            Five lines is the limit — more and the chart stops being readable.
          </p>
        )}
      </Card>
    </div>
  );
}

/**
 * Strength per micro-muscle, above the per-exercise charts.
 *
 * Indexed to 100 at each muscle's baseline rather than shown in kilos, because
 * the lifts feeding one micro-muscle span wildly different loads and adding
 * them would track exercise selection instead of strength. See micro-muscle.ts.
 */
function MicroMusclePanel({
  micro,
  group,
}: {
  micro: ReturnType<typeof microMuscleStrength>;
  group: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () => micro.filter((m) => m.muscle === group && m.usable),
    [micro, group],
  );
  const thin = useMemo(
    () => micro.filter((m) => m.muscle === group && !m.usable).length,
    [micro, group],
  );

  if (!rows.length) {
    return (
      <Card>
        <CardTitle>Micro-muscle strength</CardTitle>
        <p className="text-xs text-muted">
          {thin > 0
            ? `${thin} ${thin === 1 ? "head" : "heads"} in this group have too few sessions to read as a trend yet.`
            : "Nothing logged for this group yet."}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Micro-muscle strength</CardTitle>
      <p className="mb-3 text-[0.65rem] leading-snug text-muted">
        Indexed to 100 at each head&apos;s first session. The lifts feeding one head span
        very different loads, so kilos cannot be averaged across them — this tracks the
        trend instead.
      </p>

      <div className="space-y-1.5">
        {rows.map((m) => {
          const isOpen = open === m.subTarget;
          const up = m.change >= 0;
          return (
            <div key={m.subTarget} className="overflow-hidden rounded-xl border border-border bg-surface-2">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : m.subTarget)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.74rem] font-bold">{m.subTarget}</div>
                  <div className="text-[0.6rem] text-faint">
                    {m.exercises.length} {m.exercises.length === 1 ? "lift" : "lifts"} ·{" "}
                    {m.points.length} sessions
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      "font-display text-sm font-extrabold tabular-nums",
                      up ? "text-emerald-400" : "text-orange-400",
                    )}
                  >
                    {up ? "+" : ""}
                    {m.change}%
                  </div>
                  <div className="text-[0.55rem] text-faint">since start</div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border px-2 pb-2 pt-1">
                  <div className="h-28 w-full">
                    <ResponsiveContainer>
                      <LineChart
                        data={m.points.map((p) => ({ ...p, t: new Date(p.date).getTime() }))}
                        margin={{ top: 6, right: 8, bottom: 0, left: -26 }}
                      >
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="t"
                          type="number"
                          scale="time"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(t) =>
                            new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
                          tick={{ fontSize: 9, fill: "var(--color-muted)" }}
                          stroke="var(--color-border)"
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: "var(--color-muted)" }}
                          stroke="var(--color-border)"
                          width={36}
                          domain={["dataMin - 5", "dataMax + 5"]}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-surface-2)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 12,
                            fontSize: 11,
                          }}
                          labelFormatter={(t) => new Date(t as number).toLocaleDateString()}
                          formatter={(v, _n, item) => [
                            `${v} · ${(item?.payload as { contributing?: number })?.contributing ?? 0} lifts`,
                            "index",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="index"
                          stroke="var(--color-accent)"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          isAnimationActive
                          animationDuration={380}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="px-1 text-[0.58rem] leading-snug text-faint">
                    From {m.exercises.join(", ")}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {thin > 0 && (
        <p className="mt-2 text-[0.58rem] text-faint">
          {thin} more {thin === 1 ? "head has" : "heads have"} too few sessions to plot yet.
        </p>
      )}
    </Card>
  );
}
