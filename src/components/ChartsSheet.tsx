import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Table2, X } from "lucide-react";
import {
  SERIES, buildSeries, datesBack, movingAverage, statsOf, type Point, type SeriesDef, type SeriesId,
} from "@/lib/chart-series";
import { tapTick } from "@/lib/haptics";
import { isRestSplit } from "@/lib/programs";
import { SomaIntelligenceEngine } from "@/lib/soma";
import { useActiveProgram, useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Charts: every daily number SOMA keeps, over time, in stacked panes that
 * share one time axis and one crosshair — the way a trading terminal stacks
 * price over volume, never two scales on one plot.
 *
 * Colours are the validated categorical palette (dataviz reference instance),
 * a fixed slot per measure so calories are always the same orange. Each pane
 * names its series in text, so identity never rests on colour alone; the
 * table view carries the exact numbers.
 */

const RANGES = [
  { days: 7, label: "1W" },
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
  { days: 180, label: "6M" },
  { days: 365, label: "1Y" },
] as const;

const COLORS = {
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
};

const PAD_L = 6;
const PAD_R = 52; // the price axis, right side
const PAD_T = 14;
const PAD_B = 8;

const fmt = (v: number | null | undefined, d: number) =>
  v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

const dayLabel = (key: string, long = false) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, long
    ? { weekday: "short", day: "numeric", month: "short" }
    : { day: "numeric", month: "short" });

