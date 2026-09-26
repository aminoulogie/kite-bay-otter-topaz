import { createContext, useContext } from "react";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import type { WidgetSize } from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

/**
 * A widget at a small size: what it SAYS, not a crop of its full card.
 *
 * The four small sizes are the ones a widget cannot simply draw its card
 * into: 1x1 (a square, about 90 px), 1x2 (half a row), 2x2 (half a phone,
 * two rows) and 1x4 (a strip across the page). Like a home-screen widget,
 * each one says less the smaller it gets:
 *
 *   1x1  — a short label and the one number. With a picture (rings), the picture.
 *   1x2  — adds the unit and one supporting line, or the picture beside it.
 *   2x2  — adds progress and up to four lines of a list.
 *   1x4  — all of that laid out across: headline left, detail right.
 *
 * Tapping a glance opens the whole card in a sheet (see WidgetGrid), so
 * choosing a small size never costs a feature — only screen space.
 */
export type GlanceSize = "1x1" | "1x2" | "2x2" | "1x4";

export function isGlance(size: WidgetSize): size is GlanceSize {
  return size === "1x1" || size === "1x2" || size === "2x2" || size === "1x4";
}

export interface GlanceLine {
  text: string;
  /** Ticked off. */
  done?: boolean;
  /** Right-hand figure, e.g. "18/18". */
  value?: string;
  /** A colour dot before the text (a ring, a macro). */
  color?: string;
}

/** A figure in a small grid of figures (the four rings' numbers). */
export interface GlanceStat {
  label: string;
  value: string;
  /** "/2300": drawn smaller, and dropped first when space runs out. */
  of?: string;
  color?: string;
}

export interface GlanceSpec {
  label: string;
  /** For 1x1, where a long label would be cut: "Score" for "Today's score". */
  short?: string;
  icon?: LucideIcon;
  /** The widget's own colour: the label bar and the progress bar. */
  color?: string;
  /** The headline. Absent means nothing is logged: `empty` is shown instead. */
  value?: string | null;
  unit?: string;
  /** Extra classes for the headline, e.g. a rating colour. */
  valueClass?: string;
  /** One supporting line: "of 2300", "3 left", a date. */
  sub?: string | null;
  /** 0–1. */
  progress?: number | null;
  /** Target met: a tick. */
  done?: boolean;
  /** A short list, for widgets that ARE a list. */
  lines?: GlanceLine[];
  /** Figures side by side, for widgets that are several numbers at once. */
  stats?: GlanceStat[];
  /** A trend, oldest first; gaps are null. Drawn as a line where there is room. */
  chart?: { values: (number | null)[]; target?: number | null };
  /** What to say when there is no value and no lines. */
  empty?: string;
  /** The same, in two or three words, for 1x1. */
  emptyShort?: string;
  /** A picture that carries the widget (rings): drawn at the size it is given, in px. */
  visual?: (px: number) => React.ReactNode;
  /** Instead of opening the full card. */
  onOpen?: () => void;
  /** Screen-reader summary; defaults to label + value + sub. */
  aria?: string;
}

/** Set by the grid: opens this widget's full card in a sheet. */
export const GlanceOpenContext = createContext<(() => void) | null>(null);

/** A headline that fits its box: fewer characters, bigger type. */
function fit(text: string, sizes: [number, number, number]): string {
  const n = text.length;
  return n <= 3 ? `${sizes[0]}rem` : n <= 5 ? `${sizes[1]}rem` : `${sizes[2]}rem`;
}

