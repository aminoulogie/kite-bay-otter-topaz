import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { SyncSettings } from "@/components/SyncSettings";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ExercisesView } from "@/components/views/ExercisesView";
import { ExerciseIcon } from "@/components/ExerciseIcon";
import { DecimalInput, parseDecimal } from "@/components/ui/decimal-input";
import { colorsOf, ratesOf } from "@/lib/money-model";
import { Input } from "@/components/ui/input";
import { SomaIntelligenceEngine, getLocalDateKey, normalizeAccent } from "@/lib/soma";
import { ColorPalette } from "@/components/ColorPalette";
import { RoutineCodeSheet } from "@/components/RoutineCodeSheet";
import {
  buildBackup, parseBackup, restoreExercisePhotos, restorePhotos, restoreScanImages, saveBackupFile,
  type BackupSummary,
} from "@/lib/backup";
import {
  backupIsDue, daysSinceBackup, formatBytes, requestPersistence,
  storageHealth, type StorageHealth,
} from "@/lib/storage-health";
import { ProgramBuilder } from "@/components/ProgramBuilder";
import { BuildSplitSheet } from "@/components/BuildSplitSheet";
import {
  getStoredVaultFolder, pickVaultFolder, forgetVaultFolder, readVaultFile, readVaultPhotos,
  stripPhotosForVault, supportsVaultFolder, writeVaultFile, writeVaultPhotos,
} from "@/lib/vault-sync";
import { allCsv } from "@/lib/csv-export";
import {
  looksLikeCsv, parseFoodCsv, rowToFood, toCsvUrl, type ParsedRow,
} from "@/lib/food-import";
import { DEFAULT_GOALS } from "@/lib/soma/data";
import { useActiveProgram, useSoma } from "@/lib/store";
import { useBackupDownload } from "@/lib/use-backup";
import { Sized, WidgetGrid } from "@/components/WidgetGrid";
import { ReportSheet } from "@/components/ReportSheet";
import { DEFAULT_GOAL, GOAL_LIST, goalMode } from "@/lib/goal-mode";
import { cn } from "@/lib/utils";
import { widgetStatus } from "@/lib/native/widget-bridge";
import { ALL_WAYS, WAY_NAMES, diagnoseHaptics, testHaptics, tickWay } from "@/lib/haptics";
import { lockScreenStatus, type LockScreenStatus } from "@/lib/native/routine-activity";
import { connectHealth, healthDay, type HealthDay } from "@/lib/native/health";
import { syncHealthNow } from "@/lib/native/health-sync";
import { clearGym, gymStatus, setGymHere } from "@/lib/native/focus-gym";
import {
  applyLiveNow, checkLive, liveStatus, nativeVersion, onLiveStatus, type LiveStatus,
} from "@/lib/native/live-update";
import { forgetNativeVault, isNativeVault, pickNativeVault, storedNativeVault } from "@/lib/native/vault-folder";
import { localPhotoKeys } from "@/lib/habit-photos";

const GOAL_FIELDS = [
  { key: "cals" as const, label: "Calories" },
  { key: "protein" as const, label: "Protein g" },
  { key: "carbs" as const, label: "Carbs g" },
  { key: "fat" as const, label: "Fat g" },
  { key: "fiber" as const, label: "Fiber g" },
  { key: "water" as const, label: "Water ml" },
];

