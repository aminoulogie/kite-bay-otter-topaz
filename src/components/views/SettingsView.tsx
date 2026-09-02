import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ACCENT_PRESETS, SomaIntelligenceEngine, normalizeAccent } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

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

  const openEdit = (name: string) => {
    setEditing(name);
    setRtName(name);
    setRtList(SomaIntelligenceEngine.normalizeRoutine(routines[name] || []));
  };

  const download = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soma-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
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
          <span className="text-sm font-semibold">Auto rest timer</span>
          <Toggle on={settings.autoRest} onChange={(v) => patchSettings({ autoRest: v })} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Sounds</span>
          <Toggle on={settings.sound} onChange={(v) => patchSettings({ sound: v })} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Confetti on PRs</span>
          <Toggle on={settings.confetti} onChange={(v) => patchSettings({ confetti: v })} />
        </div>
      </Card>

      <Card>
        <CardTitle>Nutrition</CardTitle>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Auto protein from bodyweight</span>
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
        <p className="mb-3 text-xs text-muted">Everything lives on this device. Export a JSON backup before you wipe.</p>
        <div className="flex flex-col gap-2">
          <Button onClick={download}>Download backup</Button>
          <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface-2 text-sm font-semibold">
            Restore backup
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                if (importJson(text)) toast.success("Restored");
                else toast.error("Invalid backup");
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
        "relative h-7 w-12 rounded-full transition-colors",
        on ? "bg-accent" : "bg-surface-3",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-6 rounded-full bg-fg transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
