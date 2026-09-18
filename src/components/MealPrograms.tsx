import { useEffect, useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { scaleTo } from "@/components/PortionSheet";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { composeLibrary } from "@/lib/foods";
import {
  duplicateProgram, loadMealPrograms, newProgramId, programMeals, programTotals,
  PROGRAM_MEALS, saveMealPrograms, type MealProgram, type ProgramFood,
} from "@/lib/meal-programs";
import { useSoma } from "@/lib/store";
import { useSideStoreRevision } from "@/lib/use-side-stores";
import { cn } from "@/lib/utils";
import type { FoodItem } from "@/lib/types";

/**
 * A day of eating, chosen from a list and put on the plan in one tap.
 *
 * The point is that 3,200 kcal is not decided at 8pm. It is decided when the
 * week is laid out, and laying out a week by searching for eleven foods seven
 * times is a job nobody does twice. So the work happens once, in the manager
 * below, and the daily act is choosing a name and pressing Done.
 *
 * What lands on the day is `planned`, never `items` — see the note on
 * NutritionDay. Every line arrives greyed, dashes for a border, counted by
 * nothing, and is promoted into the diary one swipe at a time as it is
 * actually eaten. That is the whole reason this can be honest about a plan.
 */

/** The weekday a plan date falls on, for matching a programme named after it. */
function weekdayOf(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
}

function byName(library: FoodItem[]): Map<string, FoodItem> {
  return new Map(library.map((f) => [f.name.trim().toLowerCase(), f]));
}

/**
 * The dropdown, and the Done button, sat directly under the day strip.
 *
 * Keyed on the date by the caller, so moving along the week re-opens on that
 * weekday's own programme rather than carrying Monday's choice onto Thursday.
 */
export function MealProgramPicker({ target }: { target: string }) {
  const customFoods = useSoma((s) => s.customFoods);
  const planFood = useSoma((s) => s.planFood);

  const [programs, setPrograms] = useState<MealProgram[]>(() => loadMealPrograms());
  const [picked, setPicked] = useState("");

  // A restore writes the key directly, so a screen holding its copy in useState
  // would otherwise keep offering programmes that no longer exist.
  const sideRev = useSideStoreRevision();
  useEffect(() => {
    if (sideRev) setPrograms(loadMealPrograms());
  }, [sideRev]);

  const library = useMemo(() => composeLibrary(customFoods), [customFoods]);
  const foods = useMemo(() => byName(library), [library]);

  const chosen =
    programs.find((p) => p.id === picked) ??
    programs.find((p) => p.name.trim().toLowerCase() === weekdayOf(target).toLowerCase()) ??
    programs[0];

  const totals = chosen ? programTotals(chosen, library) : null;

  // Nothing saved at all: say so where the control would be, rather than
  // rendering an empty box that looks broken.
  if (!chosen || !totals) {
    return (
      <p className="mt-2 text-[0.68rem] leading-snug text-faint">
        No day programmes yet. Build one under Meal programmes below and it will
        appear here, ready to drop onto any day of the week.
      </p>
    );
  }

  const putOnPlan = () => {
    let added = 0;
    const gone: string[] = [];
    for (const line of chosen.foods) {
      const food = foods.get(line.food.trim().toLowerCase());
      if (!food) {
        gone.push(line.food);
        continue;
      }
      planFood(scaleTo(food, line.grams, line.meal), target);
      added += 1;
    }
    if (gone.length) {
      // Named rather than swallowed: a food renamed in the library would
      // otherwise put a quietly incomplete day on the plan.
      toast.error(`${added} on the plan. Not in your library: ${gone.join(", ")}`);
    } else {
      toast.success(`${chosen.name} — ${added} item${added === 1 ? "" : "s"} on the plan`);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-border bg-surface-2 p-2.5" data-no-swipe-nav>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[0.58rem] font-bold uppercase tracking-wider text-faint">
          Day programme
        </span>
        <span className="shrink-0 text-[0.62rem] tabular text-faint">
          {Math.round(totals.totals.cals)} kcal · {Math.round(totals.totals.p)}g P
        </span>
      </div>

      <select
        aria-label="Day programme"
        className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
        value={chosen.id}
        onChange={(e) => setPicked(e.target.value)}
      >
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="mt-2 space-y-1">
        {programMeals(chosen).map((group) => (
          <div key={group.meal}>
            <div className="text-[0.55rem] font-bold uppercase tracking-wider text-faint">
              {group.meal}
            </div>
            {group.foods.map((f, i) => {
              const food = foods.get(f.food.trim().toLowerCase());
              const per = food?.serving || 100;
              const kcal = food ? Math.round(((food.cals || 0) * f.grams) / per) : null;
              return (
                <div key={`${f.food}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted">{f.food}</span>
                  <span className="shrink-0 tabular font-bold">
                    {f.grams}g
                    {kcal !== null && <span className="ml-1.5 text-faint">{kcal} kcal</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {totals.missing.length > 0 && (
        <p className="mt-1.5 text-[0.62rem] leading-snug text-warn">
          Not in your library, so not counted: {totals.missing.join(", ")}
        </p>
      )}

      <Button variant="primary" className="mt-2 w-full" onClick={putOnPlan}>
        Done — put it on the plan
      </Button>
    </div>
  );
}

/**
 * The saved programmes: add, edit, duplicate, delete.
 *
 * Editing and duplicating are the same feature seen twice. A programme is a
 * starting point rather than a fixture — the useful move is almost never "make
 * a programme from nothing", it is "take Tuesday, swap the rechta for pasta,
 * and keep both".
 */
export function MealPrograms() {
  const customFoods = useSoma((s) => s.customFoods);
  const library = useMemo(() => composeLibrary(customFoods), [customFoods]);

  const [programs, setPrograms] = useState<MealProgram[]>(() => loadMealPrograms());
  const [editing, setEditing] = useState<MealProgram | null>(null);
  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState<string>("Breakfast");

  const sideRev = useSideStoreRevision();
  useEffect(() => {
    if (sideRev) setPrograms(loadMealPrograms());
  }, [sideRev]);

  const persist = (next: MealProgram[]) => {
    setPrograms(next);
    saveMealPrograms(next);
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [library, query]);

  if (editing) {
    const totals = programTotals(editing, library);
    const add = (food: FoodItem) => {
      const line: ProgramFood = { food: food.name, grams: food.serving || 100, meal };
      setEditing({ ...editing, foods: [...editing.foods, line] });
      setQuery("");
    };
    const setGrams = (index: number, grams: number) => {
      const foods = [...editing.foods];
      foods[index] = { ...foods[index]!, grams };
      setEditing({ ...editing, foods });
    };

    return (
      <Card>
        <CardTitle>{editing.name || "New day programme"}</CardTitle>

        <Input
          className="mb-2"
          placeholder="Name — Monday, training day, rest day…"
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
        />

        {/* Which meal a newly added food lands under. A chip row rather than a
            select, because it is the choice made most often while building. */}
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1" data-no-swipe-nav>
          {PROGRAM_MEALS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeal(m)}
              className={cn(
                "shrink-0 rounded-lg border px-2 py-1 text-[0.62rem] font-bold",
                meal === m ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-muted",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="mb-2 space-y-2">
          {programMeals(editing).map((group) => (
            <div key={group.meal}>
              <div className="mb-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-faint">
                {group.meal}
              </div>
              {group.foods.map((f) => {
                const index = editing.foods.indexOf(f);
                return (
                  <div key={`${f.food}-${index}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold">{f.food}</span>
                    <DecimalInput
                      className="h-9 w-20 text-center"
                      value={String(f.grams)}
                      onValueChange={(n) => setGrams(index, n ?? 0)}
                    />
                    <span className="text-[0.62rem] text-faint">g</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.food}`}
                      onClick={() =>
                        setEditing({ ...editing, foods: editing.foods.filter((_, i) => i !== index) })
                      }
                      className="text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          {editing.foods.length === 0 && (
            <p className="py-2 text-center text-[0.68rem] text-faint">
              Add foods below and the day adds itself up.
            </p>
          )}
        </div>

        <Input
          className="mb-1"
          placeholder={`Add a food to ${meal}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-xl border border-border">
            {matches.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => add(f)}
                className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left last:border-0 active:bg-surface-2"
              >
                <span className="truncate text-[0.72rem] font-bold">{f.name}</span>
                <Plus className="size-3.5 shrink-0 text-accent-text" />
              </button>
            ))}
          </div>
        )}

        <div className="mb-2 grid grid-cols-4 gap-1.5">
          {([
            ["kcal", totals.totals.cals],
            ["P", totals.totals.p],
            ["C", totals.totals.c],
            ["F", totals.totals.f],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface-2 px-1.5 py-1.5 text-center">
              <div className="text-[0.55rem] font-bold uppercase text-faint">{label}</div>
              <div className="font-display text-[0.85rem] font-extrabold tabular-nums">
                {Math.round(value)}
              </div>
            </div>
          ))}
        </div>

        {totals.missing.length > 0 && (
          <p className="mb-2 text-[0.62rem] text-warn">
            Not counted — no longer in your library: {totals.missing.join(", ")}
          </p>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!editing.name.trim() || editing.foods.length === 0}
            onClick={() => {
              const rest = programs.filter((p) => p.id !== editing.id);
              persist([...rest, editing]);
              setEditing(null);
              toast.success(`${editing.name} saved`);
            }}
          >
            Save
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">Day programmes</CardTitle>
        <button
          type="button"
          onClick={() =>
            setEditing({ id: newProgramId(), name: "", foods: [] })
          }
          className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.65rem] font-bold text-accent-text"
        >
          <Plus className="size-3" /> New
        </button>
      </div>

      {programs.length === 0 ? (
        <p className="text-[0.68rem] leading-snug text-muted">
          Build a whole day once — breakfast through dinner, in grams — and every
          day after that is one choice in the dropdown above. Nothing counts until
          you swipe each line you actually ate.
        </p>
      ) : (
        <div className="space-y-1.5">
          {programs.map((p) => {
            const t = programTotals(p, library).totals;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-2.5"
              >
                <button
                  type="button"
                  onClick={() => setEditing({ ...p, foods: p.foods.map((f) => ({ ...f })) })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[0.75rem] font-bold">{p.name}</div>
                  <div className="text-[0.6rem] tabular-nums text-faint">
                    {Math.round(t.cals)} kcal · {Math.round(t.p)}p · {Math.round(t.c)}c · {Math.round(t.f)}f
                    {" · "}
                    {p.foods.length} line{p.foods.length === 1 ? "" : "s"}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => setEditing({ ...p, foods: p.foods.map((f) => ({ ...f })) })}
                  className="text-accent-text"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Duplicate ${p.name}`}
                  onClick={() => {
                    const copy = duplicateProgram(p, programs);
                    persist([...programs, copy]);
                    toast.success(`${copy.name} created — edit it and it will not touch ${p.name}`);
                  }}
                  className="text-accent-text"
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => persist(programs.filter((x) => x.id !== p.id))}
                  className="text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