/** Three round numbers spanning [lo, hi]. */
function ticks(lo: number, hi: number): number[] {
  const span = hi - lo || 1;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export function ChartsSheet({ onClose }: { onClose: () => void }) {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const habits = useSoma((s) => s.habits);
  const hunger = useSoma((s) => s.hunger);
  const restDays = useSoma((s) => s.restDays);
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const program = useActiveProgram();

  const range = settings.chartRange ?? 30;
  const chosen = (settings.chartSeries ?? ["score", "calories", "sleep"]) as SeriesId[];
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const dark = typeof document !== "undefined" && document.documentElement.getAttribute("data-soma-theme") !== "light";
  const palette = dark ? COLORS.dark : COLORS.light;

  // Two periods: the one shown, and the one before it for "vs last period".
  const all = useMemo(() => datesBack(range * 2), [range]);
  const dates = all.slice(range);
  const data = useMemo(() => {
    const isTrainingDay = (date: string) => {
      const p = SomaIntelligenceEngine.getProgramProjectedDay(new Date(`${date}T12:00:00`), settings.scheduleOverrides, program);
      return !p.isRest && !isRestSplit(p.split);
    };
    const input = { dates: all, history, nutrition, habits, hunger, phase: settings.phase, restDays, isTrainingDay };
    const out = new Map<SeriesId, { points: Point[]; stats: ReturnType<typeof statsOf>; trend: (number | null)[] | null }>();
    for (const def of SERIES) {
      if (!chosen.includes(def.id)) continue;
      const full = buildSeries(def.id, input);
      const points = full.slice(range);
      out.set(def.id, {
        points,
        stats: statsOf(points, full.slice(0, range)),
        trend: def.trend ? movingAverage(full, def.trend).slice(range) : null,
      });
    }
    return out;
    // `chosen` is derived from settings each render; its join is the stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, range, history, nutrition, habits, hunger, restDays, settings.phase, settings.scheduleOverrides, program, chosen.join()]);

  const toggle = (id: SeriesId) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    if (next.length) patchSettings({ chartSeries: next });
  };

  // Shared width for every pane, so the crosshair lines up across them.
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [table]);

  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const xAt = (i: number) => PAD_L + (dates.length <= 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);

  // The crosshair: finger anywhere over the panes picks the nearest day.
  const lastIdx = useRef<number | null>(null);
  const pick = (clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const x = clientX - el.getBoundingClientRect().left - PAD_L;
    const i = Math.max(0, Math.min(dates.length - 1, Math.round((x / plotW) * (dates.length - 1))));
    if (i !== lastIdx.current) {
      lastIdx.current = i;
      tapTick();
    }
    setHover(i);
  };
  const release = () => {
    lastIdx.current = null;
    setHover(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = SERIES.filter((s) => chosen.includes(s.id));
  const xTicks = useMemo(() => {
    const n = Math.min(5, dates.length);
    return Array.from({ length: n }, (_, k) => Math.round((k / Math.max(1, n - 1)) * (dates.length - 1)));
  }, [dates.length]);

  return (
    <div
      className="fixed inset-0 z-[75] flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Charts"
      data-no-swipe-nav
      style={{ paddingTop: "var(--safe-top,env(safe-area-inset-top))" }}
    >
      {/* Title row */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Charts</h2>
          <p className="text-xs text-muted">
            {dayLabel(dates[0]!)} – {dayLabel(dates[dates.length - 1]!)} · {shown.length}{" "}
            {shown.length === 1 ? "series" : "series"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            aria-pressed={table}
            aria-label="Show as a table"
            className={cn(
              "grid size-9 place-items-center rounded-full border",
              table ? "border-fg bg-fg text-bg" : "border-border bg-surface-2 text-muted",
            )}
          >
            <Table2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close charts"
            className="grid size-9 place-items-center rounded-full border border-border bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Range: one segmented control, the way Health does it */}
      <div className="px-4">
        <div className="grid grid-cols-5 gap-1 rounded-full bg-surface-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => patchSettings({ chartRange: r.days })}
              className={cn(
                "h-8 rounded-full text-xs font-extrabold transition-colors",
                range === r.days ? "bg-fg text-bg shadow" : "text-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Series: toggles, any number at once */}
      <div className="flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {SERIES.map((s) => {
          const on = chosen.includes(s.id);
          const c = palette[s.slot - 1]!;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                on ? "border-transparent text-fg" : "border-border text-muted",
              )}
              style={on ? { background: `color-mix(in srgb, ${c} 22%, transparent)` } : undefined}
            >
              <span className="size-2 rounded-full" style={{ background: c, opacity: on ? 1 : 0.45 }} />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(24px,var(--safe-bottom,env(safe-area-inset-bottom)))]">
        {table ? (
          <DataTable dates={dates} shown={shown} data={data} />
        ) : (
          <div
            ref={wrap}
            className="relative touch-none select-none"
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              pick(e.clientX);
            }}
            onPointerMove={(e) => (e.buttons || e.pointerType === "mouse" ? pick(e.clientX) : undefined)}
            onPointerUp={release}
            onPointerCancel={release}
            onPointerLeave={(e) => e.pointerType === "mouse" && release()}
          >
            {/* The date under the finger, riding the crosshair */}
            {hover != null && (
              <div
                className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-full bg-fg px-2.5 py-1 text-[0.68rem] font-extrabold text-bg shadow-lg"
                style={{ left: Math.max(48, Math.min(width - 48, xAt(hover))) }}
              >
                {dayLabel(dates[hover]!, true)}
              </div>
            )}
            <div className="space-y-3 pt-6">
              {shown.map((def, k) => {
                const d = data.get(def.id);
                if (!d) return null;
                return (
                  <Pane
                    key={def.id}
                    def={def}
                    color={palette[def.slot - 1]!}
                    points={d.points}
                    trend={d.trend}
                    stats={d.stats}
                    width={width}
                    height={k === 0 ? 190 : 140}
                    hover={hover}
                    xAt={xAt}
                    dark={dark}
                  />
                );
              })}
            </div>
            {/* One time axis for every pane */}
            <div className="relative mt-1 h-5 text-[0.62rem] font-semibold text-faint">
              {xTicks.map((i) => (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 whitespace-nowrap tabular"
                  style={{ left: Math.max(18, Math.min(width - PAD_R - 4, xAt(i))) }}
                >
                  {dayLabel(dates[i]!)}
                </span>
              ))}
            </div>
            <p className="mt-3 text-center text-[0.65rem] text-faint">
              Drag across the charts to read any day · <span className="tracking-widest">— —</span> target (TGT) ·{" "}
              <span className="tracking-widest">· · ·</span> minimum (MIN)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Pane({
  def, color, points, trend, stats, width, height, hover, xAt, dark,
}: {
  def: SeriesDef;
  color: string;
  points: Point[];
  trend: (number | null)[] | null;
  stats: ReturnType<typeof statsOf>;
  width: number;
  height: number;
  hover: number | null;
  xAt: (i: number) => number;
  dark: boolean;
}) {
  const id = `g-${def.id}`;
  const values = points.map((p) => p.value);
  const refs = points.flatMap((p) => [p.target, p.min]).filter((v): v is number => v != null);
  const all = [...values.filter((v): v is number => v != null), ...refs, ...(trend ?? []).filter((v): v is number => v != null)];
  const has = values.some((v) => v != null);
  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 1;
  if (def.bars) {
    lo = 0;
    hi = hi * 1.15 || 1;
  } else if (def.id === "score" || def.id === "habits") {
    lo = Math.min(lo, 40);
    hi = 100;
  } else {
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
    lo = Math.max(0, lo - pad);
    hi = hi + pad;
  }
  const plotH = height - PAD_T - PAD_B;
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const yAt = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  // The line, broken at days with nothing logged.
  const segs: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v == null) {
      // A measure logged now and then (weight) is drawn through its gaps.
      if (def.connect) return;
      if (cur) segs.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const line = segs.join(" ");
  // The fill under each unbroken run.
  const areas = segs.map((seg) => {
    const pts = seg.slice(1).split(/L/);
    const first = pts[0]!.split(",")[0];
    const last = pts[pts.length - 1]!.split(",")[0];
    return `${seg} L${last},${PAD_T + plotH} L${first},${PAD_T + plotH} Z`;
  });

  const stepPath = (key: "target" | "min") => {
    let p = "";
    points.forEach((pt, i) => {
      const v = pt[key];
      if (v == null) return;
      p += `${p ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
    });
    return p;
  };
  const lastWith = (key: "target" | "min") => [...points].reverse().find((p) => p[key] != null)?.[key] ?? null;
  const target = lastWith("target");
  const floor = lastWith("min");
  const trendPath = trend
    ? trend.reduce((acc, v, i) => (v == null ? acc : `${acc}${acc ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`), "")
    : "";

  // The headline: the hovered day, or the latest value.
  const hv = hover != null ? points[hover]?.value ?? null : null;
  const headline = hover != null ? hv : stats.latest;
  const lastIdx = values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
  const grid = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const ink = dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
  const yTicks = ticks(lo, hi);
  /** Where the value tag sits right now (hovered day, else latest) — it wins over a target tag. */
  const tagAt = hover != null ? hv : lastIdx != null ? values[lastIdx] ?? null : null;
  const up = (stats.change ?? 0) >= 0;

  return (
    <section className="rounded-3xl border border-border bg-surface p-3 pb-1" aria-label={def.label}>
      <header className="mb-1 flex items-end justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-muted">
            <span className="size-2 rounded-full" style={{ background: color }} />
            {def.label}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-display text-[1.7rem] font-extrabold leading-tight tabular">{fmt(headline, def.decimals)}</span>
            {def.unit && <span className="text-xs font-bold text-muted">{def.unit}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right text-[0.68rem] leading-tight">
          <div className="text-muted">
            avg <b className="text-fg tabular">{fmt(stats.average, def.decimals)}</b>
          </div>
          {stats.change != null && Number.isFinite(stats.change) && (
            <div className="flex items-center justify-end gap-0.5 font-bold text-muted">
              {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(stats.change).toFixed(0)}% vs before
            </div>
          )}
          {stats.onTarget && (
            <div className="text-faint">
              {stats.onTarget.hit}/{stats.onTarget.of} days ≥ min
            </div>
          )}
        </div>
      </header>

      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`${def.label} over time`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Recessive grid and the right-hand price axis */}
        {yTicks.map((t) => {
          // A tick label under a target, minimum or value tag would be unreadable.
          const busy = [target, floor, hover == null && lastIdx != null ? values[lastIdx] : hv]
            .some((v) => v != null && Math.abs(yAt(v) - yAt(t)) < 16);
          return (
            <g key={t}>
              <line x1={PAD_L} x2={width - PAD_R} y1={yAt(t)} y2={yAt(t)} stroke={grid} />
              {!busy && (
                <text x={width - PAD_R + 8} y={yAt(t) + 3.5} fontSize={10} fill={ink} className="tabular">
                  {fmt(t, t % 1 ? 1 : 0)}
                </text>
              )}
            </g>
          );
        })}

        {/* Target (dashed) and minimum (dotted), each with an outlined tag on
            the axis in the same stroke — the plot itself stays clear. */}
        {target != null && <path d={stepPath("target")} fill="none" stroke={ink} strokeWidth={1.25} strokeDasharray="6 5" />}
        {floor != null && (
          <path d={stepPath("min")} fill="none" stroke={ink} strokeWidth={1.25} strokeDasharray="1.5 4" strokeLinecap="round" />
        )}
        {[
          { v: target, dash: "4 3", tag: "TGT" },
          { v: floor, dash: "1.5 2.5", tag: "MIN" },
        ].map((r) =>
          r.v == null || (tagAt != null && Math.abs(yAt(r.v) - yAt(tagAt)) < 19) ? null : (
            <g key={r.tag}>
              <rect
                x={width - PAD_R + 2}
                y={yAt(r.v) - 9}
                width={PAD_R - 4}
                height={18}
                rx={6}
                fill={dark ? "#121214" : "#fff"}
                stroke={ink}
                strokeDasharray={r.dash}
              />
              <text x={width - PAD_R / 2} y={yAt(r.v) + 3.5} fontSize={9.5} fontWeight={800} fill={ink} textAnchor="middle" className="tabular">
                {fmt(r.v, r.v >= 100 ? 0 : def.decimals)}
              </text>
            </g>
          ),
        )}

        {has && def.bars ? (
          values.map((v, i) => {
            if (v == null) return null;
            const w = Math.max(3, Math.min(14, (plotW / values.length) * 0.6));
            const top = yAt(v);
            return (
              <rect
                key={i}
                x={xAt(i) - w / 2}
                y={top}
                width={w}
                height={Math.max(2, PAD_T + plotH - top)}
                rx={Math.min(4, w / 2)}
                fill={color}
                fillOpacity={hover == null || hover === i ? 1 : 0.45}
              />
            );
          })
        ) : has ? (
          <>
            {areas.map((a, i) => (
              <path key={i} d={a} fill={`url(#${id})`} />
            ))}
            {trendPath && (
              <path d={trendPath} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 3" />
            )}
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* A lone day shows as a dot, not an invisible zero-length line */}
            {values.map((v, i) =>
              v != null && !def.connect && values[i - 1] == null && values[i + 1] == null ? (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r={3} fill={color} />
              ) : null,
            )}
            {/* The last value, tagged on the axis like a live price */}
            {hover == null && lastIdx != null && values[lastIdx] != null && (
              <>
                <circle cx={xAt(lastIdx)} cy={yAt(values[lastIdx]!)} r={4.5} fill={color} stroke={dark ? "#1a1a19" : "#fff"} strokeWidth={2} />
                <rect x={width - PAD_R + 2} y={yAt(values[lastIdx]!) - 9} width={PAD_R - 4} height={18} rx={6} fill={color} />
                <text x={width - PAD_R / 2} y={yAt(values[lastIdx]!) + 3.5} fontSize={10} fontWeight={800} fill="#fff" textAnchor="middle" className="tabular">
                  {fmt(values[lastIdx]!, def.decimals > 0 && values[lastIdx]! >= 100 ? 0 : def.decimals)}
                </text>
              </>
            )}
          </>
        ) : (
          <text x={(width - PAD_R) / 2} y={height / 2} fontSize={12} fill={ink} textAnchor="middle">
            Nothing logged in this range
          </text>
        )}

        {/* The crosshair */}
        {hover != null && (
          <>
            <line x1={xAt(hover)} x2={xAt(hover)} y1={0} y2={height} stroke={dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)"} strokeWidth={1} />
            {hv != null && (
              <>
                <line x1={PAD_L} x2={width - PAD_R} y1={yAt(hv)} y2={yAt(hv)} stroke={dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"} strokeDasharray="2 3" />
                <circle cx={xAt(hover)} cy={yAt(hv)} r={5} fill={color} stroke={dark ? "#1a1a19" : "#fff"} strokeWidth={2} />
                <rect x={width - PAD_R + 2} y={yAt(hv) - 9} width={PAD_R - 4} height={18} rx={6} fill={dark ? "#fff" : "#111"} />
                <text x={width - PAD_R / 2} y={yAt(hv) + 3.5} fontSize={10} fontWeight={800} fill={dark ? "#111" : "#fff"} textAnchor="middle" className="tabular">
                  {fmt(hv, def.decimals > 0 && hv >= 100 ? 0 : def.decimals)}
                </text>
              </>
            )}
          </>
        )}
      </svg>
    </section>
  );
}

function DataTable({
  dates, shown, data,
}: {
  dates: string[];
  shown: SeriesDef[];
  data: Map<SeriesId, { points: Point[] }>;
}) {
  const rows = [...dates.keys()].reverse();
  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-surface">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[0.62rem] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 font-extrabold">Day</th>
            {shown.map((s) => (
              <th key={s.id} className="px-3 py-2 text-right font-extrabold">
                {s.label}
                {s.unit ? ` (${s.unit})` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={dates[i]} className="border-b border-border/50 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-semibold">{dayLabel(dates[i]!, true)}</td>
              {shown.map((s) => (
                <td key={s.id} className="px-3 py-2 text-right tabular">
                  {fmt(data.get(s.id)?.points[i]?.value ?? null, s.decimals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
