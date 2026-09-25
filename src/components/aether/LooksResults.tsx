import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, RotateCcw, Triangle } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Face3DView, type Face3DHandle } from "@/components/aether/Face3DView";
import { compareCyl, faceWindow, mergeCyl, type Cylinder } from "@/lib/aether/cylmap";
import { buildMesh, tidy, type MeshData } from "@/lib/aether/cylmesh";
import { alignOnAnchors } from "@/lib/aether/align3d";
import { decodeFloat32 } from "@/lib/aether/mesh3d";
import { METRICS, baselinePair, format, rows, series, sweepScans, type Group, type MetricDef, type Row } from "@/lib/aether/results";
import { cylKey, type ScanRecord } from "@/lib/aether/scan-store";
import { loadScanImage } from "@/lib/habit-photos";
import { cn } from "@/lib/utils";

interface Stored {
  a: string;
  b: string;
  width: number;
  height: number;
  thetaMinDeg: number;
  thetaStepDeg: number;
  yMinMm: number;
  yStepMm: number;
  eyeYMm: number;
}

/** The cylinder's axis behind the face origin, as the Swift scan uses it. */
const AXIS_Z = -60;

async function loadCylinder(id: string): Promise<{ c: Cylinder; eye: number } | null> {
  const raw = await loadScanImage(cylKey(id));
  if (!raw) return null;
  const p = JSON.parse(raw) as Stored;
  return {
    c: {
      a: decodeFloat32(p.a), b: decodeFloat32(p.b), width: p.width, height: p.height,
      thetaMinDeg: p.thetaMinDeg, thetaStepDeg: p.thetaStepDeg, yMinMm: p.yMinMm, yStepMm: p.yStepMm,
    },
    eye: p.eyeYMm,
  };
}

const GROUP_ICON: Record<Group, string> = { Face: "◠", "Side profile": "◖", Neck: "⌒", Posture: "⟂" };
const RANGES = [
  { label: "1W", ms: 7 * 864e5 },
  { label: "1M", ms: 30 * 864e5 },
  { label: "3M", ms: 90 * 864e5 },
  { label: "ALL", ms: Infinity },
] as const;

/**
 * Looks → Results: the latest full scan as a 3D model, the numbers grouped as
 * Face / Side profile / Neck / Posture with their ± and change since the
 * first scan, a chart for any number tapped, and before / after.
 */
