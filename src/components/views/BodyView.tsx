import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Camera, Check, Moon, Pill, Ruler, Scale } from "lucide-react";
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
import { SLEEP_FACTORS, currentDebt, debtLabel, nightsToClear } from "@/lib/sleep-debt";
import { HabitPhotoCalendar } from "@/components/HabitPhotoCalendar";
import { captureImage, getPhoto, savePhoto } from "@/lib/habit-photos";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  EVIDENCE_LABEL, EVIDENCE_TONE, SUPPLEMENTS, loadTaken, saveTaken,
} from "@/lib/supplements";
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

type BodyTab = "weight" | "sleep" | "measure" | "supplements";

export function BodyView() {
  const [tab, setTab] = useState<BodyTab>("weight");
  const tabs: { id: BodyTab; label: string; icon: typeof Scale }[] = [
    { id: "weight", label: "Weight", icon: Scale },
    { id: "sleep", label: "Sleep", icon: Moon },
    { id: "measure", label: "Tape", icon: Ruler },
    { id: "supplements", label: "Supps", icon: Pill },
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
      {tab === "supplements" && <SupplementsPanel />}
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
  // Was (8 - avg) * 7: a flat extrapolation that never decayed and never let a
  // long night pay anything back, so it only ever grew.
  const debt = series.length ? currentDebt(series) : null;
  const toClear = debt !== null ? nightsToClear(debt) : null;

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
            {debt !== null && (
              <div className="mt-0.5 text-[0.58rem] text-faint">
                {debtLabel(debt)}
                {toClear ? ` · ~${toClear} nights to clear` : ""}
              </div>
            )}
          </div>
        </div>
        {series.length >= 2 && <Spark points={series.slice(-14).map((s) => s.hours)} className="mt-3" />}
      </Card>
      <Card>
        <CardTitle>What moves sleep</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Deliberately short. These have real evidence behind them; most of the usual
          list does not.
        </p>
        <div className="space-y-2">
          {SLEEP_FACTORS.map((f) => {
            // Checked against the actual food log where a nutrient backs it,
            // so this is a measurement rather than a checklist to tick.
            const eaten = f.nutrientKey
              ? (day.items ?? []).reduce<number>(
                  (t, i) => t + (Number((i as unknown as Record<string, unknown>)[f.nutrientKey!]) || 0),
                  0,
                )
              : null;
            const goal = f.nutrientKey ? (day.goals?.[f.nutrientKey] ?? 0) : 0;
            const hit = eaten !== null && goal > 0 && eaten >= goal * 0.9;
            return (
              <div key={f.id} className="rounded-xl border border-border bg-surface-2 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.75rem] font-bold">{f.label}</span>
                  {eaten !== null && goal > 0 ? (
                    <span className={cn("text-[0.68rem] font-bold tabular-nums", hit ? "text-emerald-400" : "text-warn")}>
                      {Math.round(eaten)} / {Math.round(goal)}
                    </span>
                  ) : (
                    <span className="text-[0.62rem] font-semibold text-faint">{f.target}</span>
                  )}
                </div>
                <p className="mt-0.5 text-[0.62rem] leading-snug text-faint">{f.note}</p>
              </div>
            );
          })}
        </div>
      </Card>

    </>
  );
}

/**
 * Measurement photos share the habit photo store, under their own id space.
 *
 * A separate store would mean a second backup path, a second restore path and
 * a second set of object-URL bugs, for data that is shaped identically.
 */
function sitePhotoId(key: string): string {
  return `measure:${key}`;
}

