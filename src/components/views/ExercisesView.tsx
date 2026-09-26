import { useMemo, useState } from "react";
import { Camera, ChevronLeft, Image as ImageIcon, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ExerciseIcon } from "@/components/ExerciseIcon";
import { TopTabs } from "@/components/TopTabs";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { deleteExercisePhoto, saveExercisePhotoBlob } from "@/lib/habit-photos";
import { pickFiles } from "@/lib/file-picker";
import msData from "@/lib/ms-exercises.json";
import { useSoma } from "@/lib/store";
import type { ExerciseDef } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Every exercise the app knows, in one place: the shipped database plus the
 * user's own — with a tier, a target muscle and (when set) a photo that
 * follows the exercise everywhere its name appears.
 */

const MUSCLES: { key: string; label: string }[] = [
  { key: "chest", label: "Chest" },
  { key: "upper_back", label: "Lats / Back" },
  { key: "trapezius", label: "Traps" },
  { key: "trapezius_back", label: "Mid-Back" },
  { key: "deltoids", label: "Front Delts" },
  { key: "deltoids_back", label: "Side / Rear Delts" },
  { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" },
  { key: "triceps_back", label: "Triceps (long)" },
  { key: "forearm", label: "Forearms" },
  { key: "forearm_back", label: "Forearms (back)" },
  { key: "quadriceps", label: "Quads" },
  { key: "hamstring", label: "Hamstrings" },
  { key: "gluteal", label: "Glutes" },
  { key: "adductors", label: "Adductors" },
  { key: "adductors_back", label: "Adductors (back)" },
  { key: "calves", label: "Calves" },
  { key: "calves_back", label: "Calves (back)" },
  { key: "abs", label: "Abs" },
  { key: "obliques", label: "Obliques" },
  { key: "lower_back", label: "Lower Back" },
  { key: "tibialis", label: "Tibialis" },
  { key: "neck", label: "Neck" },
];

const TIERS = [
  { id: "S-Tier", label: "S" },
  { id: "A-Tier", label: "A" },
  { id: "", label: "–" },
];

export function ExercisesView({ onBack }: { onBack: () => void }) {
  const customs = useSoma((s) => s.customExercises);
  const upsert = useSoma((s) => s.upsertCustomExercise);
  const importAll = useSoma((s) => s.importExercises);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "muscle" | "tier">("name");
  const [editing, setEditing] = useState<ExerciseDef | null>(null);

  // allExercises() builds a fresh array per call — select the stable slice
  // and derive once, or zustand's snapshot comparison loops forever.
  const all = useMemo(() => useSoma.getState().allExercises(), [customs]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = all.filter(
      (e) => !needle || e.name.toLowerCase().includes(needle) || e.muscle.toLowerCase().includes(needle) || (e.tier || "").toLowerCase().includes(needle),
    );
    const tierRank = (t: string) => (t.toLowerCase().startsWith("s") ? 0 : t.toLowerCase().startsWith("a") ? 1 : 2);
    return filtered.sort((a, b) =>
      sort === "muscle"
        ? a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name)
        : sort === "tier"
          ? tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
  }, [all, q, sort]);

  const count = list.length;
  const msCount = (msData as { name: string }[]).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back" className="grid size-9 place-items-center rounded-xl border border-border bg-surface-2 text-muted">
          <ChevronLeft className="size-4" />
        </button>
        <h2 className="font-display text-lg font-extrabold">Exercises</h2>
        <span className="ml-auto text-[0.7rem] font-bold text-faint">{count} total</span>
      </div>

      {/* The app's own input, with the icon laid over it: a second border and
          background around a styled input is what made this bar read as a
          different material from every other field on the screen. */}
      <div className="relative mb-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, muscle or tier"
          className="pl-9 pr-9"
        />
        {q && (
          <button type="button" aria-label="Clear" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">
            ✕
          </button>
        )}
      </div>

      <TopTabs
        tabs={[
          { id: "name", label: "A–Z" },
          { id: "muscle", label: "Muscle" },
          { id: "tier", label: "Tier" },
        ]}
        value={sort}
        onChange={setSort}
        className="mb-1"
      />

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() =>
            setEditing({ name: "", muscle: "Chest", subTarget: "", targetKeys: ["chest"], position: "", risk: "Low", tier: "", isAxial: false, isBW: false })
          }
        >
          <Plus className="size-4" /> New exercise
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            importAll(msData as { name: string; muscle?: string }[]);
            toast.success(`${msCount} exercises imported from Muscle & Strength`);
          }}
        >
          Import {msCount} from M&amp;S
        </Button>
      </div>

      <div className="space-y-1.5">
        {list.map((e) => (
          <button
            key={e.name}
            type="button"
            onClick={() => setEditing(e)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2 text-left active:scale-[0.99]"
          >
            <ExerciseIcon name={e.name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.85rem] font-bold">{e.name}</span>
              <span className="block truncate text-[0.65rem] text-faint">{e.muscle}{e.subTarget ? ` · ${e.subTarget}` : ""}</span>
            </span>
            {e.photoId && <Camera className="size-3.5 shrink-0 text-faint" />}
          </button>
        ))}
      </div>

      {editing && <EditSheet ex={editing} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}

function EditSheet({ ex, onClose, onSave }: { ex: ExerciseDef; onClose: () => void; onSave: (ex: ExerciseDef) => void }) {
  const isCustom = useSoma((s) => !s.customExercises.length || s.customExercises.some((c) => c.name === ex.name)) || !ex.name;
  const [name, setName] = useState(ex.name);
  const [tier, setTier] = useState(ex.tier || "");
  const [keys, setKeys] = useState<string[]>(ex.targetKeys ?? []);
  const [photoId, setPhotoId] = useState(ex.photoId);
  /**
   * The picture just picked, shown before anything is read back.
   *
   * The icon reads its blob out of IndexedDB by id, and the id only reaches the
   * library when the sheet is saved — so without this the one thing the user
   * looks at after choosing a photo was the OLD tile, and a working picker
   * looked like a broken one.
   */
  const [preview, setPreview] = useState<string | null>(null);

  const pickPhoto = async (source: "camera" | "library") => {
    const files = await pickFiles({
      accept: "image/*",
      ...(source === "camera" ? { capture: "environment" as const } : {}),
    });
    const file = files[0];
    if (!file) return;
    const id = photoId || `ex:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    try {
      await saveExercisePhotoBlob(id, file);
    } catch {
      toast.error("That image could not be read. Try another one.");
      return;
    }
    setPhotoId(id);
    setPreview(URL.createObjectURL(file));
    // Written straight through, not held for Save: the photo is its own act,
    // and a picture that vanishes because the sheet was closed is worse than
    // no picture at all.
    onSave({
      name: (name.trim() || ex.name) as string,
      muscle: MUSCLES.find((m) => m.key === keys[0])?.label ?? ex.muscle ?? "Custom",
      subTarget: ex.subTarget ?? "",
      targetKeys: keys,
      position: ex.position ?? "",
      risk: ex.risk ?? "Low",
      tier,
      isAxial: !!ex.isAxial,
      isBW: !!ex.isBW,
      photoId: id,
      img: ex.img,
    });
    toast.success("Photo saved — it shows with this exercise everywhere");
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    onSave({
      name: n,
      muscle: MUSCLES.find((m) => m.key === keys[0])?.label ?? ex.muscle ?? "Custom",
      subTarget: ex.subTarget ?? "",
      targetKeys: keys,
      position: ex.position ?? "",
      risk: ex.risk ?? "Low",
      tier,
      isAxial: !!ex.isAxial,
      isBW: !!ex.isBW,
      photoId,
      img: ex.img,
    });
    toast.success(`${n} saved`);
    onClose();
  };

  const toggleKey = (k: string) => setKeys((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div className="fixed inset-0 z-[92] flex flex-col justify-end" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div className="soma-expand relative max-h-[88vh] overflow-y-auto rounded-t-3xl bg-surface px-4 pb-8 pt-4" onClick={(e) => e.stopPropagation()}>
        <CardTitle className="mb-3 flex items-center justify-between">
          {isCustom ? "New / custom exercise" : "Edit exercise"}
          <button type="button" onClick={onClose} aria-label="Close" className="text-faint">✕</button>
        </CardTitle>

        <div className="mb-3 flex items-center gap-3">
          {preview ? (
            <span className="relative inline-grid size-[52px] shrink-0 place-items-center overflow-hidden rounded-[22%] border border-border">
              <img src={preview} alt="" className="h-full w-full object-cover" />
            </span>
          ) : (
            <ExerciseIcon name={name || "?"} size={52} />
          )}
          <div className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name" className="mb-2" />
            <div className="flex gap-1.5">
              <Button variant="outline" className="flex-1" onClick={() => void pickPhoto("camera")}>
                <Camera className="size-4" /> Camera
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => void pickPhoto("library")}>
                <ImageIcon className="size-4" /> Photos
              </Button>
              {photoId && (
                <Button
                  variant="outline"
                  aria-label="Remove photo"
                  onClick={() => {
                    void deleteExercisePhoto(photoId);
                    setPhotoId(undefined);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-wide text-faint">Tier</p>
        <div className="mb-3 flex gap-1.5">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              className={cn(
                "flex-1 rounded-xl border px-2 py-2 font-display text-sm font-extrabold",
                tier === t.id ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-wide text-faint">Target muscles</p>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleKey(m.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.68rem] font-bold",
                keys.includes(m.key) ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Pinned to the bottom of the sheet, not parked under twenty-three
            muscle chips: the button that saves the thing has to be visible
            without scrolling to find it. */}
        <div className="sticky bottom-0 -mx-4 mt-4 bg-surface px-4 pb-1 pt-2">
          <Button className="w-full" onClick={save}>
            Save exercise
          </Button>
        </div>
      </div>
    </div>
  );
}