export function SettingsView() {
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const routinesFn = useSoma((s) => s.routines);
  const allExercises = useSoma((s) => s.allExercises);
  const saveRoutine = useSoma((s) => s.saveRoutine);
  const deleteRoutine = useSoma((s) => s.deleteRoutine);
  const importJson = useSoma((s) => s.importJson);
  const resetAll = useSoma((s) => s.resetAll);
  const routines = routinesFn();
  const [editing, setEditing] = useState<string | null>(null);
  const [codeSheet, setCodeSheet] = useState(false);
  const [rtName, setRtName] = useState("");
  const [rtList, setRtList] = useState<{ name: string }[]>([]);
  const [addEx, setAddEx] = useState("");
  const [pending, setPending] = useState<
    { summary: BackupSummary; apply: (mode: "merge" | "replace") => Promise<void> } | null
  >(null);
  const [vaultHandle, setVaultHandleState] = useState<FileSystemDirectoryHandle | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultLastSync, setVaultLastSync] = useState<Date | null>(null);
  // Desktop Chrome through File System Access; the iPhone app through its
  // own folder picker (lib/native/vault-folder.ts). Safari on the web: neither.
  const canVault = supportsVaultFolder() || isNativeVault();
  const clearSeededHabitHistory = useSoma((s) => s.clearSeededHabitHistory);
  const applyGoalsToOpenDays = useSoma((s) => s.applyGoalsToOpenDays);
  const activeProgram = useActiveProgram();
  const [programsOpen, setProgramsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [exercisesOpen, setExercisesOpen] = useState(false);
  // Raw text beside the stored numbers, so a half-typed target is not wiped on
  // every keystroke.
  const [minDrafts, setMinDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(useSoma.getState().settings.nutrientMins ?? {}).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(useSoma.getState().settings.customGoals ?? {}).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [widget, setWidget] = useState<{ shared: boolean; group: string } | null>(null);
  const [lock, setLock] = useState<LockScreenStatus | null>(null);
  const [way, setWay] = useState(tickWay());
  const [buildingSplit, setBuildingSplit] = useState(false);
  const [live, setLive] = useState<LiveStatus>(liveStatus());
  const [installed, setInstalled] = useState<string | null>(null);
  useEffect(() => {
    void nativeVersion().then(setInstalled);
    return onLiveStatus(setLive);
  }, []);
  useEffect(() => {
    void widgetStatus().then(setWidget);
    void lockScreenStatus().then(setLock);
  }, []);
  const [localBusy, setBusy] = useState(false);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [sinceBackup, setSinceBackup] = useState<number | null>(daysSinceBackup());
  const markFresh = useCallback(() => setSinceBackup(0), []);
  // The same call the header icon makes, so a backup taken from either place
  // is the same file and clears the same "overdue" warning.
  const { busy: savingBackup, download } = useBackupDownload(markFresh);
  const busy = localBusy || savingBackup;

  useEffect(() => {
    void storageHealth().then(setHealth);
  }, [busy]);

  /**
   * Exercises matching what has been typed, or the whole catalogue when
   * nothing has. Browsable rather than search-only: with an empty box you
   * should still be able to see what is in there instead of guessing a name.
   */
  const exerciseMatches = useMemo(() => {
    const q = addEx.trim().toLowerCase();
    const all = allExercises();
    if (!q) return all.slice(0, 60);
    return all
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.muscle || "").toLowerCase().includes(q) ||
          (e.subTarget || "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [addEx, allExercises]);

  const openEdit = (name: string) => {
    setEditing(name);
    setRtName(name);
    setRtList(SomaIntelligenceEngine.normalizeRoutine(routines[name] || []));
  };

  const chooseRestore = async (file: File) => {
    const result = parseBackup(await file.text());
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    // Nothing is overwritten until the summary has been seen and confirmed:
    // restoring replaces every log on the device.
    setPending({
      summary: result.summary,
      apply: async (mode: "merge" | "replace") => {
        if (!importJson(JSON.stringify(result.backup.data), mode)) {
          toast.error("That backup could not be applied.");
          return;
        }
        const n = await restorePhotos(result.backup.photos);
        // Scan images live in the same IndexedDB and are restored the same way.
        // A v1 or v2 file simply has none, and the call no-ops.
        const scanned = await restoreScanImages(result.backup.scanImages);
        const exPhotos = await restoreExercisePhotos(result.backup.exercisePhotos);
        const extras = result.summary.hasSideStores
          ? `, ${plural(result.summary.programs, "programme", "programmes")}`
          : "";
        toast.success(
          `Restored ${result.summary.sessions} sessions${extras} and ${n} photo${n === 1 ? "" : "s"}` +
            (scanned ? ` · ${scanned} scan image${scanned === 1 ? "" : "s"}` : ""),
        );
      },
    });
  };

  /**
   * Pull whatever the other device left in the vault folder, then write the
   * merged result back — so the file on disk always ends up holding the
   * union of both devices rather than whichever one synced last overwriting
   * the other's additions.
   *
   * Pulling is always a merge, never a replace: a vault sync must not be able
   * to do what the day-roll bug did — make a day that was really logged look
   * like it never happened because another device's copy of that day was
   * emptier. importJson's merge rule already keeps whatever is on THIS
   * device for a day both sides have, and only fills in days this device is
   * missing, which is exactly the direction that can never lose anything.
   */
  const syncVault = async (handle: FileSystemDirectoryHandle, opts: { silent?: boolean } = {}) => {
    setVaultBusy(true);
    try {
      const found = await readVaultFile(handle);
      if (found) {
        const result = parseBackup(found.text);
        if (!result.ok) {
          toast.error(`Vault file is damaged: ${result.reason}`);
        } else {
          importJson(JSON.stringify(result.backup.data), "merge");
          // Photos live as real files under <vault>/photos now, not embedded
          // as base64 in the JSON — that is the whole point of a vault over a
          // backup file. These two calls still run: an older vault file (or
          // this device's own first sync, before it ever wrote photos out as
          // files) can still carry them embedded, and restorePhotos on an
          // empty array is a no-op.
          await readVaultPhotos(handle, await localPhotoKeys());
          await restorePhotos(result.backup.photos);
          await restoreScanImages(result.backup.scanImages);
          await restoreExercisePhotos(result.backup.exercisePhotos);
        }
      }
      const backup = await buildBackup(JSON.parse(useSoma.getState().exportJson()));
      const { written, keptScanImages } = await writeVaultPhotos(handle, backup);
      await writeVaultFile(handle, JSON.stringify(stripPhotosForVault(backup, keptScanImages)));
      setVaultLastSync(new Date());
      if (!opts.silent) {
        toast.success(`Synced with vault${written ? ` · ${written} photo${written === 1 ? "" : "s"}` : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Vault sync failed.");
    } finally {
      setVaultBusy(false);
    }
  };

  // Reconnects to a previously-chosen folder without asking again, and syncs
  // once immediately — the closest this can get to "just works" without a
  // server: whatever changed elsewhere shows up the moment Setup is opened.
  useEffect(() => {
    if (!canVault) return;
    void (isNativeVault() ? storedNativeVault() : getStoredVaultFolder()).then((handle) => {
      if (!handle) return;
      setVaultHandleState(handle);
      void syncVault(handle, { silent: true });
    });
    // Runs once: re-checking on every render would re-prompt nothing (a
    // denied permission just returns null) but would re-sync constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (exercisesOpen) return <ExercisesView onBack={() => setExercisesOpen(false)} />;

  return (
    // Setup is fourteen unrelated panels sharing a screen, not one form. Which
    // of them you open weekly against never is personal, so they arrange like
    // any other page. The sheets and the version footer carry no key and stay
    // put — they are not cards.
    <WidgetGrid tab="settings">
      <Sized key="exercises" glance={{ label: "Exercises", short: "Exercises", empty: "Open the exercise library", emptyShort: "Open" }}>
      <Card>
        <CardTitle>Exercises</CardTitle>
        <p className="mb-2 text-[0.7rem] leading-snug text-faint">
          Every exercise the app knows — tier them S/A, pick their muscles and give them a
          photo that follows them everywhere their name appears.
        </p>
        <Button className="w-full" onClick={() => setExercisesOpen(true)}>
          Open exercises
        </Button>
      </Card>
      </Sized>

      <Sized key="phase" glance={{ label: "Phase", value: ({ bulk: "Bulk", maintain: "Maintain", cut: "Cut" } as const)[settings.phase ?? "maintain"], sub: "which way you are eating" }}>
      <Card>
        <CardTitle>Phase</CardTitle>
        <p className="mb-2 text-[0.7rem] leading-snug text-faint">
          Which way you are eating. It decides one thing: whether logging hunger costs you
          points. On a cut it never does — being hungry is the deficit working, and docking
          you for it would make the score reward eating more.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["bulk", "Bulk"],
            ["maintain", "Maintain"],
            ["cut", "Cut"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => patchSettings({ phase: id })}
              className={cn(
                "h-11 rounded-xl border text-sm font-bold",
                (settings.phase ?? "maintain") === id
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>
      </Sized>

      <Sized key="goal" glance={{ label: "Training goal", short: "Goal", value: goalMode(settings.trainingGoal).label, sub: goalMode(settings.trainingGoal).blurb }}>
      <Card>
        <CardTitle>Training goal</CardTitle>
        <p className="mb-2 text-[0.7rem] leading-snug text-faint">
          What the weekly volume landmarks are judged against. It does not move the
          mesocycle clock — deload weeks belong to the calendar, and shifting them here
          would relabel every week you have already trained.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_LIST.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => patchSettings({ trainingGoal: g.id })}
              className={cn(
                "h-11 rounded-xl border text-sm font-bold",
                (settings.trainingGoal ?? DEFAULT_GOAL) === g.id
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface-2",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.7rem] leading-snug text-muted">
          {goalMode(settings.trainingGoal).blurb}
        </p>
      </Card>
      </Sized>

      <Sized key="appearance" glance={{ label: "Appearance", short: "Theme", value: String(settings.theme ?? "system").replace(/^./, (c) => c.toUpperCase()) }}>
      <Card>
        <CardTitle>Appearance</CardTitle>
        <div className="mb-4 hidden items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3 lg:flex">
          <div>
            <div className="text-sm font-bold">Workstation layout</div>
            <div className="text-xs text-muted">The desktop layout on this computer: Overview, project table and board, Ctrl+K.</div>
          </div>
          <button
            type="button"
            onClick={() => patchSettings({ workstation: settings.workstation === false ? undefined : false })}
            className={cn(
              "h-9 shrink-0 rounded-xl border px-4 text-sm font-bold",
              settings.workstation === false ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface",
            )}
          >
            {settings.workstation === false ? "Switch to workstation" : "Use classic layout"}
          </button>
        </div>
        <div className="mb-2 text-xs font-bold text-muted">Theme</div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {(["dark", "light", "system"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => patchSettings({ theme: t })}
              className={cn(
                "h-11 rounded-xl border text-sm font-bold capitalize",
                settings.theme === t ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mb-2 text-xs font-bold text-muted">Accent</div>
        <ColorPalette
          value={normalizeAccent(settings.accent)}
          onChange={(c) => patchSettings({ accent: c })}
        />
        <DisplaySize value={settings.uiScale ?? 1} onChange={(v) => patchSettings({ uiScale: v === 1 ? undefined : v })} />
        <div className="mt-5 mb-1 text-xs font-bold text-muted">Bottom tab bar</div>
        <Slider
          label="Transparency"
          value={settings.dockTransparency ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          format={(v) => (v === 0.5 ? "Standard" : `${Math.round(v * 100)}%`)}
          left="Solid"
          right="Clear"
          onChange={(v) => patchSettings({ dockTransparency: v })}
        />
        <Slider
          label="Size"
          value={settings.dockScale ?? 1}
          min={0.8}
          max={1.25}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          left="S"
          right="L"
          onChange={(v) => patchSettings({ dockScale: v })}
        />
      </Card>
      </Sized>

      <Sized key="money" glance={() => {
        const r = ratesOf(settings);
        return { label: "Money", short: "Rates", value: `€1 = ${r.EUR} DA`, sub: `$1 = ${r.USD} DA` };
      }}>
      <Card>
        <CardTitle>Money</CardTitle>
        <div className="mb-2 text-xs font-bold text-muted">Exchange rates, in dinars</div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["EUR", "USD"] as const).map((c) => (
            <label key={c} className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3">
              <span className="text-sm font-bold">{c === "EUR" ? "€1" : "$1"} =</span>
              <input
                key={`${c}-${ratesOf(settings)[c]}`}
                inputMode="decimal"
                defaultValue={String(ratesOf(settings)[c])}
                onBlur={(e) => {
                  const n = parseDecimal(e.target.value);
                  if (n == null || n <= 0) return;
                  patchSettings({ moneyRates: { ...ratesOf(settings), [c]: n } });
                }}
                className="w-full min-w-0 bg-transparent text-right text-sm font-bold tabular outline-none"
                aria-label={`${c} rate`}
              />
              <span className="text-xs text-muted">DA</span>
            </label>
          ))}
        </div>
        <div className="mb-2 text-xs font-bold text-muted">Colours</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["card", "Balance card"],
            ["income", "Income"],
            ["expense", "Expense"],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface-2 p-2">
              <input
                type="color"
                value={colorsOf(settings)[k]}
                onChange={(e) => patchSettings({ moneyColors: { ...settings.moneyColors, [k]: e.target.value } })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent"
              />
              <span className="text-[0.7rem] font-bold">{label}</span>
            </label>
          ))}
        </div>
        {settings.moneyColors && (
          <button
            type="button"
            onClick={() => patchSettings({ moneyColors: undefined })}
            className="mt-3 text-xs font-bold text-muted underline"
          >
            Back to the default colours
          </button>
        )}
      </Card>
      </Sized>

      <Sized key="automations" glance={{ label: "Automations", short: "Auto", empty: "Gym arrival, Deep Work focus", emptyShort: "Set up" }}>
      <AutomationsCard />
      </Sized>

      <Sized key="health" glance={{ label: "Apple Health", short: "Health", empty: "Read sleep, steps and weight", emptyShort: "Connect" }}>
      <HealthCard />
      </Sized>

      <Sized key="training" glance={{ label: "Training", short: "Units", value: settings.unit ?? "kg", sub: "weight unit" }}>
      <Card>
        <CardTitle>Training</CardTitle>
        <Field label="Unit">
          <select
            className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold"
            value={settings.unit}
            onChange={(e) => patchSettings({ unit: e.target.value as "kg" | "lb" })}
          >
            <option value="kg">Kilograms</option>
            <option value="lb">Pounds</option>
          </select>
        </Field>
        <Field label="Bar weight">
          <Input
            type="number"
            value={settings.barWeight}
            onChange={(e) => patchSettings({ barWeight: Number(e.target.value) })}
          />
        </Field>
        <Field label="Default rest (seconds)">
          <Input
            type="number"
            value={settings.restDefault}
            onChange={(e) => patchSettings({ restDefault: Number(e.target.value) })}
          />
        </Field>
        <Field label="Sessions / week (streak target)">
          <Input
            type="number"
            value={settings.sessionsPerWeek}
            onChange={(e) => patchSettings({ sessionsPerWeek: Number(e.target.value) })}
          />
        </Field>
        <div className="mt-3 flex items-center justify-between">
          <span className="min-w-0 pr-3 text-sm font-semibold">Auto rest timer</span>
          <Toggle on={settings.autoRest} onChange={(v) => patchSettings({ autoRest: v })} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="min-w-0 pr-3 text-sm font-semibold">Sounds</span>
          <Toggle on={settings.sound} onChange={(v) => patchSettings({ sound: v })} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="min-w-0 pr-3 text-sm font-semibold">Confetti on PRs</span>
          <Toggle on={settings.confetti} onChange={(v) => patchSettings({ confetti: v })} />
        </div>
      </Card>
      </Sized>

      <Sized key="nutrition" glance={{ label: "Nutrition", short: "Protein", value: settings.proteinPerKg ? String(settings.proteinPerKg) : null, unit: "g/kg", sub: settings.autoProteinTarget ? "protein follows bodyweight" : "fixed protein target", empty: "Default protein" }}>
      <Card>
        <CardTitle>Nutrition</CardTitle>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-sm font-semibold">Auto protein from bodyweight</span>
          <Toggle on={settings.autoProteinTarget} onChange={(v) => patchSettings({ autoProteinTarget: v })} />
        </div>
        <Field label="Protein g / kg">
          <Input
            type="number"
            step="0.1"
            value={settings.proteinPerKg}
            onChange={(e) => patchSettings({ proteinPerKg: Number(e.target.value) })}
          />
        </Field>
        <Field label="Creatine stash (g)">
          <Input
            type="number"
            value={settings.creatineStashGrams}
            onChange={(e) => patchSettings({ creatineStashGrams: Number(e.target.value) })}
          />
        </Field>
      </Card>
      </Sized>

      {codeSheet && <RoutineCodeSheet onClose={() => setCodeSheet(false)} />}

      <Sized key="routines" glance={() => ({ label: "Routines", lines: Object.keys(routines).map((name) => ({ text: name, value: `${routines[name]?.length || 0}` })), empty: "No routines", emptyShort: "None" })}>
      <Card>
        <CardTitle>
          <span>Routines</span>
          {/* Code before New. Pasting a programme someone sent is the common
              errand; building one by hand is the rare one. */}
          <span className="flex shrink-0 gap-1.5">
            <Button size="sm" onClick={() => setCodeSheet(true)}>
              Code
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setEditing("__new");
                setRtName("");
                setRtList([]);
              }}
            >
              New
            </Button>
          </span>
        </CardTitle>
        {editing === null ? (
          <div className="space-y-1">
            {Object.keys(routines).map((name) => (
              <div key={name} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border py-2">
                {/* A routine name the user chose plus two buttons is not a
                    width this app controls. Wrapping keeps both reachable;
                    without it the Delete button went off the right edge of
                    the screen and took the rest of the page with it. */}
                <div className="min-w-0">
                  <div className="text-sm font-bold">{name}</div>
                  <div className="text-[0.7rem] text-faint">{routines[name]?.length || 0} movements</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" onClick={() => openEdit(name)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => deleteRoutine(name)}>
                    Del
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <Field label="Name">
              <Input value={rtName} onChange={(e) => setRtName(e.target.value)} />
            </Field>
            <div className="mb-2 space-y-1">
              {rtList.map((it, i) => (
                <div key={`${it.name}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <ExerciseIcon name={it.name} size={24} />
                    <span className="truncate">{it.name}</span>
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...rtList];
                        [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                        setRtList(next);
                      }}
                    >
                      Up
                    </Button>
                    <Button
                      size="sm"
                      disabled={i === rtList.length - 1}
                      onClick={() => {
                        const next = [...rtList];
                        [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
                        setRtList(next);
                      }}
                    >
                      Down
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRtList(rtList.filter((_, j) => j !== i))}>
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {/* A real list, not a <datalist>. Safari on iOS ignores datalist
                entirely, so on the phone this app runs on the box offered no
                suggestions at all and the only way in was to type a name from
                memory, exactly. */}
            <div className="flex gap-2">
              <Input
                value={addEx}
                onChange={(e) => setAddEx(e.target.value)}
                placeholder="Search an exercise to add"
              />
              <Button
                disabled={!addEx.trim()}
                onClick={() => {
                  if (!addEx.trim()) return;
                  setRtList([...rtList, { name: addEx.trim() }]);
                  setAddEx("");
                }}
              >
                Add
              </Button>
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-border">
              {exerciseMatches.length === 0 ? (
                <p className="px-3 py-3 text-center text-[0.7rem] text-faint">
                  No exercise matches “{addEx}”. Add is still available — it saves the name
                  as typed.
                </p>
              ) : (
                exerciseMatches.map((e) => {
                  const already = rtList.some((r) => r.name === e.name);
                  return (
                    <button
                      key={e.name}
                      type="button"
                      onClick={() => {
                        setRtList([...rtList, { name: e.name }]);
                        setAddEx("");
                      }}
                      className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left last:border-0 active:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[0.75rem] font-bold">{e.name}</span>
                        <span className="block truncate text-[0.6rem] text-faint">
                          {e.muscle}
                          {e.subTarget ? ` · ${e.subTarget}` : ""}
                        </span>
                      </span>
                      {already && (
                        <span className="shrink-0 text-[0.55rem] font-bold uppercase text-accent-text">
                          added
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" onClick={() => setEditing(null)}>
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  const err = saveRoutine(rtName, rtList, editing === "__new" ? undefined : editing);
                  if (err) toast.error(err);
                  else {
                    toast.success("Routine saved");
                    setEditing(null);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </Card>
      </Sized>

      <Sized key="report" glance={{ label: "Report", empty: "Tap to build a report", emptyShort: "Open" }}>
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle className="mb-0">Report</CardTitle>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold"
          >
            Open
          </button>
        </div>
        <p className="text-[0.7rem] leading-snug text-faint">
          A printable summary of the last week, month or quarter. iOS&apos;s print sheet saves
          it as a PDF and offers AirDrop, so this is the export — nothing leaves the phone
          unless you send it.
        </p>
      </Card>
      </Sized>

      <Sized key="data" glance={{ label: "Backup and restore", short: "Backup", empty: "Back up or restore everything", emptyShort: "Open" }}>
      <Card>
        <CardTitle>Data</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Everything lives on this device only, so a backup is the only copy if this phone
          is lost or Safari clears its data.
        </p>

        <div className="mb-3 grid gap-1.5 rounded-xl border border-border bg-surface-2 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">On-device storage</span>
            {health?.state === "persisted" ? (
              <Badge tone="good">Protected</Badge>
            ) : health?.state === "denied" ? (
              <Badge tone="warn">Evictable</Badge>
            ) : (
              <Badge>Unknown</Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">Used</span>
            <span className="tabular font-bold">
              {formatBytes(health?.usedBytes ?? null)}
              {health?.quotaBytes ? " of " + formatBytes(health.quotaBytes) : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">Last backup</span>
            <span
              className={cn(
                "font-bold",
                sinceBackup === null || sinceBackup >= 7 ? "text-warn" : "text-accent-text",
              )}
            >
              {sinceBackup === null
                ? "never"
                : sinceBackup === 0
                  ? "today"
                  : sinceBackup + (sinceBackup === 1 ? " day ago" : " days ago")}
            </span>
          </div>
          {health?.state === "denied" && (
            <button
              type="button"
              className="mt-1 text-left text-[0.7rem] font-bold text-accent-text underline"
              onClick={() => {
                void requestPersistence().then((r) => {
                  void storageHealth().then(setHealth);
                  toast(
                    r === "persisted"
                      ? "Storage protected"
                      : "Safari refused. Add SOMA to your Home Screen and it is usually granted.",
                  );
                });
              }}
            >
              Ask again to protect this data
            </button>
          )}
        </div>

        {backupIsDue() && (
          <p className="mb-3 rounded-xl border border-warn/30 bg-warn/10 p-2.5 text-[0.7rem] font-semibold text-warn">
            {sinceBackup === null
              ? "You have never backed up. Save one to Files or iCloud Drive now."
              : "Your last backup is " + sinceBackup + " days old."}
          </p>
        )}
        <p className="mb-2 text-[0.7rem] leading-relaxed text-faint">
          A backup holds everything but pictures: every session and correction, all nutrition,
          water and creatine, habits, your foods and scanned barcodes, your programmes and
          weekday splits, saved meals, membership periods, supplements, and every face scan's
          measurements and 3D data. Photos are kept as ordinary .jpg files in your vault
          folder (Vault sync, below) — which is what keeps this file small.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void download()}>
            {busy ? "Preparing…" : "Save backup"}
          </Button>
          <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface-2 text-sm font-semibold">
            Restore backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset the input so picking the same file twice still fires.
                e.target.value = "";
                if (file) void chooseRestore(file);
              }}
            />
          </label>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Reset all SOMA data to the demo log?")) {
                resetAll();
                toast.success("Reset to demo data");
              }
            }}
          >
            Reset to demo
          </Button>
        </div>
      </Card>
      </Sized>

      <Sized key="sync" glance={{ label: "Device sync", short: "Sync", empty: "Sync your phone and PC, encrypted", emptyShort: "Open" }}>
        <SyncSettings />
      </Sized>

      <Sized key="vault" glance={{ label: "Vault sync", short: "Vault", empty: "Sync SOMA with a folder", emptyShort: "Open" }}>
      <Card>
        <CardTitle>Vault sync</CardTitle>
        {canVault ? (
          <>
            <p className="mb-3 text-xs text-muted">
              Point this at a folder synced by iCloud Drive (or Dropbox, or anything else),
              and open the same folder from SOMA on your other devices — on iPhone, pick
              the iCloud Drive folder your PC's vault is in. Not instant — it
              syncs whenever a device is opened, same as the files themselves sync. Photos
              save into it as ordinary .jpg files, not buried in the sync file's text, so
              they open from Files or Explorer directly and the file itself stays small.
            </p>
            {vaultHandle ? (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  Connected to <b className="text-fg">{vaultHandle.name}</b>
                  {vaultLastSync && ` · synced ${vaultLastSync.toLocaleTimeString()}`}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={vaultBusy}
                    onClick={() => void syncVault(vaultHandle)}
                  >
                    {vaultBusy ? "Syncing…" : "Sync now"}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      void (isNativeVault() ? forgetNativeVault() : forgetVaultFolder());
                      setVaultHandleState(null);
                      setVaultLastSync(null);
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                disabled={vaultBusy}
                onClick={() => {
                  void (async () => {
                    try {
                      const handle = isNativeVault() ? await pickNativeVault() : await pickVaultFolder();
                      if (!handle) return;
                      setVaultHandleState(handle);
                      await syncVault(handle);
                    } catch (err) {
                      // A cancelled folder picker is a decision, not an error.
                      if (err instanceof DOMException && err.name === "AbortError") return;
                      toast.error(err instanceof Error ? err.message : "Could not open that folder.");
                    }
                  })();
                }}
              >
                Choose vault folder
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted">
            This browser can't hold a folder open for live sync. On iOS, Save backup and
            Restore backup above already reach iCloud Drive through the share sheet and
            Files picker — save there and Restore backup on your other device picks up
            the same file.
          </p>
        )}
      </Card>
      </Sized>

      <Sized key="foods" glance={{ label: "Import foods", short: "Foods", empty: "Bring in a food list", emptyShort: "Import" }}>
        <FoodImportCard />
      </Sized>

      <Sized key="csv" glance={{ label: "Export as CSV", short: "CSV", empty: "Export your logs as spreadsheets", emptyShort: "Export" }}>
      <Card>
        <CardTitle>Export as CSV</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Three plain spreadsheets — every set, every food, and a day-by-day summary.
          One file per shape, because sets and meals share nothing but a date and
          flattening them together produces a sheet full of blanks. This is for taking
          your data elsewhere; restoring still needs the backup file.
        </p>
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                const files = allCsv(useSoma.getState().history, useSoma.getState().nutrition);
                for (const f of files) {
                  if (!f.rows) continue;
                  await saveBackupFile(f.content, f.name, "text/csv");
                }
                const total = files.reduce((n, f) => n + f.rows, 0);
                toast.success(`Exported ${total} rows across ${files.filter((f) => f.rows).length} files`);
              } catch {
                toast.error("Could not write the CSV files.");
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Export CSV
        </Button>
      </Card>
      </Sized>

      <Sized key="programme" glance={{ label: "Training programme", short: "Programme", value: activeProgram.name, sub: activeProgram.kind === "week" ? "fixed weekdays" : `${activeProgram.days.length}-day cycle` }}>
      <Card>
        <CardTitle>Training programme</CardTitle>
        <button
          type="button"
          onClick={() => setBuildingSplit(true)}
          className="mb-3 w-full rounded-xl border border-accent/40 bg-accent/10 py-2.5 text-xs font-extrabold text-accent-text"
        >
          Build my split from my logged workouts
        </button>
        {buildingSplit && <BuildSplitSheet onClose={() => setBuildingSplit(false)} />}
        <p className="mb-3 text-xs text-muted">
          Currently on <b className="text-fg">{activeProgram.name}</b> —{" "}
          {activeProgram.kind === "week"
            ? "fixed weekdays"
            : `${activeProgram.days.length}-day cycle`}
          . This decides the calendar, the split Train opens on, and what Ahead projects
          against.
        </p>
        {/* The week, in Settings, without opening the builder. The card used to
            describe the programme in the abstract — "6-day cycle" — and say
            nothing about which day is which. */}
        <div className="mb-3 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const proj = SomaIntelligenceEngine.getProgramProjectedDay(
              d,
              settings.scheduleOverrides,
              activeProgram,
            );
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg border px-0.5 py-1 text-center",
                  i === 0 ? "border-accent bg-accent/10" : "border-border bg-surface-2",
                )}
              >
                <div className="text-[0.52rem] font-bold uppercase text-faint">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div
                  className={cn(
                    "mt-0.5 truncate text-[0.55rem] font-extrabold uppercase",
                    proj.isRest ? "text-faint" : "text-accent-text",
                  )}
                >
                  {proj.isRest ? "REST" : (proj.split.split(/[\s(]/)[0] ?? "").slice(0, 5)}
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="primary" className="w-full" onClick={() => setProgramsOpen(true)}>
          Change programme, or move a day
        </Button>
      </Card>
      </Sized>

      <Sized key="targets" glance={() => {
          const g = { ...DEFAULT_GOALS, ...(settings.customGoals ?? {}) };
          return {
            label: "Daily nutrition targets",
            short: "Targets",
            value: String(g.cals),
            unit: "kcal",
            stats: [
              { label: "Protein", value: `${g.protein}g` },
              { label: "Carbs", value: `${g.carbs}g` },
              { label: "Fat", value: `${g.fat}g` },
              { label: "Water", value: `${(g.water / 1000).toFixed(1)}L` },
            ],
          };
        }}>
      <Card>
        <CardTitle>Daily nutrition targets</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Leave a field blank to keep following the default — protein blank also keeps
          following your bodyweight when that setting is on.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_FIELDS.map((g) => (
            <label key={g.key} className="text-[0.62rem] font-bold uppercase tracking-wide text-faint">
              {g.label}
              <DecimalInput
                className="mt-1"
                placeholder={String(DEFAULT_GOALS[g.key])}
                value={goalDrafts[g.key] ?? ""}
                onValueChange={(n, raw) => {
                  setGoalDrafts({ ...goalDrafts, [g.key]: raw });
                  const next = { ...(settings.customGoals ?? {}) };
                  if (n == null) delete next[g.key];
                  else next[g.key] = n;
                  patchSettings({ customGoals: next });
                }}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 text-[0.7rem] font-bold uppercase tracking-wide text-muted">Minimums</div>
        <p className="mb-2 mt-0.5 text-xs text-muted">
          The least that still counts as a good day. Drawn as a second line on the Fuel
          charts; blank means no minimum.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_FIELDS.map((g) => (
            <label key={g.key} className="text-[0.62rem] font-bold uppercase tracking-wide text-faint">
              {g.label}
              <DecimalInput
                className="mt-1"
                placeholder="None"
                value={minDrafts[g.key] ?? ""}
                onValueChange={(n, raw) => {
                  setMinDrafts({ ...minDrafts, [g.key]: raw });
                  const next = { ...(settings.nutrientMins ?? {}) };
                  if (n == null || n <= 0) delete next[g.key];
                  else next[g.key] = n;
                  patchSettings({ nutrientMins: next });
                }}
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-[0.68rem] leading-snug text-faint">
          Today and any day with nothing logged follow this as you type. A past day
          with food in it keeps the target it was scored under, so editing this
          never rewrites history.
        </p>
        <Button
          className="mt-2 w-full"
          onClick={() => {
            const n = applyGoalsToOpenDays();
            toast.success(
              n ? `Applied to ${n} ${n === 1 ? "day" : "days"}` : "Everything already matches",
            );
          }}
        >
          Re-apply to open days
        </Button>
      </Card>
      </Sized>

      <Sized key="habit-history" glance={{ label: "Habit history", short: "History", empty: "Past habits and their records", emptyShort: "Open" }}>
      <Card>
        <CardTitle>Habit history</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Early builds seeded 48 days of invented habit history. Now that the grid lights
          by streak, that fiction reads as momentum you did not earn. This clears every
          habit day-mark — including any real ones, which cannot be told apart from the
          seeded ones after the fact.
        </p>
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            const n = clearSeededHabitHistory();
            toast.success(
              n ? `Cleared ${n} habit ${n === 1 ? "day" : "days"}` : "Habit history was already empty",
            );
          }}
        >
          Clear all habit days
        </Button>
      </Card>
      </Sized>

      <Sized key="about" glance={{ label: "About", value: __APP_VERSION__, sub: "SOMA" }}>
      <Card>
        <CardTitle>About</CardTitle>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Version</span>
          {/* Stamped at build time from the CI tag, so this cannot drift from
              what actually shipped the way a hand-edited number does. */}
          <span className="font-bold tabular-nums">{__APP_VERSION__}</span>
        </div>
        {installed && installed !== __APP_VERSION__ && (
          <>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted">Installed build</span>
              <span className="font-bold tabular-nums">{installed}</span>
            </div>
            {/* Says, in so many words, that the version above came over the
                air — the proof that live updates work on this phone. */}
            <div className="mt-1 flex items-center justify-between gap-3 text-xs">
              <span className="shrink-0 text-muted">Delivered</span>
              <span className="truncate font-bold text-emerald-400">
                ⚡ live update, no reinstall
              </span>
            </div>
          </>
        )}
        {live.state !== "off" && (
          <div className="mt-1 flex items-center justify-between gap-3 text-xs">
            <span className="shrink-0 text-muted">Updates</span>
            {live.state === "ready" ? (
              <button type="button" onClick={() => void applyLiveNow()} className="truncate font-bold text-accent-text">
                {live.version} ready — restart now
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  // The line is cut short on a phone; the whole message goes
                  // in a toast so an error can actually be read.
                  if (live.state === "error") toast.error(live.message, { duration: 12000 });
                  void checkLive(true);
                }}
                className={cn(
                  "truncate font-bold",
                  live.state === "reinstall" || live.state === "error" ? "text-warn" : "text-emerald-400",
                )}
              >
                {live.state === "checking"
                  ? "Checking…"
                  : live.state === "downloading"
                    ? `Downloading ${live.version}…`
                    : live.state === "current"
                      ? `Up to date (checked ${new Date(live.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}) · check`
                      : live.state === "reinstall"
                        ? `${live.version} needs a reinstall from SideStore`
                        : `${live.message} · retry`}
              </button>
            )}
          </div>
        )}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-muted">Data</span>
          <span className="font-bold">on this device only</span>
        </div>
        {widget && (
          <div className="mt-1 flex items-center justify-between gap-3 text-xs">
            <span className="shrink-0 text-muted">Home-screen widget</span>
            <span className={cn("truncate font-bold", widget.shared ? "text-emerald-400" : "text-warn")}>
              {widget.shared ? "Connected" : "Not connected — reinstall with App Groups"}
            </span>
          </div>
        )}
        {lock && (
          <>
            <StatusRow
              label="Widget extension"
              ok={lock.extension}
              good="Installed"
              bad="Missing — Sideloadly dropped it"
            />
            {lock.extension && lock.extensionSignedRight !== undefined && (
              <StatusRow
                label="Widget signing"
                ok={lock.extensionSignedRight}
                good="Signed for itself"
                bad={
                  lock.extensionSignedFor
                    ? `Signed for ${lock.extensionSignedFor} — iOS ignores it`
                    : "No profile of its own — iOS ignores it"
                }
              />
            )}
            <StatusRow
              label="Live Activities"
              ok={lock.activitiesEnabled}
              good="Allowed"
              bad="Off — Settings › SOMA › Live Activities"
            />
            <div className="mt-1 flex items-center justify-between gap-3 text-xs">
              <span className="shrink-0 text-muted">Vibration test</span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {ALL_WAYS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() =>
                      void testHaptics(w).then((m) => {
                        setWay(tickWay());
                        toast(m);
                      })
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-bold",
                      way === w ? "border-accent bg-accent/15 text-accent-text" : "border-border bg-surface-2",
                    )}
                  >
                    {WAY_NAMES[w]}
                  </button>
                ))}
              </span>
            </div>
            <p className="mt-1 text-[0.65rem] leading-snug text-faint">
              Tap each one; the one you feel is what the whole app uses. Feel
              none? Check Settings › Sounds &amp; Haptics › System Haptics (on)
              and Haptics (Always Play), and Accessibility › Touch › Vibration.
            </p>
            <button
              type="button"
              onClick={() => void diagnoseHaptics().then((m) => toast(m, { duration: 12000 }))}
              className="mt-1.5 self-start rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-bold"
            >
              Diagnose vibration
            </button>
            <StatusRow
              label="Timer alerts"
              ok={lock.notifications}
              good="Allowed"
              bad="Off — Settings › SOMA › Notifications"
            />
          </>
        )}
      </Card>
      </Sized>

      {reportOpen && <ReportSheet onClose={() => setReportOpen(false)} />}

      {programsOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-bg pt-[max(12px,var(--safe-top,env(safe-area-inset-top)))]">
          <div className="flex items-center justify-between border-b border-border px-4 pb-3">
            <span className="font-display text-base font-extrabold">Programme</span>
            <button
              type="button"
              onClick={() => setProgramsOpen(false)}
              className="text-xs font-bold text-accent-text"
            >
              Close
            </button>
          </div>
          <div className="soma-view flex-1 overflow-y-auto px-4 py-4">
            <ProgramBuilder onClose={() => setProgramsOpen(false)} />
          </div>
        </div>
      )}


      {pending && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/85 p-4 sm:items-center">
          <Card className="w-full max-w-md space-y-3">
            <CardTitle>Restore this backup?</CardTitle>
            <p className="text-xs text-muted">
              Taken {new Date(pending.summary.exportedAt).toLocaleString()}.
            </p>
            <p className="text-xs text-muted">
              <b className="text-fg">Merge</b> adds anything this device is missing and keeps
              what is already here — nothing is lost. <b className="text-fg">Replace</b> throws
              away everything on the device first, and is only for restoring onto a phone with
              nothing on it.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Sessions" value={pending.summary.sessions} />
              <Stat label="Logged days" value={pending.summary.loggedDays} />
              <Stat label="Habits" value={pending.summary.habits} />
              <Stat label="Photos" value={pending.summary.photos} />
            </div>
            {/* Named rather than counted, because the point of showing them is
                that they are IN the file at all — every backup written before
                v2 left all four out. */}
            <p className="text-[0.7rem] leading-relaxed text-faint">
              Also inside: {plural(pending.summary.customFoods, "food", "foods")},{" "}
              {plural(pending.summary.customExercises, "custom exercise", "custom exercises")}
              {pending.summary.hasSideStores ? (
                <>
                  , {plural(pending.summary.programs, "programme", "programmes")},{" "}
                  {plural(pending.summary.recipes, "saved meal", "saved meals")},{" "}
                  {plural(pending.summary.membership, "membership period", "membership periods")}{" "}
                  and {plural(pending.summary.supplements, "supplement", "supplements")}.
                </>
              ) : (
                "."
              )}
            </p>
            {!pending.summary.hasSideStores && (
              <p className="rounded-xl border border-warn/30 bg-warn/10 p-2.5 text-[0.7rem] font-semibold text-warn">
                This file was saved before programmes, saved meals, membership and supplements
                were included. Those four are left exactly as they are on this phone — even by
                Replace, which will not clear what the file cannot restore.
              </p>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setPending(null)}>
                Cancel
              </Button>
              {/* Merge is the primary action. Restoring a backup should only
                  ever be able to add — reaching for one must not cost data. */}
              <Button
                variant="primary"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void pending.apply("merge").finally(() => {
                    setBusy(false);
                    setPending(null);
                  });
                }}
              >
                Merge
              </Button>
            </div>
            <Button
              variant="danger"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void pending.apply("replace").finally(() => {
                  setBusy(false);
                  setPending(null);
                });
              }}
            >
              Replace everything
            </Button>
          </Card>
        </div>
      )}

      <p className="px-1 text-center text-[0.7rem] text-faint">
        SOMA Smart Coach · converted from the Obsidian suite · data never leaves this device
      </p>
      <Badge className="mx-auto flex w-fit">v5.2 · live</Badge>
    </WidgetGrid>
  );
}

