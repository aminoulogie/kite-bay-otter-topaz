import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FoodItem } from "@/lib/types";

const MEALS = ["Breakfast", "Lunch", "Dinner", "Post-Workout", "Snacks"];
const QUICK = [50, 100, 150, 200, 250];

/**
 * Per-100g basis for an item.
 *
 * Items logged before portions existed have no `per100`, so it is derived
 * from what was stored. Deriving needs a non-zero serving — dividing by zero
 * would turn an edit into NaN across every macro.
 */
export function basisOf(item: FoodItem): NonNullable<FoodItem["per100"]> {
  if (item.per100) return item.per100;
  const g = item.serving > 0 ? item.serving : 100;
  const per = (v: number) => (v / g) * 100;
  return {
    cals: per(item.cals),
    p: per(item.p),
    c: per(item.c),
    f: per(item.f),
    fiber: per(item.fiber || 0),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Re-scales an item to `grams`, always from its per-100g basis. */
export function scaleTo(item: FoodItem, grams: number, meal: string): FoodItem {
  const b = basisOf(item);
  const k = grams / 100;
  return {
    ...item,
    per100: b,
    serving: grams,
    unit: "g",
    meal,
    cals: Math.round(b.cals * k),
    p: round1(b.p * k),
    c: round1(b.c * k),
    f: round1(b.f * k),
    fiber: round1((b.fiber || 0) * k),
    sodium: round1((item.sodium || 0) * (item.serving ? grams / item.serving : 1)),
    potassium: round1((item.potassium || 0) * (item.serving ? grams / item.serving : 1)),
  };
}

/**
 * Asks how much of something was eaten, and shows the macros that portion
 * works out to before it is committed. Doubles as the editor for an already
 * logged item, so a mistyped 500g is one tap away from being fixed rather
 * than needing a delete and a re-log.
 */
export function PortionSheet({
  item,
  meal: initialMeal,
  mode,
  onConfirm,
  onDelete,
  onClose,
}: {
  item: FoodItem;
  meal: string;
  mode: "add" | "edit";
  onConfirm: (next: FoodItem) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [grams, setGrams] = useState(String(item.serving || 100));
  const [meal, setMeal] = useState(initialMeal);

  const n = Number(grams);
  const valid = Number.isFinite(n) && n > 0;
  const preview = scaleTo(item, valid ? n : 0, meal);

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-bg/85 p-4 sm:items-center">
      <Card className="w-full max-w-md space-y-3">
        <CardTitle>
          <span className="min-w-0 truncate">{item.name}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-muted" />
          </button>
        </CardTitle>

        <div>
          <label className="mb-1 block text-xs font-bold text-muted">Amount in grams</label>
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            min={1}
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setGrams(String(q))}
                className="h-8 rounded-full bg-surface-2 px-3 text-xs font-bold text-muted"
              >
                {q}g
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-muted">Meal</label>
          <div className="flex flex-wrap gap-1.5">
            {MEALS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMeal(m)}
                className={`h-8 rounded-full px-3 text-xs font-bold ${
                  meal === m ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-surface-2 p-2.5 text-center">
          {[
            ["kcal", preview.cals],
            ["P", preview.p],
            ["C", preview.c],
            ["F", preview.f],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="text-[0.58rem] font-bold uppercase tracking-wider text-faint">{label}</div>
              <div className="tabular font-display text-base font-extrabold">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {mode === "edit" && onDelete && (
            <Button variant="danger" onClick={onDelete} aria-label="Remove item">
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!valid}
            onClick={() => onConfirm(scaleTo(item, n, meal))}
          >
            {mode === "add" ? "Add" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
