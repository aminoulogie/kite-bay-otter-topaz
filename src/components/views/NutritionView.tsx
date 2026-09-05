import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { PortionSheet } from "@/components/PortionSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { NutritionGraphs } from "@/components/NutritionGraphs";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { BASE_FOOD_LIBRARY, DEFAULT_GOALS, SomaIntelligenceEngine } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { FoodItem } from "@/lib/types";

const MEALS = ["Breakfast", "Lunch", "Dinner", "Post-Workout", "Snacks"];

export function NutritionView() {
  const nutrition = useSoma((s) => s.nutrition);
  const history = useSoma((s) => s.history);
  const activeDate = useSoma((s) => s.activeDate);
  const customFoods = useSoma((s) => s.customFoods);
  const ensureDay = useSoma((s) => s.ensureDay);
  const addFood = useSoma((s) => s.addFood);
  const removeFood = useSoma((s) => s.removeFood);
  const addWater = useSoma((s) => s.addWater);
  const setWater = useSoma((s) => s.setWater);
  const updateFood = useSoma((s) => s.updateFood);
  const addCustomFood = useSoma((s) => s.addCustomFood);
  const removeCustomFood = useSoma((s) => s.removeCustomFood);
  const settings = useSoma((s) => s.settings);

  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState("Breakfast");
  // A Set, not one name: opening dinner used to collapse breakfast, so
  // comparing two meals meant reopening one every time.
  const [openMeals, setOpenMeals] = useState<Set<string>>(() => new Set(["Breakfast"]));
  const toggleMeal = (m: string) =>
    setOpenMeals((prev) => {
      const next = new Set(prev);
      if (!next.delete(m)) next.add(m);
      return next;
    });
  const [custom, setCustom] = useState({ name: "", cals: 0, p: 0, c: 0, f: 0, serving: 100 });
  // The raw text is kept beside the parsed numbers so a value mid-typing —
  // "12," on the way to "12,5" — is not erased on every keystroke.
  const [customRaw, setCustomRaw] = useState({ cals: "", p: "", c: "", f: "" });
  const [scanning, setScanning] = useState(false);
  // The library is browsable, not search-only: with nothing typed you should
  // still be able to see what is in there rather than having to guess a name.
  const [showAll, setShowAll] = useState(false);
  // One sheet drives both logging a portion and editing a logged one.
  const [portion, setPortion] = useState<
    { item: FoodItem; meal: string; mode: "add" | "edit"; idx?: number } | null
  >(null);

  useEffect(() => {
    ensureDay(activeDate);
  }, [activeDate, ensureDay]);

  const day = nutrition[activeDate] || {
    goals: { ...DEFAULT_GOALS },
    water: 0,
    items: [],
  };
  const goals = day.goals || DEFAULT_GOALS;
  const items = day.items || [];
  const workout = history[activeDate];
  const burn = workout?.caloriesBurned || 0;

  const totals = items.reduce(
    (a, i) => ({
      cals: a.cals + (i.cals || 0),
      p: a.p + (i.p || 0),
      c: a.c + (i.c || 0),
      f: a.f + (i.f || 0),
      fiber: a.fiber + (i.fiber || 0),
    }),
    { cals: 0, p: 0, c: 0, f: 0, fiber: 0 },
  );
  const goalCals = goals.cals + burn;
  const tdee = SomaIntelligenceEngine.computeMaintenanceCalories(nutrition);
  const formula = SomaIntelligenceEngine.formulaMaintenance(day.bodyWeight || 78) || 2400;
  const maintenance = tdee && tdee.ok ? tdee.maintenance : formula;

  const library = useMemo(() => [...BASE_FOOD_LIBRARY, ...customFoods], [customFoods]);
  const matches = library.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase()),
  );
  const hits = query ? matches.slice(0, 8) : showAll ? matches : [];

  const openPortion = (f: {
    name: string; serving: number; unit: string; cals: number; p: number; c: number; f: number;
    fiber?: number; sodium?: number; potassium?: number; calcium?: number; iron?: number;
    magnesium?: number; zinc?: number;
  }) => {
    setPortion({
      mode: "add",
      meal,
      item: {
        name: f.name,
        serving: f.serving || 100,
        unit: f.unit || "g",
        cals: f.cals, p: f.p, c: f.c, f: f.f,
        fiber: f.fiber || 0,
        sodium: f.sodium || 0, potassium: f.potassium || 0, calcium: f.calcium || 0,
        iron: f.iron || 0, magnesium: f.magnesium || 0, zinc: f.zinc || 0,
        meal,
      },
    });
    setQuery("");
  };

  const waterPct = Math.min(100, Math.round(((day.water || 0) / (goals.water || 3500)) * 100));

  return (
    <div className="space-y-3 pb-4">
      <Card className="overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_55%),var(--color-surface)]">
        <div className="flex items-start justify-between">
          <div>
            <Badge tone="accent">Diary · {activeDate}</Badge>
            <h1 className="mt-2 font-display text-xl font-extrabold tracking-tight">Nutrition</h1>
            <p className="mt-1 text-xs text-muted">
              {tdee && tdee.ok
                ? `Measured maintenance ${maintenance} kcal (${tdee.confidence})`
                : `Formula maintenance ${maintenance} kcal`}
              {burn ? ` · +${burn} from training` : ""}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-bold">
            <span className="text-muted">Calories</span>
            <span className="tabular">
              {Math.round(totals.cals)} / {goalCals}
            </span>
          </div>
          <Progress value={(totals.cals / goalCals) * 100} />
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Macro label="Protein" used={totals.p} goal={goals.protein} unit="g" />
        <Macro label="Carbs" used={totals.c} goal={goals.carbs} unit="g" />
        <Macro label="Fat" used={totals.f} goal={goals.fat} unit="g" />
      </div>

      <Card>
        <CardTitle>
          <span>Water</span>
          <span className="tabular text-sm font-bold text-accent-text">
            {day.water || 0} / {goals.water} ml
          </span>
        </CardTitle>
        <Progress value={waterPct} barClassName="bg-info" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="flex-1" onClick={() => addWater(250)}>
            +250 ml
          </Button>
          <Button className="flex-1" onClick={() => addWater(500)}>
            +500 ml
          </Button>
          {/* Water only ever went up, so one mis-tap was permanent for the day. */}
          <Button className="flex-1" onClick={() => addWater(-250)}>
            −250 ml
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={!day.water}
            onClick={() => {
              setWater(0);
              toast.success("Water reset");
            }}
          >
            Reset
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Add food</CardTitle>
        <div className="mb-2 flex gap-1 overflow-x-auto">
          {MEALS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeal(m)}
              className={`h-9 shrink-0 rounded-full px-3 text-xs font-bold ${
                meal === m ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="Search chicken, rice, whey…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="primary" onClick={() => setScanning(true)}>
            <ScanLine className="size-4" /> Scan
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-bold text-accent-text"
        >
          {showAll ? "Hide" : `Browse all ${library.length} foods`}
        </button>

        {(query || showAll) && (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border">
            {hits.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-faint">
                No match — scan a barcode or add it by hand below.
              </div>
            )}
            {hits.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => openPortion(f)}
                className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2"
              >
                <span className="text-sm font-bold">{f.name}</span>
                <span className="text-xs text-muted">
                  {f.cals} kcal · {f.p}p
                </span>
              </button>
            ))}
          </div>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-accent-text">
            Create a new food
          </summary>
          <p className="mb-2 mt-2 text-[0.7rem] text-faint">
            Enter the values per 100g, as printed on the label. It is saved to your
            library so you can log it again at any portion.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              className="col-span-2"
              placeholder="Name"
              value={custom.name}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            />
            <DecimalInput
              placeholder="kcal /100g"
              value={customRaw.cals}
              onValueChange={(n, raw) => {
                setCustomRaw({ ...customRaw, cals: raw });
                setCustom({ ...custom, cals: n ?? 0 });
              }}
            />
            <DecimalInput
              placeholder="Protein /100g"
              value={customRaw.p}
              onValueChange={(n, raw) => {
                setCustomRaw({ ...customRaw, p: raw });
                setCustom({ ...custom, p: n ?? 0 });
              }}
            />
            <DecimalInput
              placeholder="Carbs /100g"
              value={customRaw.c}
              onValueChange={(n, raw) => {
                setCustomRaw({ ...customRaw, c: raw });
                setCustom({ ...custom, c: n ?? 0 });
              }}
            />
            <DecimalInput
              placeholder="Fat /100g"
              value={customRaw.f}
              onValueChange={(n, raw) => {
                setCustomRaw({ ...customRaw, f: raw });
                setCustom({ ...custom, f: n ?? 0 });
              }}
            />
          </div>
          <Button
            variant="primary"
            className="mt-2 w-full"
            onClick={() => {
              const name = custom.name.trim();
              if (!name) {
                toast.error("Give the food a name.");
                return;
              }
              const food: FoodItem = {
                name, serving: 100, unit: "g",
                cals: custom.cals, p: custom.p, c: custom.c, f: custom.f,
                fiber: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0,
                meal,
                per100: { cals: custom.cals, p: custom.p, c: custom.c, f: custom.f, fiber: 0 },
              };
              if (!addCustomFood(food)) {
                toast.error(`"${name}" is already in your library.`);
                return;
              }
              toast.success(`Saved ${name}`);
              setCustom({ name: "", cals: 0, p: 0, c: 0, f: 0, serving: 100 });
              setCustomRaw({ cals: "", p: "", c: "", f: "" });
              // Straight into the portion sheet, since you almost always
              // create a food because you are about to eat it.
              setPortion({ mode: "add", meal, item: food });
            }}
          >
            <Plus className="size-4" /> Save to library
          </Button>

          {customFoods.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-wider text-faint">
                Your foods
              </div>
              <div className="flex flex-wrap gap-1.5">
                {customFoods.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => removeCustomFood(f.name)}
                    className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.7rem] font-semibold text-muted"
                  >
                    <Trash2 className="size-3 text-danger" />
                    <span className="max-w-32 truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </details>
      </Card>

      {MEALS.map((m) => {
        const group = items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) => (it.meal || "Snacks") === m);
        const cals = group.reduce((a, g) => a + g.it.cals, 0);
        const p = group.reduce((a, g) => a + g.it.p, 0);
        const open = openMeals.has(m);
        return (
          <Card key={m}>
            <button
              type="button"
              className="flex w-full items-center justify-between"
              onClick={() => toggleMeal(m)}
            >
              <span className="font-display text-sm font-bold">{m}</span>
              <span className="text-xs font-bold text-muted">
                {Math.round(cals)} kcal · {Math.round(p)}g P
              </span>
            </button>
            {open && (
              <div className="mt-3 space-y-1.5">
                {group.length === 0 && <div className="py-2 text-center text-xs text-faint">Nothing logged</div>}
                {group.map(({ it, idx }) => (
                  <FoodRow
                    key={idx}
                    item={it}
                    onEdit={() => setPortion({ item: it, meal: m, mode: "edit", idx })}
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <p className="px-1 text-[0.7rem] text-faint">
        Goals: {goals.cals} kcal · P {goals.protein} · C {goals.carbs} · F {goals.fat}. Units {settings.unit}.
      </p>

      {portion && (
        <PortionSheet
          item={portion.item}
          meal={portion.meal}
          mode={portion.mode}
          onClose={() => setPortion(null)}
          onDelete={
            portion.mode === "edit" && portion.idx !== undefined
              ? () => {
                  removeFood(portion.idx!);
                  setPortion(null);
                  toast.success("Removed");
                }
              : undefined
          }
          onConfirm={(next) => {
            if (portion.mode === "edit" && portion.idx !== undefined) {
              updateFood(portion.idx, next);
              toast.success(`Updated to ${next.serving}g`);
            } else {
              addFood(next);
              toast.success(`Added ${next.serving}g ${next.name}`);
            }
            setPortion(null);
          }}
        />
      )}

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onFound={(hit) => {
            // Open Food Facts reports per 100g; ask how much was actually eaten
            // rather than assuming the whole reference portion.
            setPortion({
              mode: "add",
              meal,
              item: {
                name: hit.name, serving: hit.serving || 100, unit: "g",
                cals: hit.cals, p: hit.p, c: hit.c, f: hit.f, fiber: hit.fiber,
                sodium: 0, potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0,
                meal,
              },
            });
            setScanning(false);
          }}
        />
      )}

      {/* Last on the page: it is a review of the week, not part of logging
          today, and it was pushing the meal sections below the fold. */}
      <NutritionGraphs />

    </div>
  );
}

function Macro({ label, used, goal, unit }: { label: string; used: number; goal: number; unit: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-3">
      <div className="text-[0.62rem] font-bold uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 font-display text-lg font-extrabold tabular">
        {Math.round(used)}
        <span className="text-xs font-bold text-muted">
          /{goal}
          {unit}
        </span>
      </div>
      <Progress className="mt-2" value={(used / goal) * 100} />
    </div>
  );
}

function FoodRow({ item, onEdit }: { item: FoodItem; onEdit: () => void }) {
  // The whole row opens the editor: correcting a portion is far more common
  // than deleting, and delete lives inside the editor anyway.
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{item.name}</div>
        <div className="text-[0.7rem] text-faint">
          {item.serving}
          {item.unit} · {Math.round(item.cals)} kcal · {item.p}p {item.c}c {item.f}f
        </div>
      </div>
      <Pencil className="size-4 shrink-0 text-faint" />
    </button>
  );
}
