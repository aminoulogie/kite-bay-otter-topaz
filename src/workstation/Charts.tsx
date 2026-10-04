import { useEffect, useRef, useState } from "react";

/** Width of an element, kept current. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round-ish axis ticks: 0 … max in 3–4 steps. */
function ticks(max: number): number[] {
  if (!(max > 0)) return [0];
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1]! < max) out.push(out[out.length - 1]! + step);
  return out;
}

export interface BarDatum {
  key: string;
  label: string;
  value: number | null;
  /** Extra line in the tooltip. */
  note?: string;
}

const PAD = { l: 44, r: 12, t: 10, b: 22 };
/** Bar charts with a goal keep room on the right for its label. */
const GOAL_GUTTER = 64;

/**
 * Bars on one axis from zero, with an optional dashed goal line. Rounded at
 * the data end, square at the baseline, a 2px gap between bars, and a tooltip
 * on hover over the whole column.
 */
export function BarChart({
  data,
  goal,
  goalLabel = "Goal",
  format = (n) => Math.round(n).toLocaleString(),
  height = 180,
  color = "var(--ws-blue)",
  every = 1,
}: {
  data: BarDatum[];
  goal?: number | null;
  goalLabel?: string;
  format?: (n: number) => string;
  height?: number;
  color?: string;
  /** Label every n-th bar on the axis. */
  every?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value ?? 0)) * 1.05;
  const t = ticks(max);
  const top = t[t.length - 1] || 1;
  const iw = Math.max(10, width - PAD.l - (goal ? GOAL_GUTTER : PAD.r));
  const ih = height - PAD.t - PAD.b;
  const col = iw / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(28, col - 2));
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const r = Math.min(4, bw / 2);

  return (
    <div ref={ref} className="ws-chart" style={{ height }} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="Bar chart">
        {t.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + iw} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
              {format(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.l + i * col + (col - bw) / 2;
          const v = d.value ?? 0;
          const h = Math.max(0, PAD.t + ih - y(v));
          const y0 = PAD.t + ih;
          return (
            <g key={d.key}>
              {d.value !== null && h > 0 && (
                <path
                  d={`M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + bw - r} Q${x + bw},${y0 - h} ${x + bw},${y0 - h + r} V${y0} Z`}
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % every === 0 && (
                <text x={x + bw / 2} y={height - 6} textAnchor="middle" className="axis">
                  {d.label}
                </text>
              )}
              <rect
                x={PAD.l + i * col}
                y={PAD.t}
                width={col}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
        {goal ? (
          <g>
            <line x1={PAD.l} x2={PAD.l + iw} y1={y(goal)} y2={y(goal)} className="goal" />
            <text x={PAD.l + iw + 6} y={y(goal) - 2} className="axis goal-label">
              {goalLabel}
            </text>
            <text x={PAD.l + iw + 6} y={y(goal) + 11} className="axis goal-label">
              {format(goal)}
            </text>
          </g>
        ) : null}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="ws-tip"
          style={{
            left: Math.min(width - 150, Math.max(0, PAD.l + hover * col + col / 2 - 70)),
            top: 0,
          }}
        >
          <b>{data[hover]!.value === null ? "Nothing logged" : format(data[hover]!.value!)}</b>
          <span>{data[hover]!.note ?? data[hover]!.label}</span>
          {goal && data[hover]!.value !== null ? (
            <span>
              {Math.round((data[hover]!.value! / goal) * 100)}% of {goalLabel.toLowerCase()}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * One series as a 2px line over days, gaps where nothing was logged, with a
 * crosshair and tooltip that follow the pointer.
 */
export function LineChart({
  data,
  format = (n) => n.toFixed(1),
  height = 180,
  color = "var(--ws-blue)",
  every = 7,
  unit = "",
}: {
  data: BarDatum[];
  format?: (n: number) => string;
  height?: number;
  color?: string;
  every?: number;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map((d) => d.value).filter((v): v is number => v !== null);
  if (!vals.length) return <div className="ws-empty">Nothing logged in this period.</div>;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max(0.5, (hi - lo) * 0.15);
  const min = lo - pad;
  const max = hi + pad;
  const iw = Math.max(10, width - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - ((v - min) / (max - min)) * ih;
  // Logged days join up; the line only breaks across a gap of more than a
  // week, where drawing straight through would invent a trend.
  const segs: string[] = [];
  let cur = "";
  let last = -1;
  data.forEach((d, i) => {
    if (d.value === null) return;
    if (cur && i - last > 7) {
      segs.push(cur);
      cur = "";
    }
    cur += `${cur ? "L" : "M"}${x(i)},${y(d.value)}`;
    last = i;
  });
  if (cur) segs.push(cur);
  const grid = [min + (max - min) * 0.2, min + (max - min) * 0.5, min + (max - min) * 0.8];
  const h = hover !== null ? data[hover] : null;

  return (
    <div
      ref={ref}
      className="ws-chart"
      style={{ height }}
      onMouseMove={(e) => {
        const rx = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.l;
        let i = Math.round((rx / iw) * (data.length - 1));
        i = Math.max(0, Math.min(data.length - 1, i));
        // Snap to the nearest logged day.
        let best = -1;
        for (let k = 0; k < data.length; k++)
          if (data[k]!.value !== null && (best < 0 || Math.abs(k - i) < Math.abs(best - i)))
            best = k;
        setHover(best >= 0 ? best : null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={width} height={height} role="img" aria-label="Line chart">
        {grid.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + iw} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
              {format(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 ? (
            <text key={d.key} x={x(i)} y={height - 6} textAnchor="middle" className="axis">
              {d.label}
            </text>
          ) : null,
        )}
        {segs.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {data.map((d, i) =>
          d.value !== null && segs.length && data.filter((z) => z.value !== null).length < 25 ? (
            <circle key={d.key} cx={x(i)} cy={y(d.value)} r={2.5} fill={color} />
          ) : null,
        )}
        {h && h.value !== null && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={PAD.t + ih} className="cross" />
            <circle
              cx={x(hover!)}
              cy={y(h.value)}
              r={5}
              fill={color}
              stroke="var(--ws-panel)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {h && h.value !== null && (
        <div
          className="ws-tip"
          style={{ left: Math.min(width - 150, Math.max(0, x(hover!) - 70)), top: 0 }}
        >
          <b>
            {format(h.value)}
            {unit}
          </b>
          <span>{h.note ?? h.label}</span>
        </div>
      )}
    </div>
  );
}