function MeasurePanel() {
  const nutrition = useSoma((s) => s.nutrition);
  const logMeasurements = useSoma((s) => s.logMeasurements);
  const activeDate = useSoma((s) => s.activeDate);
  const existing = nutrition[activeDate]?.measurements || {};
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(SITES.map((s) => [s.key, existing[s.key] != null ? String(existing[s.key]) : ""])),
  );
  const [photoSite, setPhotoSite] = useState<{ key: string; label: string } | null>(null);
  const [shots, setShots] = useState<Set<string>>(new Set());
  const [reload, setReload] = useState(0);

  // Which sites already have a photo for the day being viewed, so the camera
  // button can say so rather than making it a guess.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      SITES.map(async (s) => ((await getPhoto(sitePhotoId(s.key), activeDate)) ? s.key : null)),
    ).then((keys) => {
      if (!cancelled) setShots(new Set(keys.filter((k): k is string => !!k)));
    });
    return () => {
      cancelled = true;
    };
  }, [activeDate, reload]);

  const shoot = async (key: string, label: string) => {
    try {
      const file = await captureImage();
      if (!file) return;
      await savePhoto(sitePhotoId(key), activeDate, file);
      setReload((k) => k + 1);
      toast.success(`${label} photo saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that photo.");
    }
  };
  return (
    <Card>
      <CardTitle>Circumference</CardTitle>
      <p className="mb-3 text-xs text-muted">Measure cold, same spots. Weekly is plenty.</p>
      <div className="space-y-2">
        {SITES.map((s) => (
          <div key={s.key} className="grid grid-cols-[1fr_84px_auto_auto] items-center gap-2">
            <span className="text-sm font-semibold text-muted">{s.label}</span>
            <DecimalInput
              className="h-10 text-center"
              placeholder="cm"
              value={vals[s.key] || ""}
              onValueChange={(_n, raw) => setVals({ ...vals, [s.key]: raw })}
            />
            {/* A tape reading and a photo of the same site on the same day are
                the two halves of one measurement, so they are logged together
                rather than on separate screens. Photos are filed under the
                site key, reusing the habit photo store. */}
            <button
              type="button"
              aria-label={`Photo history for ${s.label}`}
              onClick={() => setPhotoSite(s)}
              className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-transform active:scale-90"
            >
              <CalendarDays className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Take a photo of ${s.label}`}
              onClick={() => void shoot(s.key, s.label)}
              className={cn(
                "flex size-10 items-center justify-center rounded-lg border transition-transform active:scale-90",
                shots.has(s.key)
                  ? "border-accent bg-accent/15 text-accent-text"
                  : "border-border bg-surface-2 text-muted",
              )}
            >
              <Camera className="size-4" />
            </button>
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

      {photoSite && (
        <HabitPhotoCalendar
          habit={{
            id: sitePhotoId(photoSite.key),
            name: photoSite.label,
            desc: "Measurement photos",
            color: "#a3e635",
            goalDaysPerWeek: 1,
            history: {},
          }}
          onClose={() => {
            setPhotoSite(null);
            setReload((k) => k + 1);
          }}
        />
      )}
    </Card>
  );
}

/**
 * Creatine, plus everything else worth an opinion.
 *
 * The evidence grade is the point of the list. Presenting creatine and BCAAs
 * as equals would launder a marketing claim into something that looks like a
 * recommendation, so the ones that do nothing are listed AS doing nothing
 * rather than left off and assumed untested.
 */
function SupplementsPanel() {
  const [taken, setTaken] = useState<string[]>(() => loadTaken());
  const toggle = (id: string) => {
    const next = taken.includes(id) ? taken.filter((x) => x !== id) : [...taken, id];
    setTaken(next);
    saveTaken(next);
  };

  return (
    <div className="space-y-3">
      <CreatinePanel />

      <Card>
        <CardTitle>Supplements</CardTitle>
        <p className="mb-3 text-[0.68rem] leading-snug text-muted">
          Graded by the evidence behind them. Marking one only records that you take it —
          nothing here doses you or tells you to start.
        </p>
        <div className="space-y-1.5">
          {SUPPLEMENTS.map((sup) => {
            const on = taken.includes(sup.id);
            return (
              <div
                key={sup.id}
                className={cn(
                  "rounded-xl border p-2.5 transition-colors",
                  on ? "border-accent/40 bg-accent/5" : "border-border bg-surface-2",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(sup.id)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      on ? "border-accent bg-accent text-accent-ink" : "border-border",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[0.78rem] font-bold">{sup.name}</span>
                      <span className={cn("text-[0.58rem] font-bold uppercase", EVIDENCE_TONE[sup.evidence])}>
                        {EVIDENCE_LABEL[sup.evidence]}
                      </span>
                      {sup.foodCovers && (
                        <span className="text-[0.55rem] font-semibold text-faint">food covers this</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[0.65rem] leading-snug text-muted">{sup.what}</span>
                    {sup.dose !== "—" && (
                      <span className="mt-0.5 block text-[0.6rem] text-faint">
                        {sup.dose} · {sup.timing}
                      </span>
                    )}
                    {sup.caveat && (
                      <span className="mt-1 block text-[0.6rem] leading-snug text-warn/90">{sup.caveat}</span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
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
