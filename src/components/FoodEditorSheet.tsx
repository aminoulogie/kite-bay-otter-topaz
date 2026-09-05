import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { useSoma } from "@/lib/store";
import type { FoodItem } from "@/lib/types";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

/**
 * Edit any food in the library, shipped ones included.
 *
 * A shipped figure being wrong is not a rare case — packaging differs by
 * country and reformulates constantly — and a food you cannot correct is one
 * you work around by creating a near-duplicate, which is worse for the data
 * than just letting it be edited.
 *
 * Base foods are never mutated. Editing one writes a custom food under the
 * same name, which the library prefers; reverting simply deletes that
 * override, so the shipped values come back rather than being approximated.
 */

const FIELDS: { key: keyof FoodItem; label: string; unit: string }[] = [
  { key: "cals", label: "Calories", unit: "kcal" },
  { key: "p", label: "Protein", unit: "g" },
  { key: "c", label: "Carbs", unit: "g" },
  { key: "f", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "iron", label: "Iron", unit: "mg" },
  { key: "magnesium", label: "Magnesium", unit: "mg" },
  { key: "zinc", label: "Zinc", unit: "mg" },
];

export function FoodEditorSheet({
  food,
  onClose,
}: {
  food: FoodItem;
  onClose: () => void;
}) {
  const sheetRef = useSheet(onClose);
  const upsertLibraryFood = useSoma((s) => s.upsertLibraryFood);
  const removeCustomFood = useSoma((s) => s.removeCustomFood);
  const isEdited = useSoma((s) => s.isFoodEdited(food.name));

  const [name, setName] = useState(food.name);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map((f) => [f.key, food[f.key] != null ? String(food[f.key]) : ""]),
    ),
  );

  const isBase = !!(food as { isBase?: boolean }).isBase && !isEdited;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="soma-sheet max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />

        <div className="mb-3 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-sm font-extrabold">Edit food</div>
            <div className="text-[0.65rem] text-muted">
              per {food.serving || 100}
              {food.unit || "g"}
              {isBase && " · shipped value"}
              {isEdited && " · edited"}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-bold text-accent-text">
            Close
          </button>
        </div>

        <label className="mb-3 block text-[0.62rem] font-bold uppercase tracking-wide text-faint">
          Name
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-2">
          {FIELDS.map((f) => (
            <label key={String(f.key)} className="text-[0.62rem] font-bold uppercase tracking-wide text-faint">
              {f.label} <span className="normal-case text-faint/70">{f.unit}</span>
              <DecimalInput
                className="mt-1"
                placeholder="0"
                value={draft[f.key as string] ?? ""}
                onValueChange={(_n, raw) => setDraft({ ...draft, [f.key as string]: raw })}
              />
            </label>
          ))}
        </div>

        <Button
          variant="primary"
          className="mt-3 w-full"
          onClick={() => {
            const next: FoodItem = { ...food, name: name.trim() || food.name };
            for (const f of FIELDS) {
              const raw = (draft[f.key as string] ?? "").replace(",", ".");
              const n = raw.trim() === "" ? 0 : Number(raw);
              (next as unknown as Record<string, number>)[f.key as string] = Number.isFinite(n) ? n : 0;
            }
            upsertLibraryFood(next);
            onClose();
          }}
        >
          Save
        </Button>

        {isEdited && (
          <Button
            className={cn("mt-2 w-full")}
            onClick={() => {
              // Deleting the override restores the shipped figures exactly,
              // rather than writing an approximation of them back.
              removeCustomFood(food.name);
              onClose();
            }}
          >
            Revert to shipped values
          </Button>
        )}
      </div>
    </div>
  );
}
