import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { looksLikeDrink, suggestWaterPct, waterMlFor } from "@/lib/hydration";
import { cn } from "@/lib/utils";
import type { FoodItem } from "@/lib/types";

const MEALS = ["Breakfast", "Lunch", "Dinner", "Post-Workout", "Snacks"];

/**
 * Quick amounts, per unit.
 *
 * A drink is not served in 50g steps — the useful sizes are a glass, a can, a
 * half-litre and a litre — so the row changes with the unit rather than
 * offering kitchen-scale numbers for something poured from a carton.
 */
const QUICK_G = [50, 100, 150, 200, 250];
const QUICK_ML = [200, 250, 330, 500, 1000];

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

/**
 * Re-scales an item to `grams`, always from its per-100g basis.
 *
 * `unit` and `waterPct` ride along so a drink logged in millilitres stays a
 * drink when it is edited, and its water is recomputed for the new size
 * instead of being left at whatever the first portion happened to be.
 */
export function scaleTo(
  item: FoodItem,
  grams: number,
  meal: string,
  unit: string = item.unit || "g",
  waterPct: number = item.waterPct ?? 0,
): FoodItem {
  const b = basisOf(item);
  const k = grams / 100;
  return {
    ...item,
    per100: b,
    serving: grams,
    unit,
    meal,
    waterPct: waterPct || undefined,
    waterMl: waterMlFor(grams, waterPct) || undefined,
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
 *
 * Drinks get two extra controls: millilitres as a unit, and how much of the
 * drink is water. Without the second one a litre of juice was 450 calories and
 * zero hydration, which is not what happened.
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
  const [unit, setUnit] = useState<"g" | "ml">(() =>
    item.unit === "ml" || looksLikeDrink(item.name, item.waterPct) ? "ml" : "g",
  );
  // An item already carrying a percentage keeps it; anything else starts from
  // what the name suggests, which is right for juice and milk and zero for
  // everything the table has no basis for.
  const [waterPct, setWaterPct] = useState(() =>
    String(item.waterPct ?? suggestWaterPct(item.name)),
  );

  const n = Number(grams);
  const valid = Number.isFinite(n) && n > 0;
  const pct = Math.max(0, Math.min(100, Number(waterPct) || 0));
  const preview = scaleTo(item, valid ? n : 0, meal, unit, pct);
  const quick = unit === "ml" ? QUICK_ML : QUICK_G;

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-bg/85 p-4 sm:items-center">
      <Card className="max-h-[88vh] w-full max-w-md space-y-3 overflow-y-auto">
        <CardTitle>
          <span className="min-w-0 truncate">{item.name}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-muted" />
          </button>
        </CardTitle>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-bold text-muted">
              Amount in {unit === "ml" ? "millilitres" : "grams"}
            </label>
            {/* Millilitres are not a different measurement here, they are a
                different label on the same number — but a carton says 1 L, not
                1000 g, and typing what the packet says is the whole point. */}
            <div className="flex gap-1">
              {(["g", "ml"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn(
                    "h-7 rounded-full px-2.5 text-[0.65rem] font-bold transition-colors",
                    unit === u ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            min={1}
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setGrams(String(q))}
                className="h-8 rounded-full bg-surface-2 px-3 text-xs font-bold text-muted"
              >
                {q >= 1000 && unit === "ml" ? `${q / 1000}L` : `${q}${unit}`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className="text-xs font-bold text-muted">Water content</label>
            <span className="text-[0.68rem] font-bold tabular-nums text-info">
              {preview.waterMl || 0} ml to your water
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              className="w-20 text-center"
              value={waterPct}
              onChange={(e) => setWaterPct(e.target.value)}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => setWaterPct(e.target.value)}
              aria-label="Percent of this food that is water"
              className="min-w-0 flex-1 accent-[var(--color-accent)]"
            />
          </div>
          <p className="mt-1 text-[0.6rem] leading-snug text-faint">
            Percent of the drink that is water — roughly 88% for juice and milk, 100% for
            water itself. It counts towards the day&apos;s water and follows this item, so
            deleting it takes its water back out.
          </p>
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
            onClick={() => onConfirm(scaleTo(item, n, meal, unit, pct))}
          >
            {mode === "add" ? "Add" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
