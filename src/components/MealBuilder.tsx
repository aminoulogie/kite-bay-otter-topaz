import { useMemo, useState } from "react";
import { Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import {
  loadRecipes, perServing, recipeAsFood, recipeTotals, saveRecipes,
  type Recipe, type RecipeIngredient,
} from "@/lib/recipes";
import { BASE_FOOD_LIBRARY } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { FoodItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Meals assembled from ingredients.
 *
 * The recipe stores its ingredients, never its totals: correcting the rice
 * from 200g to 250g has to recompute the meal, and a food whose own figures
 * are later fixed should flow through to every meal using it. Both are
 * impossible from a frozen number.
 *
 * Logging a recipe produces an ordinary FoodItem, so day totals, the day
 * score and the CSV export need no idea that recipes exist.
 */
export function MealBuilder({ meal }: { meal: string }) {
  const customFoods = useSoma((s) => s.customFoods);
  const addFood = useSoma((s) => s.addFood);

  const library = useMemo(() => {
    const byName = new Map<string, FoodItem>();
    for (const f of BASE_FOOD_LIBRARY as unknown as FoodItem[]) byName.set(f.name.toLowerCase(), f);
    for (const f of customFoods) byName.set(f.name.toLowerCase(), f);
    return [...byName.values()];
  }, [customFoods]);

  const [recipes, setRecipes] = useState<Recipe[]>(() => loadRecipes());
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [query, setQuery] = useState("");

  const persist = (next: Recipe[]) => {
    setRecipes(next);
    saveRecipes(next);
  };

  const startNew = () =>
    setEditing({ id: String(Date.now()), name: "", ingredients: [], servings: 1 });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [library, query]);

  if (editing) {
    const { totals, missing } = recipeTotals(editing, library);
    const each = perServing(editing, library);

    return (
      <Card>
        <CardTitle>{editing.name || "New meal"}</CardTitle>

        <Input
          className="mb-2"
          placeholder="Meal name — chicken and rice, overnight oats…"
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
        />

        <div className="mb-2 space-y-1">
          {editing.ingredients.map((ing, i) => (
            <div key={`${ing.food}-${i}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold">{ing.food}</span>
              <DecimalInput
                className="h-9 w-20 text-center"
                value={String(ing.grams)}
                onValueChange={(n) => {
                  const next = [...editing.ingredients];
                  next[i] = { ...ing, grams: n ?? 0 };
                  setEditing({ ...editing, ingredients: next });
                }}
              />
              <span className="text-[0.62rem] text-faint">g</span>
              <button
                type="button"
                aria-label={`Remove ${ing.food}`}
                onClick={() =>
                  setEditing({
                    ...editing,
                    ingredients: editing.ingredients.filter((_, j) => j !== i),
                  })
                }
                className="text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {editing.ingredients.length === 0 && (
            <p className="py-2 text-center text-[0.68rem] text-faint">
              Add ingredients and the macros add themselves up.
            </p>
          )}
        </div>

        <Input
          className="mb-1"
          placeholder="Add an ingredient…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-xl border border-border">
            {matches.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => {
                  const ing: RecipeIngredient = { food: f.name, grams: f.serving || 100 };
                  setEditing({ ...editing, ingredients: [...editing.ingredients, ing] });
                  setQuery("");
                }}
                className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left last:border-0 active:bg-surface-2"
              >
                <span className="truncate text-[0.72rem] font-bold">{f.name}</span>
                <Plus className="size-3.5 shrink-0 text-accent-text" />
              </button>
            ))}
          </div>
        )}

        <label className="mb-2 flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-wide text-faint">
          Servings this makes
          <DecimalInput
            className="h-9 w-20 text-center"
            value={String(editing.servings)}
            onValueChange={(n) => setEditing({ ...editing, servings: Math.max(1, n ?? 1) })}
          />
        </label>

        {missing.length > 0 && (
          <p className="mb-2 text-[0.62rem] text-warn">
            Not counted — no longer in your library: {missing.join(", ")}
          </p>
        )}

        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {[
            ["kcal", each.cals],
            ["P", each.p],
            ["C", each.c],
            ["F", each.f],
          ].map(([label, v]) => (
            <div key={String(label)} className="rounded-lg bg-surface-2 px-1.5 py-1.5 text-center">
              <div className="text-[0.55rem] font-bold uppercase text-faint">{label}</div>
              <div className="font-display text-[0.85rem] font-extrabold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <p className="mb-3 text-[0.6rem] text-faint">
          Per serving. Whole meal: {totals.cals} kcal, {totals.grams}g.
        </p>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!editing.name.trim() || editing.ingredients.length === 0}
            onClick={() => {
              const rest = recipes.filter((r) => r.id !== editing.id);
              persist([...rest, editing]);
              setEditing(null);
              toast.success(`${editing.name} saved`);
            }}
          >
            Save meal
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">My meals</CardTitle>
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.65rem] font-bold text-accent-text"
        >
          <Plus className="size-3" /> New
        </button>
      </div>

      {recipes.length === 0 ? (
        <p className="text-[0.68rem] leading-snug text-muted">
          Build a meal once from its ingredients and log the whole thing in one tap
          afterwards. Editing an ingredient updates every meal that uses it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {recipes.map((r) => {
            const each = perServing(r, library);
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-2.5"
              >
                <UtensilsCrossed className="size-4 shrink-0 text-faint" />
                <button
                  type="button"
                  onClick={() => {
                    addFood(recipeAsFood(r, library, meal));
                    toast.success(`${r.name} logged to ${meal}`);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[0.75rem] font-bold">{r.name}</div>
                  <div className="text-[0.6rem] tabular-nums text-faint">
                    {each.cals} kcal · {each.p}p · {each.c}c · {each.f}f per serving
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => setEditing(r)}
                  className={cn("text-[0.65rem] font-bold text-accent-text")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => persist(recipes.filter((x) => x.id !== r.id))}
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
