import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FoodItem } from "@/lib/types";

const MEALS = ["Breakfast", "Lunch", "Dinner", "Pre-Workout", "Post-Workout", "Snacks"];

/**
 * Log a meal you cannot look up.
 *
 * Restaurant food, a plate at someone's house, the thing your mother cooked —
 * none of it is in a database and none of it has a barcode. Without this the
 * only options were to invent a library entry that would then pollute search
 * forever, or to log nothing. Logging nothing is what actually happened, and a
 * day with a missing lunch scores as though the lunch was skipped.
 *
 * Calories are the one required field. Protein is offered because it is the
 * macro the rest of the app leans on and the one people can usually estimate;
 * carbs and fat are optional and stay at zero rather than being guessed. A
 * zero here means "not recorded", which is the reading the rest of the app
 * already gives an unfilled macro.
 */
export function QuickAddSheet({
  meal: initialMeal,
  onAdd,
  onClose,
}: {
  meal: string;
  onAdd: (item: FoodItem) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [cals, setCals] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [meal, setMeal] = useState(initialMeal);

  const num = (v: string) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
  };
  const kcal = num(cals);

  const submit = () => {
    if (!kcal) return;
    const label = name.trim() || "Quick add";
    onAdd({
      name: label,
      // Serving is the portion itself, so editing it later re-scales sensibly
      // instead of dividing an estimate by a made-up 100g basis.
      serving: 1,
      unit: "serving",
      cals: Math.round(kcal),
      p: num(p),
      c: num(c),
      f: num(f),
      fiber: 0,
      meal,
      isBase: false,
      // Deliberately NOT added to the library. An estimate of one plate is not
      // a food anyone should find in search next week.
      per100: undefined,
    } as unknown as FoodItem);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-bg/85 p-4 sm:items-center">
      <Card className="max-h-[88vh] w-full max-w-md space-y-3 overflow-y-auto">
        <CardTitle>
          <span>Quick add</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-muted" />
          </button>
        </CardTitle>

        <p className="text-[0.7rem] leading-snug text-faint">
          For food you cannot look up — a restaurant plate, someone else&apos;s cooking.
          It goes into today only, not into your food library.
        </p>

        <div>
          <label className="mb-1 block text-xs font-bold text-muted">Calories</label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="600"
            value={cals}
            onChange={(e) => setCals(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-muted">
            What was it? <span className="font-normal text-faint">(optional)</span>
          </label>
          <Input
            placeholder="Couscous at my mother's"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-muted">
            Macros in grams <span className="font-normal text-faint">(leave blank if unknown)</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["Protein", p, setP],
              ["Carbs", c, setC],
              ["Fat", f, setF],
            ] as const).map(([label, value, set]) => (
              <div key={label}>
                <div className="mb-1 text-center text-[0.58rem] font-bold uppercase tracking-wider text-faint">
                  {label}
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="text-center"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
              </div>
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
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-bold",
                  meal === m ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" disabled={!kcal} onClick={submit}>
            Add {kcal ? `${Math.round(kcal)} kcal` : ""}
          </Button>
        </div>
      </Card>
    </div>
  );
}
