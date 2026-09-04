import { useMemo, useState } from "react";
import { Moon, Pill, Ruler, Scale } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SomaIntelligenceEngine } from "@/lib/soma";
import {
  currentSaturation, saturationLabel, saturationSeries, supplyStatus,
} from "@/lib/creatine";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

const SITES = [
  { key: "neck", label: "Neck" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "armL", label: "Arm L" },
  { key: "armR", label: "Arm R" },
  { key: "thighL", label: "Thigh L" },
  { key: "thighR", label: "Thigh R" },
  { key: "calf", label: "Calf" },
];

type BodyTab = "weight" | "sleep" | "measure" | "creatine";

export function BodyView() {
  const [tab, setTab] = useState<BodyTab>("weight");
  const tabs: { id: BodyTab; label: string; icon: typeof Scale }[] = [
    { id: "weight", label: "Weight", icon: Scale },
    { id: "sleep", label: "Sleep", icon: Moon },
    { id: "measure", label: "Tape", icon: Ruler },
    { id: "creatine", label: "Creatine", icon: Pill },
  ];
  return (
    <div className="space-y-3 pb-4">
      <div className="flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold",
                on ? "bg-accent text-accent-ink" : "text-muted",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "weight" && <WeightPanel />}
      {tab === "sleep" && <SleepPanel />}
      {tab === "measure" && <MeasurePanel />}
      {tab === "creatine" && <CreatinePanel />}
    </div>
  );
}