/** "1 programme", "2 programmes" — English rather than "1 programmes". */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 text-xs font-bold text-muted">{label}</div>
      {children}
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        // shrink-0: in a flex row with a long label the track was being
        // squeezed narrower than its own knob.
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        on ? "bg-accent" : "bg-surface-3",
      )}
    >
      <span
        className={cn(
          // 48px track - 24px knob - 2px gap = 22px of travel, which leaves an
          // even 2px either side. translate-x-5 left 4px on the right and 2px
          // on the left, so the knob never looked centred in either state.
          "absolute left-0 top-0.5 size-6 rounded-full bg-fg transition-transform",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-2.5">
      <div className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">{label}</div>
      <div className="tabular font-display text-lg font-extrabold">{value}</div>
    </div>
  );
}

/**
 * Loading a spreadsheet of foods into the library.
 *
 * The honest route to a large branded catalogue. Real barcodes and real label
 * figures have to come from a source that knows them — a shop's own sheet does
 * — and once imported they live on the device, so scanning one works offline
 * and instantly.
 */
function FoodImportCard() {
  const importFoods = useSoma((s) => s.importFoods);
  const customFoods = useSoma((s) => s.customFoods);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; unmapped: string[]; skipped: number } | null>(null);

  const withBarcodes = customFoods.filter((f) => f.barcode).length;

  const load = (text: string) => {
    if (!looksLikeCsv(text)) {
      toast.error("That came back as a web page, not a sheet. Share it with anyone-with-the-link first.");
      return;
    }
    const parsed = parseFoodCsv(text);
    if (!parsed.rows.length) {
      toast.error("No rows found. The first line should be the column headings.");
      return;
    }
    setPreview(parsed);
  };

  const fetchSheet = async () => {
    const target = toCsvUrl(url);
    if (!target) {
      toast.error("Paste a Google Sheets link, or any URL that serves a CSV.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(target);
      if (!res.ok) throw new Error(String(res.status));
      load(await res.text());
    } catch {
      toast.error("Could not fetch that sheet. Check it is shared with anyone with the link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle>Import foods from a sheet</CardTitle>
      <p className="mb-3 text-xs leading-snug text-muted">
        Paste a published Google Sheet or pick a CSV, and every row joins your food
        library — with its barcode, so scanning it later works offline. Columns are
        matched by heading in English or French: <b className="text-fg">name</b>,{" "}
        <b className="text-fg">barcode</b>, kcal, protein, carbs, fat, fibre, water%.
        Values are per 100g unless a <b className="text-fg">serving</b> column says
        otherwise.
      </p>

      <Input
        className="mb-2"
        placeholder="https://docs.google.com/spreadsheets/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="flex gap-2">
        <Button className="flex-1" variant="primary" disabled={busy || !url.trim()} onClick={() => void fetchSheet()}>
          {busy ? "Fetching…" : "Load sheet"}
        </Button>
        <label className="flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface-2 text-sm font-semibold">
          Pick a CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void file.text().then(load);
            }}
          />
        </label>
      </div>

      {withBarcodes > 0 && (
        <p className="mt-2 text-[0.65rem] text-faint">
          {withBarcodes} {withBarcodes === 1 ? "food" : "foods"} in your library already
          carry a barcode and resolve without a connection.
        </p>
      )}

      {preview && (
        <div className="mt-3 rounded-xl border border-accent/40 bg-surface-2 p-3">
          <div className="mb-1 text-sm font-bold">
            {preview.rows.length} {preview.rows.length === 1 ? "row" : "rows"} ready
          </div>
          <div className="mb-2 text-[0.68rem] leading-snug text-muted">
            {preview.rows.filter((r) => r.barcode).length} with a barcode ·{" "}
            {preview.rows.filter((r) => r.cals != null).length} with calories
            {preview.skipped > 0 && ` · ${preview.skipped} skipped for having no name`}
          </div>
          {preview.unmapped.length > 0 && (
            <p className="mb-2 text-[0.62rem] leading-snug text-warn">
              Columns not recognised and ignored: {preview.unmapped.slice(0, 6).join(", ")}
              {preview.unmapped.length > 6 && ` and ${preview.unmapped.length - 6} more`}.
            </p>
          )}
          <div className="mb-2 max-h-32 overflow-y-auto rounded-lg border border-border bg-surface">
            {preview.rows.slice(0, 25).map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 last:border-0">
                <span className="min-w-0 truncate text-[0.68rem] font-semibold">{r.name}</span>
                <span className="shrink-0 text-[0.6rem] tabular-nums text-faint">
                  {r.cals ?? "–"} kcal{r.barcode ? " · scan" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-[1.4]"
              onClick={() => {
                const { added, updated } = importFoods(preview.rows.map(rowToFood));
                setPreview(null);
                setUrl("");
                toast.success(
                  updated
                    ? `Added ${added}, updated ${updated}`
                    : `Added ${added} ${added === 1 ? "food" : "foods"}`,
                );
              }}
            >
              Add to library
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** One line of the phone's own answer to "why isn't it showing?". */
function StatusRow({ label, ok, good, bad }: { label: string; ok: boolean; good: string; bad: string }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted">{label}</span>
      <span className={cn("truncate font-bold", ok ? "text-emerald-400" : "text-warn")}>{ok ? good : bad}</span>
    </div>
  );
}

/**
 * Apple Health: ask once, then read today's numbers and fill the gaps.
 * Read-only — nothing is ever written to Health.
 */
function HealthCard() {
  const nutrition = useSoma((s) => s.nutrition);
  const logSleep = useSoma((s) => s.logSleep);
  const logWeight = useSoma((s) => s.logWeight);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const [day, setDay] = useState<HealthDay | null>(null);
  const [busy, setBusy] = useState(false);
  /** What the last Connect said, kept on screen rather than in a toast. */
  const [status, setStatus] = useState("");
  const today = getLocalDateKey(new Date());
  const logged = nutrition[today];

  const read = async () => {
    setBusy(true);
    const d = await healthDay(today);
    setBusy(false);
    setDay(d);
    if (!d) toast.error("Apple Health did not answer — is this the new install?");
    else if (d.errors?.length) toast.error(d.errors[0]!);
  };
  const fill = () => {
    if (!day) return;
    if (useSoma.getState().activeDate !== today) setActiveDate(today);
    const done: string[] = [];
    if (day.sleepHours && logged?.sleep?.hours == null) {
      logSleep(Math.round(day.sleepHours * 10) / 10);
      done.push("sleep");
    }
    if (day.weightKg && day.weightDate === today && !logged?.bodyWeight) {
      logWeight(Math.round(day.weightKg * 10) / 10);
      done.push("weight");
    }
    toast.success(done.length ? `Filled today's ${done.join(" and ")}` : "Nothing to fill — today already has it");
  };

  return (
    <Card>
      <CardTitle>Apple Health</CardTitle>
      <p className="mb-3 text-xs text-muted">
        Both ways: workouts, sleep and weight you log here go to Health (workouts show in Fitness), and
        today's sleep and weight from Health fill in here when missing. Nothing leaves the phone.
      </p>
      {settings.healthSync && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-xs">
          <span className="font-bold text-accent-text">Sync is on</span>
          <span className="flex gap-3">
            <button type="button" className="font-bold underline" onClick={() => void syncHealthNow().then((n) => toast(n ? `Synced ${n}` : "Already in sync"))}>
              Sync now
            </button>
            <button type="button" className="font-bold text-muted underline" onClick={() => patchSettings({ healthSync: false })}>
              Turn off
            </button>
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            void connectHealth().then((m) => {
              setStatus(m);
              // Connecting is the opt-in: sync runs from here on.
              if (m.startsWith("Asked")) {
                patchSettings({ healthSync: true });
                void syncHealthNow().then((n) => n && toast.success(`Synced ${n} with Apple Health`));
              }
            })
          }
        >
          {settings.healthSync ? "Reconnect" : "Connect"}
        </Button>
        <Button onClick={() => void read()} disabled={busy}>{busy ? "Reading…" : "Read today"}</Button>
        {day && <Button variant="primary" onClick={fill}>Fill today</Button>}
      </div>
      {status && (
        <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[0.72rem] font-semibold">{status}</p>
      )}
      {day && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {[
            ["Steps", day.steps != null ? Math.round(day.steps).toLocaleString() : "—"],
            ["Active", day.activeKcal != null ? `${Math.round(day.activeKcal)} kcal` : "—"],
            ["Sleep", day.sleepHours != null ? `${day.sleepHours.toFixed(1)} h` : "—"],
            ["Weight", day.weightKg != null ? `${day.weightKg.toFixed(1)} kg${day.weightDate !== today ? ` (${day.weightDate})` : ""}` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 px-3 py-2">
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">{k}</div>
              <div className="font-bold tabular">{v}</div>
            </div>
          ))}
        </div>
      )}
      {day && Object.keys(day).length === 0 && (
        <p className="mt-2 text-[0.7rem] text-faint">
          Empty — either nothing is in Health for today, or access was refused (Settings › Health › Data Access &amp; Devices › SOMA).
        </p>
      )}
    </Card>
  );
}

/**
 * The things that happen without a tap: the gym region and the Deep Work
 * focus. Each says plainly what it needs from iOS, since both are switched on
 * outside the app.
 */
function AutomationsCard() {
  const [gym, setGym] = useState<{ set: boolean; always: boolean } | null>(null);
  const [msg, setMsg] = useState("");
  const focusToday = useSoma((s) => s.settings.focusByDay?.[getLocalDateKey(new Date())] ?? 0);
  const focusOn = useSoma((s) => !!s.settings.focusActiveSince);
  useEffect(() => {
    void gymStatus().then(setGym);
  }, []);
  return (
    <Card>
      <CardTitle>Automations</CardTitle>

      <div className="mb-1 text-sm font-bold">Arriving at the gym</div>
      <p className="mb-2 text-xs text-muted">
        Stand in your gym and tap the button once. From then on, arriving there sends a nudge and opens
        Train on today's session.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() =>
            void setGymHere().then((m) => {
              setMsg(m);
              void gymStatus().then(setGym);
            })
          }
        >
          {gym?.set ? "Move gym to here" : "I'm at my gym — save it"}
        </Button>
        {gym?.set && (
          <Button
            onClick={() =>
              void clearGym().then(() => {
                setMsg("Gym removed");
                void gymStatus().then(setGym);
              })
            }
          >
            Remove
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-[0.7rem] text-faint">
        {gym == null
          ? "Needs the latest install."
          : gym.set
            ? gym.always
              ? "Gym saved · watching for arrivals"
              : "Gym saved · set Location to Always for arrivals while SOMA is closed"
            : "No gym saved yet"}
      </p>
      {msg && <p className="mt-1 rounded-xl bg-surface-2 px-3 py-2 text-[0.72rem] font-semibold">{msg}</p>}

      <div className="mb-1 mt-4 text-sm font-bold">Deep work with a Focus</div>
      <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted">
        <li>iPhone Settings › Focus › pick or make a "Deep Work" focus</li>
        <li>Scroll to Focus Filters › Add Filter › SOMA</li>
        <li>Turn on "Count as deep work"</li>
      </ol>
      <p className="mt-1.5 text-[0.7rem] text-faint">
        Time in that focus counts here, and a habit set to "Deep Work focus for…" ticks itself.
        {` Today: ${focusToday} min${focusOn ? " · focus on now" : ""}.`}
      </p>

      <div className="mb-1 mt-4 text-sm font-bold">Mindful minutes</div>
      <p className="text-xs text-muted">
        Read from Apple Health (Mindfulness, Breathe, or any meditation app). Give a habit the "Mindful
        minutes" rule.
      </p>
    </Card>
  );
}

/**
 * Display size, like the phone's own Display Zoom but for SOMA alone. The
 * slider shows the number while it moves and only applies on release, so the
 * page does not reflow under the finger.
 */
function DisplaySize({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const pct = Math.round(draft * 100);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold text-muted">Display size</span>
        <span className="font-display text-sm font-extrabold tabular">{pct}%</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[0.7rem] font-bold text-faint">A</span>
        <input
          type="range"
          min={80}
          max={130}
          step={5}
          value={pct}
          onChange={(e) => setDraft(Number(e.target.value) / 100)}
          onPointerUp={() => onChange(draft)}
          onTouchEnd={() => onChange(draft)}
          onKeyUp={() => onChange(draft)}
          className="h-2 flex-1 accent-[var(--color-accent)]"
          aria-label="Display size"
        />
        <span className="text-base font-bold text-faint">A</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {[0.9, 1, 1.1, 1.2].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 rounded-full border py-1.5 text-xs font-bold",
              Math.abs(value - v) < 0.001 ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-muted",
            )}
          >
            {v === 1 ? "Default" : `${Math.round(v * 100)}%`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A labelled slider that applies on release, so nothing reflows mid-drag. */
function Slider({
  label, value, min, max, step, format, left, right, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  left: string;
  right: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (Math.abs(draft - value) > 1e-6) onChange(Math.round(draft * 100) / 100);
  };
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[0.75rem] font-semibold">{label}</span>
        <span className="text-xs font-extrabold tabular">{format(draft)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-8 text-[0.65rem] font-bold text-faint">{left}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="h-2 flex-1 accent-[var(--color-accent)]"
          aria-label={label}
        />
        <span className="w-8 text-right text-[0.65rem] font-bold text-faint">{right}</span>
      </div>
    </div>
  );
}
