import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Plus, Redo2, Search, Timer, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { PlateLoading } from "@/components/PlateLoading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { playChime, burstConfetti } from "@/lib/audio";
import { computeBiologicalReadiness } from "@/lib/recovery";
import { SomaIntelligenceEngine, getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { SetQualitySheet } from "@/components/SetQualitySheet";
import { isGenuineFailure } from "@/lib/set-quality";
import { cn } from "@/lib/utils";
import type { SessionExercise } from "@/lib/types";

const SUPERSET_COLOR: Record<string, string> = {
  A: "var(--color-accent)",
  B: "var(--color-info)",
  C: "var(--color-good)",
  D: "var(--color-warn)",
};

export function WorkoutView() {
  const live = useSoma((s) => s.live);
  const settings = useSoma((s) => s.settings);
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const activeDate = useSoma((s) => s.activeDate);
  const routinesFn = useSoma((s) => s.routines);
  const loadSplit = useSoma((s) => s.loadSplit);
  const addExercise = useSoma((s) => s.addExercise);
  const addCustomExercise = useSoma((s) => s.addCustomExercise);
  const updateSet = useSoma((s) => s.updateSet);
  const addSet = useSoma((s) => s.addSet);
  const updateExercise = useSoma((s) => s.updateExercise);
  const removeSet = useSoma((s) => s.removeSet);
  const removeExercise = useSoma((s) => s.removeExercise);
  const cycleSetType = useSoma((s) => s.cycleSetType);
  const cycleSuperset = useSoma((s) => s.cycleSuperset);
  const swapExercise = useSoma((s) => s.swapExercise);
  const undo = useSoma((s) => s.undo);
  const redo = useSoma((s) => s.redo);
  const startRest = useSoma((s) => s.startRest);
  const clearRest = useSoma((s) => s.clearRest);
  const saveWorkout = useSoma((s) => s.saveWorkout);
  const resetLive = useSoma((s) => s.resetLive);
  const resumeFinished = useSoma((s) => s.resumeFinished);
  const allExercises = useSoma((s) => s.allExercises);
  const logReadiness = useSoma((s) => s.logReadiness);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const rootRef = useRef<HTMLDivElement>(null);
  const routines = routinesFn();

  const [now, setNow] = useState(Date.now());
  const [showSplits, setShowSplits] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  // which set's quality sheet is open, if any
  const [rating, setRating] = useState<{ exIdx: number; sIdx: number } | null>(null);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState("chest");
  const [soreness, setSoreness] = useState(3);
  const [stress, setStress] = useState(3);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const proj = SomaIntelligenceEngine.getProgramProjectedDay(
    new Date(),
    settings.scheduleOverrides,
  );
  const day = nutrition[activeDate] || {};
  const readinessMap = useMemo(
    () => computeBiologicalReadiness(history, now),
    [history, now],
  );

  // Reads 00:00 until the first set is ticked, which is the truth: nothing
  // has been trained yet.
  const elapsed = live.firstSetAt ? Math.max(0, Math.floor((now - live.firstSetAt) / 1000)) : 0;
  const em = Math.floor(elapsed / 60);
  const es = elapsed % 60;
  const restLeft = live.restEndsAt ? Math.max(0, Math.ceil((live.restEndsAt - now) / 1000)) : 0;
  const restPct = live.restTotal ? restLeft / live.restTotal : 0;

  let totalVol = 0;
  let totalSets = 0;
  let failSum = 0;
  for (const ex of live.exercises) {
    for (const s of ex.sets) {
      if (s.done && s.type !== "warmup") {
        totalSets++;
        totalVol += SomaIntelligenceEngine.calculateWorkVolume(Number(s.weight) || 0, Number(s.reps) || 0, ex.isBW);
        failSum += s.failure || 3;
      }
    }
  }
  const mins = Math.max(1, Math.round(elapsed / 60));
  const cals = SomaIntelligenceEngine.calculateCaloriesBurned(
    mins,
    totalVol,
    totalSets,
    totalSets ? failSum / totalSets : 3,
  );

  const db = allExercises();
  const filtered = db
    .filter((ex) => {
      const q = query.toLowerCase();
      return (
        ex.name.toLowerCase().includes(q) ||
        (ex.subTarget || "").toLowerCase().includes(q) ||
        (ex.muscle || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 12);

  const onCheck = (ex: SessionExercise, exIdx: number, setIdx: number, done: boolean) => {
    updateSet(exIdx, setIdx, { done });
    if (done) {
      if (settings.sound) playChime("chime");
      const set = ex.sets[setIdx]!;
      const rest = SomaIntelligenceEngine.restForSet(ex, set, live.exercises, settings);
      if (settings.autoRest && rest.seconds > 0) startRest(rest.seconds);
      if (rest.nextExercise) toast(`Superset — go to ${rest.nextExercise}`);
      const pr = SomaIntelligenceEngine.detectPersonalRecords(
        history,
        ex.name,
        Number(set.weight) || 0,
        Number(set.reps) || 0,
      );
      if (pr) {
        if (settings.sound) playChime("pr");
        if (settings.confetti && rootRef.current) burstConfetti(rootRef.current);
        toast.success(`PR on ${ex.name}`);
      }
    }
  };

  // Picking a date in the drawer has to change this tab too, otherwise the
  // Train screen silently ignores the selection and keeps showing the live
  // session. A past day is a read-only recap of what was logged then; the
  // live session is only ever today's.
  const todayKey = getLocalDateKey();
  if (activeDate !== todayKey) {
    const past = history[activeDate];
    return (
      <div className="space-y-3 pb-4">
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Badge>Viewing {activeDate}</Badge>
            <h2 className="mt-2 truncate font-display text-lg font-extrabold tracking-tight">
              {past ? past.split : "No session logged"}
            </h2>
          </div>
          <Button variant="primary" onClick={() => setActiveDate(todayKey)}>
            Today
          </Button>
        </Card>

        {past ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Duration" value={past.durationFormatted} />
              <Stat label="Burn" value={`${past.caloriesBurned} kcal`} />
              <Stat label="Volume" value={past.totalVol.toLocaleString()} />
              <Stat label="Sets" value={String(past.totalSets)} />
            </div>
            {past.exercises.map((ex, i) => (
              <Card key={`${ex.name}-${i}`}>
                <div className="mb-2 font-bold">{ex.name}</div>
                {ex.sets.map((st, j) => (
                  <div
                    key={j}
                    className="flex justify-between border-b border-border py-1.5 text-sm last:border-0"
                  >
                    <span className="text-muted">
                      {st.type === "warmup" ? "Warm-up" : st.type === "dropset" ? "Drop" : `Set ${j + 1}`}
                      {" · "}
                      <b className="text-fg">{st.weight || 0}</b> × <b className="text-fg">{st.reps || 0}</b>
                    </span>
                    <span className={st.done ? "text-accent-text" : "text-faint"}>
                      {st.done ? "Done" : "Skipped"}
                    </span>
                  </div>
                ))}
              </Card>
            ))}
          </>
        ) : (
          <Card className="py-10 text-center">
            <Timer className="mx-auto mb-2 size-8 text-faint" />
            <div className="font-display text-lg font-bold">Nothing trained</div>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              No session was logged on {activeDate}. Food, sleep and habits for that
              day are still on their own tabs.
            </p>
          </Card>
        )}
      </div>
    );
  }

  if (live.finished) {
    const f = live.finished;
    return (
      <div className="space-y-3 pb-4">
        <div className="py-4 text-center">
          <Badge tone="accent">Session saved</Badge>
          <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">Workout summary</h2>
          <p className="mt-1 text-sm text-muted">{f.split}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Duration" value={f.durationFormatted} />
          <Stat label="Burn" value={`${f.caloriesBurned} kcal`} />
          <Stat label="Volume" value={f.totalVol.toLocaleString()} />
          <Stat label="Sets" value={String(f.totalSets)} />
        </div>
        {f.exercises.map((ex) => (
          <Card key={ex.name}>
            <div className="mb-2 font-bold">{ex.name}</div>
            {ex.sets.map((s, i) => (
              <div key={i} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
                <span className="text-muted">
                  {s.type === "warmup" ? "Warm-up" : s.type === "dropset" ? "Drop" : `Set ${i + 1}`}
                  {" · "}
                  <b className="text-fg">{s.weight || 0}</b> × <b className="text-fg">{s.reps || 0}</b>
                </span>
                <span className={s.done ? "text-accent-text" : "text-faint"}>{s.done ? "Done" : "Skipped"}</span>
              </div>
            ))}
          </Card>
        ))}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={resumeFinished}>
            Edit session
          </Button>
          <Button variant="danger" onClick={resetLive}>
            New session
          </Button>
        </div>
      </div>
    );
  }

  const answered = day.readiness?.soreness !== undefined;

  return (
    <div ref={rootRef} className="relative space-y-3 pb-4">
      <Card className="overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_55%),var(--color-surface)]">
        <div className="flex items-start justify-between gap-3">
          {/* min-w-0 lets a long split name wrap instead of forcing the row
              wider than the card and squeezing the badge beside it. */}
          <div className="min-w-0 flex-1">
            <Badge tone="accent">Scheduled · {activeDate}</Badge>
            <h1 className="mt-2 font-display text-xl font-extrabold tracking-tight">{live.split}</h1>
            <p className="mt-1 text-xs text-muted">
              {proj.phase} · {proj.repScheme}
            </p>
          </div>
          <Badge tone={proj.isDeload ? "warn" : "muted"}>{proj.phaseBadge}</Badge>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button size="icon" variant="ghost" onClick={undo} aria-label="Undo">
            <Undo2 />
          </Button>
          <Button size="icon" variant="ghost" onClick={redo} aria-label="Redo">
            <Redo2 />
          </Button>
        </div>
        <div className="tabular rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-bold text-accent-text">
          {String(em).padStart(2, "0")}:{String(es).padStart(2, "0")}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Est. burn" value={`${cals} kcal`} />
        <Stat label={`Volume (${settings.unit})`} value={totalVol.toLocaleString()} />
        <Stat label="Sets done" value={String(totalSets)} />
        <Stat label="Movements" value={String(live.exercises.length)} />
      </div>

      <Card className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative size-14">
            <svg viewBox="0 0 54 54" className="size-14 -rotate-90">
              <circle cx="27" cy="27" r="22" fill="none" stroke="var(--color-surface-3)" strokeWidth="4" />
              <circle
                cx="27"
                cy="27"
                r="22"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="138.23"
                strokeDashoffset={138.23 * (1 - restPct)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center tabular text-xs font-bold">
              {restLeft}s
            </div>
          </div>
          <div>
            <div className="text-sm font-bold">Rest</div>
            <div className="text-xs text-muted">Starts when you tick a set</div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="pill" onClick={() => startRest(60)}>
            60s
          </Button>
          <Button size="pill" onClick={() => startRest(90)}>
            90s
          </Button>
          <Button size="pill" variant="danger" onClick={clearRest}>
            Stop
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button className="flex-1" onClick={() => setShowSplits((v) => !v)}>
          Load split
        </Button>
        <Button className="flex-1" onClick={() => setShowSearch((v) => !v)}>
          <Search className="size-4" /> Add
        </Button>
        <Button onClick={() => setCustomOpen(true)}>
          <Plus className="size-4" />
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => {
            const saved = saveWorkout();
            if (!saved) toast.error("Tick at least one working set first");
            else toast.success("Session saved");
          }}
        >
          Save log
        </Button>
      </div>

      {showSplits && (
        <Card>
          <CardTitle>Routines</CardTitle>
          <div className="flex flex-col gap-1.5">
            {Object.keys(routines).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  loadSplit(name);
                  setShowSplits(false);
                }}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm font-semibold hover:border-border-strong"
              >
                <span>{name}</span>
                <span className="text-xs text-faint">{routines[name]?.length || 0}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {showSearch && (
        <Card>
          <CardTitle>Add movement</CardTitle>
          <Input
            autoFocus
            placeholder="Search name or muscle"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border">
            {filtered.map((ex) => (
              <button
                key={ex.name}
                type="button"
                onClick={() => {
                  addExercise(ex.name);
                  setShowSearch(false);
                  setQuery("");
                }}
                className="flex w-full flex-col items-start border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2"
              >
                <span className="text-sm font-bold">{ex.name}</span>
                <span className="text-xs text-muted">
                  {ex.subTarget} · {ex.tier}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {!answered && !live.readinessDismissed && (
        <Card>
          <CardTitle>
            <span>Before you start</span>
            <span className="text-[0.62rem] font-bold uppercase tracking-wide text-faint">Optional</span>
          </CardTitle>
          <p className="mb-3 text-xs text-muted">
            {day.sleep?.hours
              ? `${day.sleep.hours}h sleep already logged this morning.`
              : "No sleep logged yet — it feeds into autoregulation."}
          </p>
          <label className="mb-2 block text-xs font-bold text-muted">Soreness {soreness}</label>
          <input
            type="range"
            min={1}
            max={5}
            value={soreness}
            onChange={(e) => setSoreness(Number(e.target.value))}
            className="mb-3 w-full accent-[var(--color-accent)]"
          />
          <label className="mb-2 block text-xs font-bold text-muted">Stress {stress}</label>
          <input
            type="range"
            min={1}
            max={5}
            value={stress}
            onChange={(e) => setStress(Number(e.target.value))}
            className="mb-3 w-full accent-[var(--color-accent)]"
          />
          <div className="flex gap-2">
            <Button
              className="flex-[0.6]"
              onClick={() => useSoma.setState({ live: { ...live, readinessDismissed: true } })}
            >
              Skip
            </Button>
            <Button
              variant="primary"
              className="flex-[1.4]"
              onClick={() => {
                logReadiness(soreness, stress);
                toast.success("Readiness saved");
              }}
            >
              Save
            </Button>
          </div>
        </Card>
      )}

      {live.exercises.length === 0 && (
        <Card className="py-10 text-center">
          <Timer className="mx-auto mb-2 size-8 text-faint" />
          <div className="font-display text-lg font-bold">Empty session</div>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            Load today's split or add a movement to start logging.
          </p>
        </Card>
      )}

      {live.exercises.map((ex, exIdx) => {
        const last = useSoma.getState().lastPerformance(ex.name);
        const keys = ex.targetKeys || [];
        const muscleR = keys.length
          ? Math.min(...keys.map((k) => readinessMap[k]?.recovery ?? 100))
          : null;
        const subj = SomaIntelligenceEngine.computeSubjectiveReadiness({
          sleepHours: day.sleep?.hours ?? null,
          sleepQuality: day.sleep?.quality ?? null,
          soreness: day.readiness?.soreness ?? null,
          stress: day.readiness?.stress ?? null,
        });
        const target = SomaIntelligenceEngine.computeAutoregulatedTarget(last, {
          isBW: ex.isBW,
          readiness: SomaIntelligenceEngine.blendReadiness(muscleR, subj),
          isDeload: !!proj.isDeload,
          unit: settings.unit,
          trend: SomaIntelligenceEngine.computeVolumeTrend(history, ex.name),
        });
        const color = SUPERSET_COLOR[ex.supersetGroup] || "";
        const alts =
          target.diffTier === "Under-recovered"
            ? SomaIntelligenceEngine.suggestAlternatives(
                ex,
                db,
                Object.fromEntries(Object.entries(readinessMap).map(([k, v]) => [k, v.recovery])),
              )
            : [];

        return (
          <Card
            key={`${ex.name}-${exIdx}`}
            className="space-y-2"
            style={color ? { borderLeft: `4px solid ${color}` } : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display text-[0.95rem] font-bold">
                  {exIdx + 1}. {ex.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ex.supersetGroup && (
                    <Badge tone="accent">Superset {ex.supersetGroup}</Badge>
                  )}
                  {ex.isBW && <Badge tone="good">Bodyweight</Badge>}
                  {ex.subTarget && <Badge>{ex.subTarget}</Badge>}
                  {ex.isAxial && <Badge tone="danger">Axial</Badge>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => cycleSuperset(exIdx)} aria-label="Superset">
                  <Link2 />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => removeExercise(exIdx)} aria-label="Remove">
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-dashed border-border bg-surface-2 px-3 py-2 text-xs">
              <div>
                <div className="font-bold text-fg">
                  Smart target · {ex.isBW && target.weight === 0 ? "Bodyweight" : `${target.weight} ${settings.unit}`} × {target.reps}
                </div>
                <div className="mt-0.5 text-muted">{target.note}</div>
                {target.autoNote && <div className="mt-1 text-info">{target.autoNote}</div>}
              </div>
              <Badge
                tone={
                  target.diffTier === "Under-recovered" || target.diffTier === "Deload"
                    ? "danger"
                    : target.diffTier === "Stalled" || String(target.diffTier).startsWith("Hold")
                      ? "warn"
                      : "accent"
                }
              >
                {target.diffTier}
              </Badge>
            </div>

            <PlateLoading exercise={ex} targetWeight={target.weight} unit={settings.unit} />

            {alts.length > 0 && (
              <div className="rounded-xl border border-dashed border-warn/40 bg-surface-2 p-2">
                <div className="mb-1.5 text-[0.7rem] font-bold text-warn">Fresher options</div>
                {alts.map((a: { name: string; readiness: number; note: string }) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => swapExercise(exIdx, a.name)}
                    className="mb-1 flex w-full items-center justify-between rounded-lg border border-border bg-surface px-2.5 py-2 last:mb-0"
                  >
                    <span className="text-xs font-bold">{a.name}</span>
                    <span className="text-[0.65rem] font-bold text-accent-text">
                      {a.readiness}% · {a.note}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-[36px_1fr_1fr_1.3fr_36px_28px] items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-faint">
              <span className="text-center">Set</span>
              <span className="text-center">{settings.unit}</span>
              <span className="text-center">Reps</span>
              <span className="text-center">RPE</span>
              <span />
              <span />
            </div>
            {ex.sets.map((s, sIdx) => {
              const workingNo = ex.sets.slice(0, sIdx + 1).filter((x) => x.type !== "warmup" && x.type !== "dropset").length;
              const label = s.type === "warmup" ? "W" : s.type === "dropset" ? "D" : String(workingNo);
              return (
                <div
                  key={sIdx}
                  className={cn(
                    "grid grid-cols-[36px_1fr_1fr_1.3fr_36px_28px] items-center gap-1.5 rounded-xl p-1",
                    s.done && "bg-accent-soft",
                    s.type === "dropset" && "bg-warn/10",
                    s.type === "warmup" && "opacity-70",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => cycleSetType(exIdx, sIdx)}
                    className={cn(
                      "h-9 rounded-lg border border-border bg-surface-3 text-xs font-bold",
                      s.type === "dropset" && "border-warn bg-warn text-accent-ink",
                      s.type === "warmup" && "border-info text-info",
                    )}
                    title="Tap to cycle warm-up / drop / working"
                  >
                    {label}
                  </button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-9 px-1 text-center"
                    value={s.weight}
                    onChange={(e) =>
                      updateSet(exIdx, sIdx, { weight: e.target.value === "" ? "" : Number(e.target.value) })
                    }
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-9 px-1 text-center"
                    value={s.reps}
                    onChange={(e) =>
                      updateSet(exIdx, sIdx, { reps: e.target.value === "" ? "" : Number(e.target.value) })
                    }
                  />
                  {/* Replaces the old 1-5 dropdown. That scale could not tell a
                      chest failure from a triceps failure on the same press, so
                      the detail is captured in a sheet instead of a select. */}
                  <button
                    type="button"
                    aria-label={`Rate set ${sIdx + 1}`}
                    onClick={() => setRating({ exIdx, sIdx })}
                    className={cn(
                      "h-9 rounded-xl border px-1 text-[0.65rem] font-bold leading-tight transition-colors",
                      isGenuineFailure(s)
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : s.limiter
                          ? "border-accent/40 bg-accent/10 text-accent-text"
                          : "border-border bg-surface-2 text-faint",
                    )}
                  >
                    {isGenuineFailure(s)
                      ? "FAIL"
                      : s.limiter === "synergist"
                        ? "synrg"
                        : s.limiter
                          ? (s.closeness === "nothing" || s.closeness === "forced" ? "hard" : "easy")
                          : "rate"}
                  </button>
                  <button
                    type="button"
                    aria-label="Mark set done"
                    onClick={() => onCheck(ex, exIdx, sIdx, !s.done)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border",
                      s.done
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-border bg-surface-2 text-faint",
                    )}
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete set"
                    onClick={() => removeSet(exIdx, sIdx)}
                    className="text-danger"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
            <div className="flex gap-2">
              <Button className="flex-1" size="sm" onClick={() => addSet(exIdx)}>
                Add set
              </Button>
              <Button className="flex-1" size="sm" onClick={() => addSet(exIdx, "dropset")}>
                Drop set
              </Button>
            </div>

            {/* Pump belongs to the exercise, not the set: it builds across all
                of them and can only be judged once the weight is down. Shown
                after the sets for the same reason. */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[0.65rem] font-bold uppercase tracking-wide text-faint">
                Pump
              </span>
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Pump ${n} for ${ex.name}`}
                  onClick={() => updateExercise(exIdx, { pump: ex.pump === n ? undefined : n })}
                  className={cn(
                    "h-8 flex-1 rounded-lg border text-[0.7rem] font-bold transition-colors",
                    ex.pump === n
                      ? "border-accent bg-accent/15 text-accent-text"
                      : "border-border bg-surface-2 text-faint",
                  )}
                >
                  {["light", "solid", "full"][n - 1]}
                </button>
              ))}
            </div>
          </Card>
        );
      })}

      {customOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center">
          <Card className="w-full max-w-md">
            <CardTitle>
              Custom movement
              <button type="button" onClick={() => setCustomOpen(false)} aria-label="Close">
                <X className="size-4 text-muted" />
              </button>
            </CardTitle>
            <label className="mb-1 block text-xs font-bold text-muted">Name</label>
            <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Incline cable press" />
            <label className="mb-1 mt-3 block text-xs font-bold text-muted">Muscle</label>
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold"
              value={customMuscle}
              onChange={(e) => setCustomMuscle(e.target.value)}
            >
              <option value="chest">Chest</option>
              <option value="upper_back">Back</option>
              <option value="deltoids">Shoulders</option>
              <option value="biceps">Biceps</option>
              <option value="triceps">Triceps</option>
              <option value="quadriceps">Quads</option>
              <option value="hamstring">Hamstrings</option>
              <option value="gluteal">Glutes</option>
              <option value="calves">Calves</option>
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setCustomOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!customName.trim()) return;
                  addCustomExercise({
                    name: customName.trim(),
                    muscle: customMuscle,
                    subTarget: customMuscle,
                    targetKeys: [customMuscle],
                    position: "Mid-Range",
                    risk: "Low",
                    tier: "Custom",
                    isAxial: false,
                    isBW: false,
                  });
                  setCustomOpen(false);
                  setCustomName("");
                }}
              >
                Add
              </Button>
            </div>
          </Card>
        </div>
      )}
      {rating &&
        (() => {
          const ex = live.exercises[rating.exIdx];
          const set = ex?.sets[rating.sIdx];
          if (!ex || !set) return null;
          // Everything the lift touches, minus what it is programmed for, is
          // the shortlist of things that can have given out first.
          const primary = (ex.targetKeys ?? []).slice(0, 1);
          return (
            <SetQualitySheet
              exerciseName={ex.name}
              setNumber={rating.sIdx + 1}
              primaryKeys={primary}
              allKeys={ex.targetKeys ?? []}
              value={set}
              onChange={(patch) => {
                // Keep the legacy 1-5 in step with `closeness`. Calorie burn
                // and muscle stimulus still read it, and two fields describing
                // the same thing must never disagree.
                const CLOSENESS_TO_FAILURE = {
                  reps_left: 2, one_left: 3, nothing: 5, forced: 5,
                } as const;
                const next = { ...patch } as typeof patch & { failure?: number };
                if (patch.closeness) next.failure = CLOSENESS_TO_FAILURE[patch.closeness];
                updateSet(rating.exIdx, rating.sIdx, next);
              }}
              onClose={() => setRating(null)}
            />
          );
        })()}

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-3">
      <div className="text-[0.62rem] font-bold uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 font-display text-xl font-extrabold tabular tracking-tight">{value}</div>
    </div>
  );
}