export function Glance({ size, spec }: { size: GlanceSize; spec: GlanceSpec }) {
  const open = useContext(GlanceOpenContext);
  const onClick = spec.onOpen ?? open ?? undefined;
  const { icon: Icon, color, value, unit, sub, progress, done, lines, stats, visual } = spec;
  const hasValue = value != null && value !== "";
  const listed = (lines ?? []).filter((l) => l.text);
  const empty = spec.empty ?? "Nothing yet";
  const label = size === "1x1" ? spec.short ?? spec.label : spec.label;
  const aria =
    spec.aria ??
    [spec.label, hasValue ? `${value}${unit ? ` ${unit}` : ""}` : empty, sub].filter(Boolean).join(", ");

  const tick = (
    <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
      <Check className="size-2.5" strokeWidth={3.4} />
    </span>
  );

  const head = (
    <div className="flex min-w-0 items-center gap-1.5 text-[0.58rem] font-bold uppercase leading-none tracking-wider text-faint">
      {Icon ? (
        <Icon aria-hidden className="size-3 shrink-0" style={color ? { color } : undefined} />
      ) : color ? (
        <span aria-hidden className="h-2.5 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
      {done && size !== "1x1" && <span className="ml-auto">{tick}</span>}
    </div>
  );

  const headline = (sizes: [number, number, number], emptyText = empty) =>
    hasValue ? (
      <div
        className={cn("flex min-w-0 items-baseline gap-1 font-extrabold leading-none tabular", spec.valueClass)}
        style={{ fontSize: fit(value!, sizes) }}
      >
        <span className="min-w-0 truncate">{value}</span>
        {unit && !(size === "1x1" && unit.length > 6) && (
          <span className="shrink-0 text-[0.45em] font-bold text-faint">{unit}</span>
        )}
        {done && size === "1x1" && <span className="ml-auto self-center text-[0.6rem]">{tick}</span>}
      </div>
    ) : (
      <div className="min-w-0 text-[0.72rem] font-semibold leading-snug text-muted line-clamp-2">{emptyText}</div>
    );

  const bar =
    progress != null ? (
      <div className="h-1 w-full shrink-0 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: color ?? "var(--color-accent)" }}
        />
      </div>
    ) : null;

  // A progress figure is drawn as a ring with the number inside, the shape a
  // small home-screen widget uses: it reads at a glance where a thin bar and
  // a number side by side ask you to compare two things.
  const tint = color ?? "var(--color-accent)";
  const gauge = (px: number, withLabel: boolean) => {
    const w = Math.max(5, Math.round(px / 9));
    const r = (px - w) / 2;
    const c = 2 * Math.PI * r;
    const f = Math.max(0, Math.min(1, progress ?? 0));
    const text = hasValue ? value! : spec.emptyShort && spec.emptyShort.length <= 4 ? spec.emptyShort : "0";
    return (
      <div className="relative shrink-0" style={{ width: px, height: px }}>
        <svg viewBox={`0 0 ${px} ${px}`} className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke={tint} strokeOpacity={0.2} strokeWidth={w} />
          {f > 0 && (
            <circle
              cx={px / 2}
              cy={px / 2}
              r={r}
              fill="none"
              stroke={tint}
              strokeWidth={w}
              strokeLinecap="round"
              strokeDasharray={`${c * f} ${c}`}
              className="soma-ring-grow"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span
            className={cn("font-extrabold tabular", !hasValue && "text-faint", spec.valueClass)}
            style={{ fontSize: `${Math.min(px * 0.3, (px * 0.62) / Math.max(2.2, text.length * 0.62))}px` }}
          >
            {text}
          </span>
          {withLabel && (unit || done) && (
            <span className="mt-0.5 text-[0.5rem] font-bold uppercase tracking-wide text-faint">
              {done ? "✓ done" : unit}
            </span>
          )}
        </div>
      </div>
    );
  };
  // Only a real figure gets a ring: an empty ring round a "0" says less than
  // the sentence explaining why there is nothing yet.
  const gaugeable = progress != null && hasValue && !visual && !stats;

  const list = (n: number, compact = false) =>
    listed.length > 0 && (
      <ul className={cn("min-w-0", compact ? "space-y-0.5" : "space-y-1")}>
        {listed.slice(0, n).map((l, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5 text-[0.7rem] leading-tight">
            {l.color && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: l.color }} />}
            {l.done != null && (
              <span
                aria-hidden
                className={cn(
                  "grid size-3 shrink-0 place-items-center rounded-full border",
                  l.done ? "border-accent bg-accent text-accent-ink" : "border-fg/35",
                )}
              >
                {l.done && <Check className="size-2" strokeWidth={3.4} />}
              </span>
            )}
            <span className={cn("min-w-0 flex-1 truncate", l.done ? "text-faint line-through" : "text-fg")}>{l.text}</span>
            {l.value && <span className="shrink-0 tabular text-[0.65rem] font-bold text-muted">{l.value}</span>}
          </li>
        ))}
        {listed.length > n && <li className="text-[0.6rem] font-bold text-faint">+{listed.length - n} more</li>}
      </ul>
    );

  const statGrid = (cols: number, labelled: boolean, withOf = true) =>
    stats && stats.length > 0 && (
      <div className="grid min-w-0 gap-x-3 gap-y-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {stats.map((st) => (
          <div key={st.label} className="min-w-0">
            {labelled && (
              <div className="truncate text-[0.55rem] font-bold uppercase tracking-wide text-faint">{st.label}</div>
            )}
            <div className="truncate text-[0.78rem] font-extrabold leading-tight tabular" style={{ color: st.color }}>
              {st.value}
              {withOf && st.of && <span className="text-[0.62rem] text-faint">{st.of}</span>}
            </div>
          </div>
        ))}
      </div>
    );

  const spark = (h: number) => {
    const vals = spec.chart?.values ?? [];
    const pts = vals.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
    if (pts.length < 2) return null;
    const t = spec.chart?.target ?? null;
    const lo = Math.min(...pts.map((p) => p.v), t ?? Infinity);
    const hi = Math.max(...pts.map((p) => p.v), t ?? -Infinity);
    const span = hi - lo || 1;
    const W = 100;
    const x = (i: number) => (i / Math.max(1, vals.length - 1)) * W;
    const y = (v: number) => h - 2 - ((v - lo) / span) * (h - 4);
    const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1]!;
    return (
      <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }} aria-hidden>
        {t != null && (
          <line x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        <path d={`${d} L${x(last.i)},${h} L${x(pts[0]!.i)},${h} Z`} fill={tint} fillOpacity={0.14} />
        <path d={d} fill="none" stroke={tint} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };
  const charted = !!spec.chart && (spec.chart.values.filter((v) => v != null).length >= 2);

  // What a list-shaped widget says at 1x1: how many are still open.
  const stillOpen = listed.filter((l) => !l.done).length;

  let body: React.ReactNode;
  if (size === "1x1" && gaugeable) {
    body = (
      <div className="flex h-full flex-col items-center justify-between">
        <div className="w-full">{head}</div>
        {gauge(52, false)}
      </div>
    );
  } else if (size === "1x1") {
    body = visual ? (
      <div className="flex h-full items-center justify-center">{visual(58)}</div>
    ) : (
      <div className="flex h-full flex-col justify-between gap-1">
        {head}
        {hasValue ? (
          headline([1.45, 1.2, 0.95])
        ) : listed.length && listed.some((l) => l.done != null) ? (
          <div className="flex items-baseline gap-1 font-extrabold leading-none tabular">
            <span className="text-[1.45rem]">{stillOpen}</span>
            <span className="text-[0.62rem] font-bold text-faint">left</span>
          </div>
        ) : listed.length ? (
          // A list that is not a to-do list (recent foods, rules): its first
          // entry, which is the one the full card would show at the top.
          <div className="line-clamp-2 text-[0.74rem] font-bold leading-snug">{listed[0]!.text}</div>
        ) : (
          headline([1, 1, 1], spec.emptyShort ?? empty)
        )}
        {bar}
      </div>
    );
  } else if (size === "1x2" && gaugeable) {
    body = (
      <div className="flex h-full min-w-0 items-center gap-3">
        {gauge(58, true)}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {head}
          {sub && <div className="line-clamp-2 text-[0.8rem] font-bold leading-snug tabular">{sub}</div>}
        </div>
      </div>
    );
  } else if (size === "1x2") {
    body = (
      <div className="flex h-full min-w-0 items-center gap-3">
        {visual && <div className="shrink-0">{visual(58)}</div>}
        <div className="flex h-full min-w-0 flex-1 flex-col justify-between gap-1">
          {!visual && head}
          {stats && visual ? (
            <div className="my-auto">{statGrid(2, false, false)}</div>
          ) : hasValue || !listed.length ? (
            headline([1.6, 1.5, 1.2])
          ) : (
            list(1)
          )}
          {!(stats && visual) && (charted ? <div className="text-fg">{spark(18)}</div> : bar ?? (sub ? <div className="truncate text-[0.62rem] tabular text-faint">{sub}</div> : null))}
        </div>
      </div>
    );
  } else if (size === "2x2") {
    body = (
      <div className="flex h-full min-w-0 flex-col gap-2">
        {visual ? <div className="flex justify-center [&>div]:justify-center">{head}</div> : head}
        {visual ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5">
            {visual(stats ? 92 : 112)}
            {stats && <div className="w-full text-center">{statGrid(2, false)}</div>}
          </div>
        ) : charted ? (
          <>
            {headline([1.7, 1.55, 1.3])}
            {sub && <div className="-mt-1 truncate text-[0.64rem] tabular text-faint">{sub}</div>}
            <div className="mt-auto text-fg">{spark(64)}</div>
          </>
        ) : gaugeable && !listed.length ? (
          <>
            <div className="flex min-h-0 flex-1 items-center justify-center">{gauge(96, true)}</div>
            {sub ? (
              <div className="truncate text-center text-[0.66rem] tabular text-faint">{sub}</div>
            ) : (
              !hasValue && <div className="truncate text-center text-[0.66rem] text-faint">{empty}</div>
            )}
          </>
        ) : listed.length || stats ? (
          <>
            {hasValue && headline([1.6, 1.5, 1.25])}
            {bar}
            {statGrid(2, true)}
            <div className="min-h-0 flex-1 overflow-hidden">{list(hasValue ? 3 : 5)}</div>
          </>
        ) : (
          // One figure: it takes the middle of the tile, the detail sits at
          // the foot — a single number floating at the top of an empty
          // square reads as something failed to load.
          <>
            <div className="flex min-h-0 flex-1 items-center">{headline([2.6, 2.2, 1.7])}</div>
            <div className="space-y-1.5">
              {sub && <div className="truncate text-[0.68rem] tabular text-faint">{sub}</div>}
              {bar}
            </div>
          </>
        )}
      </div>
    );
  } else {
    body = (
      <div className="flex h-full min-w-0 items-center gap-3">
        {visual && <div className="shrink-0">{visual(60)}</div>}
        {gaugeable && gauge(56, false)}
        {stats && visual ? (
          <div className="min-w-0 flex-1">{statGrid(4, true, false)}</div>
        ) : (
          <>
            <div className="flex min-w-0 max-w-[45%] shrink-0 flex-col justify-center gap-1.5">
              {head}
              {gaugeable ? (
                sub && <div className="line-clamp-2 text-[0.85rem] font-bold leading-snug tabular">{sub}</div>
              ) : hasValue || !listed.length ? (
                headline([1.6, 1.5, 1.25])
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              {hasValue || !listed.length ? (
                <>
                  {sub && !gaugeable && <div className="truncate text-[0.68rem] tabular text-muted">{sub}</div>}
                  {charted && <div className="text-fg">{spark(28)}</div>}
                  {!gaugeable && !charted && bar}
                  {!sub && statGrid(2, true)}
                  {!bar && !charted && list(sub ? 1 : 2, true)}
                </>
              ) : (
                list(2, true)
              )}
            </div>
          </>
        )}
        {onClick && <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-glance={size}
      onClick={onClick}
      aria-label={aria}
      style={
        color
          ? { backgroundImage: `linear-gradient(145deg, color-mix(in srgb, ${color} 13%, transparent), transparent 62%)` }
          : undefined
      }
      className={cn(
        "glass-card block h-full w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-surface text-left active:bg-surface-2",
        size === "1x1" ? "p-2.5" : "p-3",
      )}
    >
      {body}
    </button>
  );
}