function WeightPanel() {
  const nutrition = useSoma((s) => s.nutrition);
  const logWeight = useSoma((s) => s.logWeight);
  const activeDate = useSoma((s) => s.activeDate);
  const settings = useSoma((s) => s.settings);
  const day = nutrition[activeDate] || {};
  const [val, setVal] = useState(String(day.bodyWeight || ""));
  const series = Object.keys(nutrition)
    .filter((k) => nutrition[k]?.bodyWeight)
    .sort()
    .map((k) => ({ date: k, w: nutrition[k]!.bodyWeight as number }));
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = last && prev ? last.w - prev.w : null;
  const protein = SomaIntelligenceEngine.proteinTargetFor(Number(val) || last?.w || 0, settings.proteinPerKg);

  return (
    <>
      <Card>
        <CardTitle>Body weight</CardTitle>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.1"
            className="text-center font-display text-2xl"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <span className="text-sm font-bold text-muted">kg</span>
        </div>
        <Button
          variant="primary"
          className="mt-3 w-full"
          onClick={() => {
            logWeight(Number(val));
            toast.success("Weight saved");
          }}
        >
          Save for {activeDate}
        </Button>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[0.62rem] font-bold uppercase text-faint">Change</div>
            <div className="font-display text-lg font-bold tabular">
              {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`}
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[0.62rem] font-bold uppercase text-faint">Protein target</div>
            <div className="font-display text-lg font-bold tabular">{protein ?? "—"} g</div>
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle>Trend</CardTitle>
        {series.length < 2 ? (
          <p className="text-sm text-muted">Log a few weigh-ins and the line appears.</p>
        ) : (
          <Spark points={series.map((s) => s.w)} />
        )}
        <div className="mt-3 max-h-40 overflow-y-auto">
          {series
            .slice(-10)
            .reverse()
            .map((s) => (
              <div key={s.date} className="flex justify-between border-b border-border py-1.5 text-sm">
                <span className="text-muted">{s.date}</span>
                <span className="font-bold tabular">{s.w.toFixed(1)} kg</span>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}

function SleepPanel() {
  const nutrition = useSoma((s) => s.nutrition);
  const logSleep = useSoma((s) => s.logSleep);
  const activeDate = useSoma((s) => s.activeDate);
  const day = nutrition[activeDate] || {};
  const [hours, setHours] = useState(day.sleep?.hours ?? 7.5);
  const [quality, setQuality] = useState(day.sleep?.quality ?? 4);
  const series = Object.keys(nutrition)
    .filter((k) => nutrition[k]?.sleep?.hours)
    .sort()
    .map((k) => ({ date: k, hours: nutrition[k]!.sleep!.hours, quality: nutrition[k]!.sleep!.quality }));
  const last7 = series.slice(-7);
  const avg = last7.length ? last7.reduce((a, p) => a + p.hours, 0) / last7.length : null;
  const debt = avg !== null ? Math.max(0, (8 - avg) * 7) : null;

  return (
    <>
      <Card>
        <CardTitle>Last night</CardTitle>
        <p className="mb-3 text-xs text-muted">Time actually asleep, not time in bed.</p>
        <div className="flex items-center gap-2">
          <Button onClick={() => setHours(Math.max(0, hours - 0.25))}>−</Button>
          <Input
            type="number"
            step="0.25"
            className="text-center font-display text-2xl"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
          <Button onClick={() => setHours(hours + 0.25)}>+</Button>
        </div>
        <div className="mt-3 text-xs font-bold text-muted">Quality</div>
        <div className="mt-1 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQuality(n)}
              className={cn(
                "h-11 flex-1 rounded-xl border font-bold",
                n <= quality ? "border-accent-line bg-accent-soft text-accent-text" : "border-border bg-surface-2 text-faint",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <Button
          variant="primary"
          className="mt-3 w-full"
          onClick={() => {
            logSleep(hours, quality);
            toast.success("Sleep saved");
          }}
        >
          Save for {activeDate}
        </Button>
      </Card>
      <Card>
        <CardTitle>7-night snapshot</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[0.62rem] font-bold uppercase text-faint">Average</div>
            <div className="font-display text-lg font-bold tabular">{avg === null ? "—" : `${avg.toFixed(1)} h`}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[0.62rem] font-bold uppercase text-faint">Sleep debt</div>
            <div className="font-display text-lg font-bold tabular">{debt === null ? "—" : `${debt.toFixed(1)} h`}</div>
          </div>
        </div>
        {series.length >= 2 && <Spark points={series.slice(-14).map((s) => s.hours)} className="mt-3" />}
      </Card>
    </>
  );
}

function MeasurePanel() {
  const nutrition = useSoma((s) => s.nutrition);
  const logMeasurements = useSoma((s) => s.logMeasurements);
  const activeDate = useSoma((s) => s.activeDate);
  const existing = nutrition[activeDate]?.measurements || {};
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(SITES.map((s) => [s.key, existing[s.key] != null ? String(existing[s.key]) : ""])),
  );
  return (
    <Card>
      <CardTitle>Circumference</CardTitle>
      <p className="mb-3 text-xs text-muted">Measure cold, same spots. Weekly is plenty.</p>
      <div className="space-y-2">
        {SITES.map((s) => (
          <div key={s.key} className="grid grid-cols-[1fr_100px] items-center gap-2">
            <span className="text-sm font-semibold text-muted">{s.label}</span>
            <Input
              type="number"
              step="0.1"
              className="h-10 text-center"
              placeholder="cm"
              value={vals[s.key] || ""}
              onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={() => {
          const m: Record<string, number> = {};
          for (const s of SITES) {
            const n = parseFloat(vals[s.key] || "");
            if (!isNaN(n) && n > 0) m[s.key] = n;
          }
          logMeasurements(m);
          toast.success("Measurements saved");
        }}
      >
        Save
      </Button>
    </Card>
  );
}

function CreatinePanel() {
  const nutrition = useSoma((s) => s.nutrition);
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const addCreatine = useSoma((s) => s.addCreatine);
  const resetCreatine = useSoma((s) => s.resetCreatine);
  const activeDate = useSoma((s) => s.activeDate);
  const [editingStash, setEditingStash] = useState(false);
  const [stashDraft, setStashDraft] = useState(String(settings.creatineStashGrams ?? 0));

  const doses = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.creatine) out[d] = day.creatine;
    }
    return out;
  }, [nutrition]);

  // Was streak / 28, which is a streak counter wearing saturation's name: one
  // missed day reset it to zero, when in reality muscle stores barely move.
  // This integrates the whole log, including the days nothing was taken.
  const sat = Math.round(currentSaturation(doses, activeDate));
  const supply = useMemo(
    () => supplyStatus(settings.creatineStashGrams ?? 0, doses, activeDate),
    [settings.creatineStashGrams, doses, activeDate],
  );
  const series = useMemo(() => saturationSeries(doses, { to: activeDate }).slice(-60), [doses, activeDate]);
  const todayDose = nutrition[activeDate]?.creatine || 0;

  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="mb-0">Creatine saturation</CardTitle>
          <Badge tone={sat >= 90 ? "accent" : sat >= 40 ? "warn" : "muted"}>
            {sat}% · {saturationLabel(sat)}
          </Badge>
        </div>
        <Progress value={sat} />
        {series.length > 1 && <Spark points={series.map((p: { saturation: number }) => p.saturation)} className="mt-3" />}
        <p className="mt-2 text-[0.65rem] leading-snug text-faint">
          Stores fill over about four weeks and wash out over about as long, so one
          missed day costs very little.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-bold">Today {todayDose}g</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => addCreatine(3)}>
              +3g
            </Button>
            <Button size="sm" variant="primary" onClick={() => addCreatine(5)}>
              +5g
            </Button>
            <Button size="sm" onClick={resetCreatine}>
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Supply</CardTitle>
        {editingStash ? (
          <div className="flex items-end gap-2">
            <label className="flex-1 text-[0.65rem] font-bold uppercase tracking-wide text-faint">
              Grams left
              <Input
                type="number"
                inputMode="decimal"
                value={stashDraft}
                onChange={(e) => setStashDraft(e.target.value)}
                className="mt-1"
              />
            </label>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                patchSettings({ creatineStashGrams: Math.max(0, Number(stashDraft) || 0) });
                setEditingStash(false);
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Left in the tub</span>
              <button
                type="button"
                onClick={() => {
                  setStashDraft(String(settings.creatineStashGrams ?? 0));
                  setEditingStash(true);
                }}
                className="font-bold text-accent-text underline"
              >
                {settings.creatineStashGrams ?? 0}g · edit
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="text-muted">Actual daily average</span>
              <span className="font-bold tabular-nums">{supply.dailyAverage}g</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="text-muted">Runs out</span>
              {/* Based on real intake, not the nominal 5g: taking it half the
                  time really does make a tub last twice as long, and saying
                  otherwise sends you to the shop early. */}
              <span className={cn("font-bold", supply.daysLeft != null && supply.daysLeft < 14 && "text-warn")}>
                {supply.runsOut
                  ? `${supply.runsOut} · ${supply.daysLeft}d`
                  : "not enough intake logged"}
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Spark({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(0.1, max - min);
  const w = 320;
  const h = 72;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = h - 8 - ((p - min) / range) * (h - 16);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-20 w-full", className)}>
      <path d={d} fill="none" stroke="var(--color-accent-text)" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}
