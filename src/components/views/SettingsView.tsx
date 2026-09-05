import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { ACCENT_PRESETS, SomaIntelligenceEngine, normalizeAccent } from "@/lib/soma";
import { buildBackup, parseBackup, restorePhotos, saveBackupFile, type BackupSummary } from "@/lib/backup";
import {
  backupIsDue, daysSinceBackup, formatBytes, markBackedUp, requestPersistence,
  storageHealth, type StorageHealth,
} from "@/lib/storage-health";
import { allCsv } from "@/lib/csv-export";
import { DEFAULT_GOALS } from "@/lib/soma/data";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

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
  const exportJson = useSoma((s) => s.exportJson);
  const importJson = useSoma((s) => s.importJson);
  const resetAll = useSoma((s) => s.resetAll);
  const routines = routinesFn();
  const [editing, setEditing] = useState<string | null>(null);
  const [rtName, setRtName] = useState("");
  const [rtList, setRtList] = useState<{ name: string }[]>([]);
  const [addEx, setAddEx] = useState("");
  const [pending, setPending] = useState<
    { summary: BackupSummary; apply: (mode: "merge" | "replace") => Promise<void> } | null
  >(null);
  const clearSeededHabitHistory = useSoma((s) => s.clearSeededHabitHistory);
  const applyGoalsToOpenDays = useSoma((s) => s.applyGoalsToOpenDays);
  // Raw text beside the stored numbers, so a half-typed target is not wiped on
  // every keystroke.
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(useSoma.getState().settings.customGoals ?? {}).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [sinceBackup, setSinceBackup] = useState<number | null>(daysSinceBackup());

  useEffect(() => {
    void storageHealth().then(setHealth);
  }, [busy]);

  const openEdit = (name: string) => {
    setEditing(name);
    setRtName(name);
    setRtList(SomaIntelligenceEngine.normalizeRoutine(routines[name] || []));
  };

  const download = async () => {
    setBusy(true);
    try {
      const backup = await buildBackup(JSON.parse(exportJson()));
      const json = JSON.stringify(backup);
      const name = `soma-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const how = await saveBackupFile(json, name);
      markBackedUp();
      setSinceBackup(0);
      const mb = (json.length / 1048576).toFixed(1);
      toast.success(
        how === "shared"
          ? `Backup ready to save (${mb} MB, ${backup.photos.length} photos)`
          : `Downloaded ${name} (${mb} MB)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the backup.");
    } finally {
      setBusy(false);
    }
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
        toast.success(
          `Restored ${result.summary.sessions} sessions and ${n} photo${n === 1 ? "" : "s"}`,
        );
      },
    });
  };

  return (
    <div className="space-y-3 pb-4">
      <Card>
        <CardTitle>Appearance</CardTitle>
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
        <div className="grid grid-cols-5 gap-2">
          {ACCENT_PRESETS.map((p: { id: string; color: string; label: string }) => (
            <button
              key={p.id}
              type="button"
              aria-label={p.label}
              onClick={() => patchSettings({ accent: p.color })}
              className={cn(
                "aspect-square rounded-xl border-2",
                normalizeAccent(settings.accent).toLowerCase() === p.color.toLowerCase()
                  ? "border-fg"
                  : "border-transparent",
              )}
              style={{ background: p.color }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="color"
            value={normalizeAccent(settings.accent)}
            onChange={(e) => patchSettings({ accent: e.target.value })}
            className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface-2"
          />
          <span className="text-xs text-muted">Or pick any colour</span>
        </div>
      </Card>

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

      <Card>
        <CardTitle>
          <span>Routines</span>
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
        </CardTitle>
        {editing === null ? (
          <div className="space-y-1">
            {Object.keys(routines).map((name) => (
              <div key={name} className="flex items-center justify-between border-b border-border py-2">
                <div>
                  <div className="text-sm font-bold">{name}</div>
                  <div className="text-[0.7rem] text-faint">{routines[name]?.length || 0} movements</div>
                </div>
                <div className="flex gap-1">
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
                <div key={`${it.name}-${i}`} className="flex items-center justify-between text-sm">
                  <span>{it.name}</span>
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
            <div className="flex gap-2">
              <Input
                list="ex-list"
                value={addEx}
                onChange={(e) => setAddEx(e.target.value)}
                placeholder="Add exercise"
              />
              <datalist id="ex-list">
                {allExercises().map((e) => (
                  <option key={e.name} value={e.name} />
                ))}
              </datalist>
              <Button
                onClick={() => {
                  if (!addEx.trim()) return;
                  setRtList([...rtList, { name: addEx.trim() }]);
                  setAddEx("");
                }}
              >
                Add
              </Button>
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

      <Card>
        <CardTitle>Data</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Everything lives on this device only. A backup includes your logs, habits and
          habit photos — it is the only copy if this phone is lost or Safari clears its data.
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
        <Button
          className="mt-3 w-full"
          variant="primary"
          onClick={() => {
            const n = applyGoalsToOpenDays();
            toast.success(
              n ? `Applied to ${n} ${n === 1 ? "day" : "days"}` : "Nothing to update",
            );
          }}
        >
          Apply to today
        </Button>
      </Card>

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

      <Card>
        <CardTitle>About</CardTitle>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Version</span>
          {/* Stamped at build time from the CI tag, so this cannot drift from
              what actually shipped the way a hand-edited number does. */}
          <span className="font-bold tabular-nums">{__APP_VERSION__}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-muted">Data</span>
          <span className="font-bold">on this device only</span>
        </div>
      </Card>

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
      <Badge className="mx-auto flex w-fit">v5.1</Badge>
    </div>
  );
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
