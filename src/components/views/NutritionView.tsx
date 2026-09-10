import { useMemo, useState } from "react";
import { Pencil, Plus, ScanLine, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { PortionSheet } from "@/components/PortionSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FoodEditorSheet } from "@/components/FoodEditorSheet";
import { PreWorkoutCard } from "@/components/PreWorkoutCard";
import { MealBuilder } from "@/components/MealBuilder";
import { MineralsCard } from "@/components/MineralsCard";
import { NutritionGraphs } from "@/components/NutritionGraphs";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { foodWaterMl, totalWaterMl } from "@/lib/hydration";
import { DEFAULT_GOALS, SomaIntelligenceEngine } from "@/lib/soma";
import { composeLibrary, searchFoods } from "@/lib/foods";
import { useSoma } from "@/lib/store";
import { useLongPressMove } from "@/lib/use-long-press-move";
import { SwipeRow } from "@/components/SwipeRow";
import { QuickAddSheet } from "@/components/QuickAddSheet";
import { lastMealDate, mealItems, recentFoods } from "@/lib/food-recents";
import { HUNGER_LABEL, hungerNote, hungerOn, type HungerEntry } from "@/lib/hunger";
import { tapLight, tapMedium } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { FoodItem } from "@/lib/types";

// Pre-Workout was missing, so anything logged under it — including
// everything the pre-workout card adds — was invisible in the diary.
const MEALS = ["Breakfast", "Lunch", "Dinner", "Pre-Workout", "Post-Workout", "Snacks"];

export function NutritionView() {
  const nutrition = useSoma((s) => s.nutrition);
  const history = useSoma((s) => s.history);
  const activeDate = useSoma((s) => s.activeDate);
  const customFoods = useSoma((s) => s.customFoods);
  const addFood = useSoma((s) => s.addFood);
  const removeFood = useSoma((s) => s.removeFood);
  const restoreFood = useSoma((s) => s.restoreFood);
  const hunger = useSoma((s) => s.hunger);
  const logHunger = useSoma((s) => s.logHunger);
  const removeHunger = useSoma((s) => s.removeHunger);
  const restoreHunger = useSoma((s) => s.restoreHunger);
  const addWater = useSoma((s) => s.addWater);
  const setWater = useSoma((s) => s.setWater);
  const updateFood = useSoma((s) => s.updateFood);
  const addCustomFood = useSoma((s) => s.addCustomFood);
  const rememberScannedFood = useSoma((s) => s.rememberScannedFood);
  const moveFoodToMeal = useSoma((s) => s.moveFoodToMeal);
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
  const [custom, setCustom] = useState({
    name: "", cals: 0, p: 0, c: 0, f: 0, serving: 100, waterPct: 0,
  });
  // The raw text is kept beside the parsed numbers so a value mid-typing —
  // "12," on the way to "12,5" — is not erased on every keystroke.
  const [customRaw, setCustomRaw] = useState({ cals: "", p: "", c: "", f: "", waterPct: "" });
  const [scanning, setScanning] = useState(false);
  // The library is browsable, not search-only: with nothing typed you should
  // still be able to see what is in there rather than having to guess a name.
  const [showAll, setShowAll] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  // One sheet drives both logging a portion and editing a logged one.
  const [portion, setPortion] = useState<
    { item: FoodItem; meal: string; mode: "add" | "edit"; idx?: number } | null
  >(null);

  // Deliberately NOT ensuring the day here. Creating a record just because a
  // date was looked at is what made browsing the calendar indistinguishable
  // from logging: every day visited turned up in the backup, on the calendar,
  // and — while empty days carried an inherited bodyweight — in the weight
  // chart. The writes create the day; viewing does not.

  // Hold a logged food, drag it onto another meal card, let go.
  /** Only one row shows its Delete at a time, so a stray tap cannot hit a
      button left open behind a row the user has stopped looking at. */
  const [swipedRow, setSwipedRow] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);

  /**
   * Delete a food, and mean it only if the user does nothing.
   *
   * A swipe is a much cheaper gesture than opening the sheet and pressing the
   * bin was, which is the point of it and also the risk: the same flick that
   * scrolls the diary now destroys a row. So every swipe delete is undoable
   * for as long as the toast is up, and it comes back at the index it left
   * rather than at the bottom of the meal.
   */
  const deleteFood = (idx: number, item: FoodItem) => {
    const date = activeDate;
    removeFood(idx);
    toast.success(`Removed ${item.name}`, {
      action: { label: "Undo", onClick: () => restoreFood(idx, item, date) },
    });
  };

  const mealDrag = useLongPressMove<number>((idx, meal) => {
    moveFoodToMeal(idx, meal);
    tapMedium();
    toast.success(`Moved to ${meal}`);
  }, tapLight);

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

  // Base first, customs after, deduplicated by name so an edited base food is
  // replaced by the edit rather than appearing twice.
  const library = useMemo(() => composeLibrary(customFoods), [customFoods]);
  // Accent-insensitive, group-aware, and ordered by how well it matches — a
  // five-hundred-food library needs a real search, not a substring test.
  /**
   * What you actually eat, from the log rather than from a counter nobody
   * increments. Offered when the search box is empty, which is the moment you
   * are about to type the same thing you typed yesterday.
   */
  const recents = useMemo(
    () => recentFoods(nutrition, activeDate, 10),
    [nutrition, activeDate],
  );

  const hits = useMemo(() => {
    if (query) return searchFoods(library, query, 25);
    return showAll ? searchFoods(library, "", 200) : [];
  }, [library, query, showAll]);

  /**
   * Open the portion sheet for a library food.
   *
   * The whole food is carried through rather than a hand-listed subset of its
   * fields. Listing them is what silently dropped every vitamin: an orange
   * juice with 50mg of vitamin C in the library arrived in the diary with
   * none, because the field was not on the list — and the minerals card then
   * honestly reported it as unrecorded.
   */
  const openPortion = (f: FoodItem) => {
    setPortion({
      mode: "add",
      meal,
      item: { ...f, serving: f.serving || 100, unit: f.unit || "g", meal },
    });
    setQuery("");
  };

  // Water drunk as water, plus the water that arrived in drinks. Read through
  // the helper rather than off `day.water`, or the ring disagrees with the log.
  const fromFood = foodWaterMl(day);
  const water = totalWaterMl(day);
  const waterPct = Math.min(100, Math.round((water / (goals.water || 3500)) * 100));

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
            {water} / {goals.water} ml
          </span>
        </CardTitle>
        <Progress value={waterPct} barClassName="bg-info" />
        {fromFood > 0 && (
          <p className="mt-1.5 text-[0.65rem] text-muted">
            {fromFood} ml of that came from what you drank — juice, milk and anything else
            logged with a water content.
          </p>
        )}
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
              toast.success(
                fromFood > 0
                  ? `Reset — ${fromFood} ml from drinks stays, remove those in the meal list`
                  : "Water reset",
              );
            }}
          >
            Reset
          </Button>
        </div>
      </Card>

      <HungerCard
        entries={hungerOn(hunger, activeDate)}
        phase={settings.phase ?? "maintain"}
        onLog={(level) => {
          logHunger(level);
          toast.success(`${HUNGER_LABEL[level]} logged`);
        }}
        onRemove={(at) => {
          const index = hunger.findIndex((h) => h.at === at);
          const entry = hunger[index];
          if (!entry) return;
          removeHunger(at);
          toast.success("Removed", {
            action: { label: "Undo", onClick: () => restoreHunger(index, entry) },
          });
        }}
      />

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

        {!query && !showAll && recents.length > 0 && (
          <div className="mt-2">
            <div className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              You eat these
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recents.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  // Opens the portion sheet at the size last logged, so the
                  // common case is two taps rather than a search and a number.
                  onClick={() => setPortion({ item: r.item, meal, mode: "add" })}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-bold text-muted"
                >
                  <span className="max-w-[9rem] truncate">{r.name}</span>
                  <span className="text-[0.6rem] text-faint">{r.item.serving}{r.item.unit}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-bold text-accent-text"
          >
            {showAll ? "Hide" : `Browse all ${library.length} foods`}
          </button>
          <button
            type="button"
            onClick={() => setQuickAdd(true)}
            className="text-xs font-bold text-muted underline"
          >
            Quick add calories
          </button>
        </div>

        {(query || showAll) && (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border">
            {hits.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-faint">
                No match — scan a barcode or add it by hand below.
              </div>
            )}
            {hits.map((f) => (
              <div
                key={f.name}
                className="flex items-center border-b border-border last:border-0 hover:bg-surface-2"
              >
                <button
                  type="button"
                  onClick={() => openPortion(f)}
                  className="flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left"
                >
                  <span className="truncate text-sm font-bold">{f.name}</span>
                  <span className="shrink-0 pl-2 text-xs text-muted">
                    {f.cals} kcal · {f.p}p
                  </span>
                </button>
                {/* Editing sits beside logging rather than inside it: a wrong
                    label should be correctable without first pretending to eat
                    the food. */}
                <button
                  type="button"
                  aria-label={`Edit ${f.name}`}
                  onClick={() => setEditingFood(f as FoodItem)}
                  className="shrink-0 px-3 py-2 text-muted"
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
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
            {/* Only asked for once, on the food itself, rather than every time
                a portion is logged. */}
            <DecimalInput
              className="col-span-2"
              placeholder="Water % — 88 for juice or milk, blank for solids"
              value={customRaw.waterPct}
              onValueChange={(n, raw) => {
                setCustomRaw({ ...customRaw, waterPct: raw });
                setCustom({ ...custom, waterPct: Math.max(0, Math.min(100, n ?? 0)) });
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
                name,
                serving: 100,
                unit: custom.waterPct >= 80 ? "ml" : "g",
                cals: custom.cals, p: custom.p, c: custom.c, f: custom.f,
                fiber: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0,
                meal,
                waterPct: custom.waterPct || undefined,
                per100: { cals: custom.cals, p: custom.p, c: custom.c, f: custom.f, fiber: 0 },
              };
              if (!addCustomFood(food)) {
                toast.error(`"${name}" is already in your library.`);
                return;
              }
              toast.success(`Saved ${name}`);
              setCustom({ name: "", cals: 0, p: 0, c: 0, f: 0, serving: 100, waterPct: 0 });
              setCustomRaw({ cals: "", p: "", c: "", f: "", waterPct: "" });
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

      <MealBuilder meal={meal} />

      <PreWorkoutCard />

      {/* The gesture is invisible without this. */}
      {items.length > 0 && (
        <p className="-mb-1 px-1 text-[0.62rem] text-faint">
          Tap a food to edit it. Swipe left to delete. Press and hold, then drag it onto
          another meal to move it there.
        </p>
      )}

      {MEALS.map((m) => {
        const group = items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) => (it.meal || "Snacks") === m);
        const cals = group.reduce((a, g) => a + g.it.cals, 0);
        const p = group.reduce((a, g) => a + g.it.p, 0);
        const open = openMeals.has(m);
        const isTarget = mealDrag.over === m && mealDrag.dragging !== null;
        return (
          // A drop zone. Hold a food anywhere in the diary and drag it onto
          // this card to move it here — the meal is one field, but reaching it
          // meant opening the portion sheet and saving.
          <Card
            key={m}
            data-drop-zone={m}
            className={cn(isTarget && "border-accent bg-accent/10")}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between"
              onClick={() => toggleMeal(m)}
            >
              <span className="font-display text-sm font-bold">{m}</span>
              <span className="text-xs font-bold text-muted">
                {isTarget ? (
                  <span className="text-accent-text">Drop here</span>
                ) : (
                  `${Math.round(cals)} kcal · ${Math.round(p)}g P`
                )}
              </span>
            </button>
            {open && (
              <div className="mt-3 space-y-1.5">
                {group.length === 0 && <RepeatMeal meal={m} />}
                {group.map(({ it, idx }) => (
                  <SwipeRow
                    key={idx}
                    id={String(idx)}
                    openId={swipedRow}
                    setOpenId={setSwipedRow}
                    // While a row is held for a drag it belongs to that
                    // gesture; two meanings for one finger is one too many.
                    disabled={mealDrag.dragging !== null}
                    onDelete={() => deleteFood(idx, it)}
                  >
                    <FoodRow
                      item={it}
                      held={mealDrag.dragging === idx}
                      dragHandlers={mealDrag.handlers(idx)}
                      onEdit={() => setPortion({ item: it, meal: m, mode: "edit", idx })}
                    />
                  </SwipeRow>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <p className="px-1 text-[0.7rem] text-faint">
        Goals: {goals.cals} kcal · P {goals.protein} · C {goals.carbs} · F {goals.fat}. Units {settings.unit}.
      </p>

      {quickAdd && (
        <QuickAddSheet
          meal={meal}
          onClose={() => setQuickAdd(false)}
          onAdd={(item) => {
            addFood(item);
            setQuickAdd(false);
            toast.success(`Added ${item.cals} kcal to ${item.meal}`);
          }}
        />
      )}

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
            const item: FoodItem = {
              name: hit.name,
              serving: hit.serving || 100,
              unit: "g",
              cals: hit.cals, p: hit.p, c: hit.c, f: hit.f, fiber: hit.fiber,
              sodium: hit.sodium ?? 0, potassium: hit.potassium ?? 0,
              calcium: hit.calcium ?? 0, iron: hit.iron ?? 0,
              magnesium: 0, zinc: 0,
              meal,
              barcode: hit.barcode,
              per100: { cals: hit.cals, p: hit.p, c: hit.c, f: hit.f, fiber: hit.fiber },
            };
            // Kept, not just logged. Every scan used to be discarded after the
            // portion was added, so the same yoghurt cost a lookup every
            // morning and could never be found by name. This is what builds a
            // real branded library — with the barcode the scanner actually
            // read, so the next scan is instant and works with no signal.
            rememberScannedFood(item);
            // Reported per 100g, so ask how much was eaten rather than assuming
            // the whole reference portion.
            setPortion({ mode: "add", meal, item });
            setScanning(false);
          }}
        />
      )}

      {/* Last on the page: it is a review of the week, not part of logging
          today, and it was pushing the meal sections below the fold. */}
      <NutritionGraphs />

      <MineralsCard />

      {editingFood && (
        <FoodEditorSheet food={editingFood} onClose={() => setEditingFood(null)} />
      )}


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

/**
 * Offers the last time you ate this meal, on the card where it is missing.
 *
 * Placed here rather than as a "copy yesterday" button at the top because this
 * is where the absence is visible: you are looking at an empty Breakfast, and
 * the thing you want is the breakfast you had on the last day you had one —
 * which is often not yesterday, and is worth naming rather than assuming.
 */
/**
 * Log being hungry.
 *
 * Sits above the food list rather than buried in a menu, because it has to be
 * reachable in the two seconds someone is actually hungry — a log that takes
 * navigating to is one that gets filled in from memory hours later, if at all.
 *
 * The consequence is stated on the card. A number silently coming off the
 * day's score is the kind of thing that makes a score feel arbitrary; saying
 * why, and saying when it does NOT apply, is what keeps it trusted.
 */
function HungerCard({
  entries, phase, onLog, onRemove,
}: {
  entries: HungerEntry[];
  phase: "bulk" | "cut" | "maintain";
  onLog: (level: 1 | 2 | 3) => void;
  onRemove: (at: string) => void;
}) {
  return (
    <Card>
      <CardTitle>
        <span>Hungry?</span>
        <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">{phase}</span>
      </CardTitle>
      <div className="mb-2 grid grid-cols-3 gap-2">
        {([1, 2, 3] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onLog(level)}
            className="flex min-h-12 flex-col items-center justify-center rounded-xl bg-surface-2 text-xs font-bold text-muted transition-colors active:bg-accent active:text-accent-ink"
          >
            {HUNGER_LABEL[level]}
          </button>
        ))}
      </div>
      <p
        className={cn(
          "text-[0.7rem] leading-snug",
          entries.length && phase === "bulk" ? "text-warn" : "text-faint",
        )}
      >
        {hungerNote(entries, phase)}
      </p>
      {entries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entries.map((h) => (
            <button
              key={h.at}
              type="button"
              onClick={() => onRemove(h.at)}
              aria-label={`Remove ${HUNGER_LABEL[h.level]} logged at ${new Date(h.at).toLocaleTimeString()}`}
              className="flex h-7 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[0.65rem] font-bold text-muted"
            >
              {HUNGER_LABEL[h.level]}
              <span className="text-faint">
                {new Date(h.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
              <X className="size-3 text-faint" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function RepeatMeal({ meal }: { meal: string }) {
  const nutrition = useSoma((s) => s.nutrition);
  const activeDate = useSoma((s) => s.activeDate);
  const addFood = useSoma((s) => s.addFood);

  const from = lastMealDate(nutrition, meal, activeDate);
  const items = from ? mealItems(nutrition, from, meal) : [];
  if (!from || items.length === 0) {
    return <div className="py-2 text-center text-xs text-faint">Nothing logged</div>;
  }

  const kcal = Math.round(items.reduce((a, i) => a + i.cals, 0));
  return (
    <div className="py-1 text-center">
      <div className="mb-1.5 text-xs text-faint">Nothing logged</div>
      <button
        type="button"
        onClick={() => {
          // Copied, not referenced: editing today's portion must not rewrite
          // what was eaten on the day it came from.
          for (const item of items) addFood({ ...item, meal });
          toast.success(`Repeated ${meal.toLowerCase()} from ${from}`);
        }}
        className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold text-accent-text"
      >
        Repeat {from} · {items.length} item{items.length === 1 ? "" : "s"} · {kcal} kcal
      </button>
    </div>
  );
}

function FoodRow({
  item, onEdit, held, dragHandlers,
}: {
  item: FoodItem;
  onEdit: () => void;
  held?: boolean;
  dragHandlers?: { onPointerDown: (e: React.PointerEvent) => void };
}) {
  // The whole row opens the editor: correcting a portion is far more common
  // than deleting, and delete lives inside the editor anyway. A press and hold
  // picks it up instead, so a tap and a drag stay distinct.
  return (
    <button
      type="button"
      onClick={onEdit}
      {...dragHandlers}
      // Vertical panning belongs to the page until the row is actually held.
      style={{ touchAction: held ? "none" : "pan-y" }}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-[colors,transform]",
        held
          ? "scale-[1.02] border-accent bg-accent/15 shadow-lg"
          : "border-border bg-surface-2",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{item.name}</div>
        <div className="text-[0.7rem] text-faint">
          {item.serving}
          {item.unit} · {Math.round(item.cals)} kcal · {item.p}p {item.c}c {item.f}f
          {item.waterMl ? <span className="text-info"> · {item.waterMl} ml water</span> : null}
        </div>
      </div>
      <Pencil className="size-4 shrink-0 text-faint" />
    </button>
  );
}