export function LooksResults({
  scans,
  onScan,
  scanning,
  setupGuide,
}: {
  scans: ScanRecord[];
  onScan: () => void;
  scanning: boolean;
  setupGuide: React.ReactNode;
}) {
  const sweeps = useMemo(() => sweepScans(scans), [scans]);
  const latest = sweeps[sweeps.length - 1] ?? null;
  const first = sweeps.length > 1 ? sweeps[0]! : null;
  const table = useMemo(() => rows(sweeps), [sweeps]);
  const [heatmap, setHeatmap] = useState(true);
  const [mesh, setMesh] = useState<MeshData | null>(null);
  const [meshNote, setMeshNote] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [metric, setMetric] = useState<string>("lean");
  const [range, setRange] = useState<(typeof RANGES)[number]["label"]>("ALL");
  const viewer = useRef<Face3DHandle>(null);

  // The model: the latest scan's surface, coloured by change since the first.
  useEffect(() => {
    let cancelled = false;
    setMesh(null);
    if (!latest) return;
    void (async () => {
      const now = await loadCylinder(latest.id);
      if (cancelled) return;
      if (!now) {
        setMeshNote("This scan's 3D surface is not on this phone (restored from a backup?).");
        return;
      }
      let map = mergeCyl(now.c);
      let before: Parameters<typeof buildMesh>[4];
      if (first) {
        const old = await loadCylinder(first.id);
        if (old && old.c.width === now.c.width && old.c.height === now.c.height) {
          const oldMap = mergeCyl(old.c);
          const eye = (old.eye + now.eye) / 2;
          // Moved onto the first scan by forehead and nose bridge, so the
          // colours show the face changing, not the head held differently.
          const aligned = alignOnAnchors(oldMap, map, now.c, AXIS_Z, eye);
          if (aligned) map = aligned.map;
          const ch = compareCyl(oldMap, map, now.c, faceWindow(eye));
          const noise = latest.depth?.sweep?.cellNoiseMm ?? 0.5;
          // Colour only where both halves of this scan agree within 2 mm, so
          // thin, noisy areas (chest, grazing edges) do not flash red and green.
          const reliable = (k: number) => Math.abs(now.c.a[k]! - now.c.b[k]!) <= 2;
          if (ch?.shift)
            before = { map: oldMap, di: ch.shift.di, dj: ch.shift.dj, meanMm: ch.shift.meanMm, noiseMm: 2 * Math.SQRT2 * noise, reliable };
        }
      }
      if (cancelled) return;
      setMeshNote(first ? null : "Take a second full scan to see the heatmap of change.");
      setMesh(buildMesh(tidy(map, now.c), now.c, AXIS_Z, 2, before));
    })();
    return () => {
      cancelled = true;
    };
  }, [latest, first]);

  const def = METRICS.find((m) => m.key === metric && table.some((r) => r.def.key === m.key)) ?? table[0]?.def;
  const since = RANGES.find((r) => r.label === range)!.ms;
  const points = useMemo(
    () => (def ? series(sweeps, def, since === Infinity ? 0 : Date.now() - since) : []),
    [sweeps, def, since],
  );

  return (
    <div className="space-y-3 pb-4">
      <Steps
        active={latest ? 3 : 1}
        onSetup={() => setShowSetup((v) => !v)}
        onScan={onScan}
        scanning={scanning}
      />
      {showSetup && setupGuide}

      <div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight">Looks</h2>
        <p className="text-sm text-accent">{first ? "Changes since your first scan" : "Your latest full scan"}</p>
        {latest && (
          <p className="mt-1 text-[0.7rem] leading-snug text-faint">
            {(() => {
              const pair = baselinePair(sweeps);
              return pair
                ? `Repeatability measured from your back-to-back scans on ${pair[0].date}: a change smaller than those two scans' difference is shown as within noise.`
                : "Tip: do two full scans back to back once. Their difference becomes your real repeatability, and every change is judged against it.";
            })()}
          </p>
        )}
      </div>

      {!latest ? (
        <Card>
          <p className="text-sm text-muted">
            No full 3D scan yet. Set up your scan spot once, then run a full scan: face, both sides and neck.
          </p>
        </Card>
      ) : (
        <>
          <Card className="relative h-[22rem] overflow-hidden p-0">
            {mesh ? (
              <Face3DView ref={viewer} mesh={mesh} heatmap={heatmap && !!first} />
            ) : (
              <div className="grid size-full place-items-center px-6 text-center text-xs text-muted">
                {meshNote ?? "Building your model…"}
              </div>
            )}
            {first && (
              <div className="pointer-events-none absolute left-3 top-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setHeatmap((v) => !v)}
                  className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-black/50 px-3 py-1.5 text-xs font-bold backdrop-blur"
                >
                  Heatmap
                  <span className={cn("h-4 w-7 rounded-full p-0.5 transition-colors", heatmap ? "bg-accent" : "bg-surface-3")}>
                    <span className={cn("block size-3 rounded-full bg-white transition-transform", heatmap && "translate-x-3")} />
                  </span>
                </button>
                {heatmap && (
                  <div className="flex items-stretch gap-2 text-[0.6rem] font-bold text-white/80">
                    <span className="w-2 rounded-full bg-gradient-to-b from-emerald-400 via-slate-300 to-red-500" />
                    <span className="flex flex-col justify-between py-0.5">
                      <span>Fuller</span>
                      <span className="text-white/50">no change</span>
                      <span>Less</span>
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              {[
                ["Front", 0],
                ["L side", -90],
                ["R side", 90],
              ].map(([label, yaw]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => viewer.current?.view(yaw as number)}
                  className="rounded-full border border-border bg-black/50 px-2.5 py-1 text-[0.65rem] font-bold backdrop-blur"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => viewer.current?.reset()}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-border bg-black/50 px-3 py-1.5 text-xs font-bold backdrop-blur"
            >
              <RotateCcw className="size-3.5" /> Reset view
            </button>
          </Card>

          {(["Face", "Side profile", "Neck", "Posture"] as const).map((g) => {
            const items = table.filter((r) => r.def.group === g);
            if (!items.length) return null;
            return (
              <Card key={g} className="p-3">
                <div className="flex gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-lg text-muted">
                    {GROUP_ICON[g]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 font-display text-base font-bold">{g}</div>
                    {items.map((r) => (
                      <MetricRow key={r.def.key} r={r} active={def?.key === r.def.key} onPick={() => setMetric(r.def.key)} />
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}

          {def && (
            <Card className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display text-base font-bold">{def.label}</div>
                  <div className="text-[0.65rem] leading-snug text-faint">{def.about}</div>
                </div>
                <div className="flex shrink-0 rounded-full border border-border p-0.5">
                  {RANGES.map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => setRange(r.label)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.65rem] font-bold",
                        range === r.label ? "bg-accent text-accent-ink" : "text-muted",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {points.length < 2 ? (
                <p className="py-6 text-center text-xs text-muted">
                  {points.length ? "One scan in this range — a line needs two." : "No scans in this range."}
                </p>
              ) : (
                <div className="h-44" data-no-swipe-nav>
                  <ResponsiveContainer>
                    <ComposedChart data={points.map((p) => ({ ...p, band: [p.lo, p.hi] }))} margin={{ left: -18, right: 6, top: 6 }}>
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        tick={{ fontSize: 10, fill: "var(--color-faint)" }}
                        stroke="var(--color-border)"
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "var(--color-faint)" }}
                        stroke="var(--color-border)"
                        tickFormatter={(v: number) => v.toFixed(Math.min(def.digits, 1))}
                      />
                      <Tooltip
                        contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
                        labelFormatter={(t: number) => new Date(t).toLocaleDateString()}
                        formatter={(v: number | number[], name: string) =>
                          name === "band" && Array.isArray(v) ? [`${format(v[0]!, def)} – ${format(v[1]!, def)}`, "noise band"] : [format(v as number, def), "value"]
                        }
                      />
                      <Area dataKey="band" stroke="none" fill="var(--color-accent)" fillOpacity={0.15} isAnimationActive={false} />
                      <Line dataKey="v" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="mt-1 text-[0.6rem] text-faint">Shaded: the measurement noise of each scan. Moves inside it are not real change.</p>
            </Card>
          )}

          {first && def && <BeforeAfter first={first} latest={latest} def={def} />}
        </>
      )}
    </div>
  );
}

function Steps({
  active,
  onSetup,
  onScan,
  scanning,
}: {
  active: 1 | 2 | 3;
  onSetup: () => void;
  onScan: () => void;
  scanning: boolean;
}) {
  const steps = [
    { n: 1, label: "Setup", go: onSetup },
    { n: 2, label: scanning ? "Scanning…" : "Scan", go: onScan },
    { n: 3, label: "Results", go: () => {} },
  ] as const;
  return (
    <div className="flex items-start justify-between px-4 pt-1">
      {steps.map((s, i) => (
        <div key={s.n} className="flex flex-1 items-start">
          <button type="button" onClick={s.go} disabled={s.n === 2 && scanning} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full border-2 text-sm font-bold",
                s.n === active ? "border-accent bg-accent text-accent-ink" : "border-border text-muted",
              )}
            >
              {s.n}
            </span>
            <span className={cn("text-xs font-semibold", s.n === active ? "text-fg" : "text-muted")}>{s.label}</span>
          </button>
          {i < steps.length - 1 && <span className="mt-[1.1rem] h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function MetricRow({ r, active, onPick }: { r: Row; active: boolean; onPick: () => void }) {
  const d = r.def;
  const colour = r.verdict === "good" ? "text-emerald-400" : r.verdict === "bad" ? "text-red-400" : "text-muted";
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn("flex w-full items-center gap-2 rounded-lg py-1.5 text-left", active && "bg-surface-2/60")}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.85rem] leading-tight">{d.label}</span>
        <span className="mt-0.5 inline-block rounded-full bg-surface-2 px-1.5 py-px text-[0.55rem] font-bold text-muted">
          {r.tag}
        </span>
      </span>
      <span className="tabular w-[5.2rem] shrink-0 text-right text-sm font-bold leading-tight">
        {format(r.now.v, d)}
        {r.now.e != null && (
          <span className="block text-[0.6rem] font-semibold text-faint">
            ±{r.now.e.toFixed(d.digits)}
            {r.n > 1 ? ` · avg ×${r.n}` : ""}
          </span>
        )}
      </span>
      <span className={cn("tabular flex w-[4.8rem] shrink-0 items-center justify-end gap-1 text-[0.7rem] font-bold", colour)}>
        {r.delta == null ? (
          <span className="text-faint">first scan</span>
        ) : r.withinNoise ? (
          <span>within noise</span>
        ) : (
          <>
            <Triangle className={cn("size-2.5 fill-current", r.delta < 0 && "rotate-180")} />
            {r.delta > 0 ? "+" : ""}
            {r.delta.toFixed(d.digits)}
            {d.unit === "°" ? "°" : d.unit ? ` ${d.unit}` : ""}
          </>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint" />
    </button>
  );
}

function BeforeAfter({ first, latest, def }: { first: ScanRecord; latest: ScanRecord; def: MetricDef }) {
  const [urls, setUrls] = useState<[string | null, string | null]>([null, null]);
  useEffect(() => {
    let live = true;
    void Promise.all([loadScanImage(first.id), loadScanImage(latest.id)]).then(([a, b]) => {
      if (live) setUrls([a, b]);
    });
    return () => {
      live = false;
    };
  }, [first.id, latest.id]);
  const a = def.read(first.depth!.sweep!);
  const b = def.read(latest.depth!.sweep!);
  return (
    <Card className="p-3">
      <div className="mb-2 font-display text-base font-bold">
        Before / After <span className="text-sm font-normal text-muted">· {def.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Before", first, a, urls[0]],
          ["After", latest, b, urls[1]],
        ].map(([label, scan, reading, url]) => {
          const s = scan as ScanRecord;
          const rd = reading as ReturnType<MetricDef["read"]>;
          return (
            <div
              key={label as string}
              className={cn("flex gap-2 rounded-xl border p-2", label === "After" ? "border-accent" : "border-border")}
            >
              {url ? (
                <img src={url as string} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-20 w-16 shrink-0 rounded-lg bg-surface-2" />
              )}
              <div className="min-w-0">
                <div className="text-[0.65rem] text-muted">{label as string}</div>
                <div className="font-display text-lg font-bold">{rd ? format(rd.v, def) : "—"}</div>
                <div className="text-[0.6rem] text-faint">{s.date}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
