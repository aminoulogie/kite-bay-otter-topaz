import { useMemo, useState } from "react";
import { Check, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { listCost, lowItems, matchName } from "@/lib/pantry";
import { composeLibrary } from "@/lib/foods";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The shopping, and what it is about to cost.
 *
 * This is the money end of the food loop: eating chicken empties the chicken,
 * the empty chicken raises a line here, and the line carries the price you
 * paid for it last time. So the week's shop has a figure on it before you have
 * spent it.
 *
 * It is shown as PENDING and is not in the ledger. That is deliberate and it
 * is the same lesson as planned food: a total that quietly includes money you
 * have not spent is worse than no total, because every figure downstream — the
 * budget, the month's net, the cost per session — inherits the lie. It becomes
 * one real expense at the moment you say you bought it, and not before.
 *
 * Unpriced lines are counted and reported rather than estimated. Nothing here
 * guesses what anything costs.
 */
export function GroceryCard({ money }: { money: (n: number) => string }) {
  const grocery = useSoma((s) => s.grocery);
  const pantry = useSoma((s) => s.pantry);
  const addGroceryLine = useSoma((s) => s.addGroceryLine);
  const updateGroceryLine = useSoma((s) => s.updateGroceryLine);
  const removeGroceryLine = useSoma((s) => s.removeGroceryLine);
  const raiseLowStock = useSoma((s) => s.raiseLowStock);
  const buyGroceries = useSoma((s) => s.buyGroceries);

  const [name, setName] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);

  const cost = useMemo(() => listCost(grocery), [grocery]);
  const gotCost = useMemo(() => listCost(grocery.filter((l) => l.got)), [grocery]);
  const low = useMemo(() => lowItems(pantry), [pantry]);
  const unlisted = low.filter(
    (i) => !grocery.some((l) => l.name.trim().toLowerCase() === i.name.trim().toLowerCase()),
  );

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">
          <span className="inline-flex items-center gap-1.5">
            <ShoppingCart className="size-3.5" />
            Groceries
          </span>
        </CardTitle>
        {cost.total > 0 && (
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[0.68rem] font-extrabold text-warn">
            {money(cost.total)} pending
          </span>
        )}
      </div>

      {unlisted.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const n = raiseLowStock();
            toast.success(`${n} low item${n === 1 ? "" : "s"} added`);
          }}
          className="mb-2 w-full rounded-xl border border-warn/50 bg-warn/10 px-3 py-2 text-left text-xs font-bold text-warn"
        >
          {unlisted.length} thing{unlisted.length === 1 ? "" : "s"} running out — add to the list
        </button>
      )}

      {grocery.length === 0 ? (
        <p className="mb-2 text-xs leading-snug text-faint">
          Nothing on the list. Items land here on their own when the cupboard runs low,
          and carry the price you paid last time.
        </p>
      ) : (
        <div className="mb-2 space-y-1.5">
          {grocery.map((line) => (
            <SwipeRow
              key={line.id}
              id={line.id}
              openId={swiped}
              setOpenId={setSwiped}
              onDelete={() => {
                removeGroceryLine(line.id);
                toast.success(`${line.name} off the list`);
              }}
            >
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border bg-surface-2 px-3 py-2",
                  line.got ? "border-accent/50" : "border-border",
                )}
              >
                <button
                  type="button"
                  aria-label={line.got ? `Un-tick ${line.name}` : `Got ${line.name}`}
                  onClick={() => updateGroceryLine(line.id, { got: !line.got })}
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-md border-2",
                    line.got ? "border-accent bg-accent text-accent-ink" : "border-border",
                  )}
                >
                  {line.got && <Check className="size-3.5" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-sm font-bold", line.got && "line-through opacity-60")}>
                    {line.name}
                  </div>
                  <div className="text-[0.65rem] text-faint">
                    {line.qty}
                    {line.unit === "x" ? "" : line.unit}
                    {line.auto ? " · ran low" : ""}
                  </div>
                </div>

                {/* Typed once and remembered on the item, so the next list
                    costs itself. Never guessed. */}
                <DecimalInput
                  aria-label={`Price of ${line.name}`}
                  className="h-9 w-20 text-center text-xs"
                  placeholder="price"
                  value={line.price ?? ""}
                  onValueChange={(n) => updateGroceryLine(line.id, { price: n ?? undefined })}
                />
              </div>
            </SwipeRow>
          ))}
        </div>
      )}

      <form
        className="mb-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          addGroceryLine({ name: n, qty: 1, unit: "x" });
          setName("");
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add something"
          className="h-10 flex-1"
        />
        <button
          type="submit"
          aria-label="Add to the list"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2"
        >
          <Plus className="size-4" />
        </button>
      </form>

      {cost.unpriced > 0 && (
        <p className="mb-2 text-[0.66rem] leading-snug text-faint">
          {cost.unpriced} line{cost.unpriced === 1 ? " has" : "s have"} no price yet, so the
          pending figure is short by whatever they cost. Nothing here guesses.
        </p>
      )}

      {grocery.some((l) => l.got) && (
        <button
          type="button"
          onClick={() => {
            const spent = buyGroceries();
            toast.success(
              spent > 0
                ? `${money(spent)} logged and the cupboard topped up`
                : "Cupboard topped up — nothing priced, so nothing was logged",
            );
          }}
          className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-extrabold text-accent-ink"
        >
          Bought it · {money(gotCost.total)}
        </button>
      )}
    </Card>
  );
}

/**
 * What is in the cupboard.
 *
 * Kept on the Money tab beside the list rather than on the food tab, because
 * the only two questions it answers — what is running out, what will that cost
 * — are both money questions. Logging food is where stock LEAVES; this is
 * where it is set up and topped up.
 */
export function PantryCard() {
  const pantry = useSoma((s) => s.pantry);
  const customFoods = useSoma((s) => s.customFoods);
  const library = useMemo(() => composeLibrary(customFoods), [customFoods]);
  const addStock = useSoma((s) => s.addStock);
  const updateStock = useSoma((s) => s.updateStock);
  const removeStock = useSoma((s) => s.removeStock);
  const [name, setName] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...pantry].sort((a, b) => a.qty / Math.max(1, a.low) - b.qty / Math.max(1, b.low)),
    [pantry],
  );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2"
      >
        <CardTitle className="mb-0">In the cupboard</CardTitle>
        <span className="shrink-0 text-xs font-bold text-faint">
          {pantry.length} tracked
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="mb-2 text-[0.68rem] leading-snug text-faint">
            Stock comes off when you confirm you ate something, matched on the food&apos;s
            name. Grams and millilitres only — a portion in grams cannot come off a
            count of pieces, and guessing a conversion would quietly corrupt the count.
          </p>

          <div className="space-y-1.5">
            {sorted.map((p) => {
              const low = p.qty <= p.low;
              // Shown rather than assumed. A silent wrong link would feed the
              // wrong macros into every suggested day, and nobody would know.
              const linked = matchName(p.name, library, (fd) => fd.name);
              return (
                <SwipeRow
                  key={p.id}
                  id={p.id}
                  openId={swiped}
                  setOpenId={setSwiped}
                  onDelete={() => {
                    removeStock(p.id);
                    toast.success(`${p.name} no longer tracked`);
                  }}
                >
                  <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold">{p.name}</span>
                      <span className={cn("shrink-0 text-xs font-bold tabular", low && "text-warn")}>
                        {Math.round(p.qty)}
                        {p.unit === "x" ? "" : p.unit}
                        {low && " · low"}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 truncate text-[0.6rem]",
                        linked ? "text-faint" : "text-warn",
                      )}
                    >
                      {linked
                        ? `nutrition from ${linked.name}`
                        : "no matching food — rename it to match one in the diary"}
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      <Field label="Have" value={p.qty} onChange={(v) => updateStock(p.id, { qty: v })} />
                      <Field label="Low at" value={p.low} onChange={(v) => updateStock(p.id, { low: v })} />
                      <Field label="Pack" value={p.packSize ?? ""} onChange={(v) => updateStock(p.id, { packSize: v })} />
                    </div>
                  </div>
                </SwipeRow>
              );
            })}
          </div>

          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n) return;
              // Grams by default: it is what almost every food in the library
              // is measured in, so the match works without being told.
              addStock({ name: n, qty: 0, unit: "g", low: 0 });
              setName("");
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Track a food by name"
              className="h-10 flex-1"
            />
            <button
              type="submit"
              aria-label="Track this food"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2"
            >
              <Plus className="size-4" />
            </button>
          </form>

          {pantry.length === 0 && (
            <p className="mt-2 text-[0.66rem] leading-snug text-faint">
              Nothing tracked yet. The name has to match the food you log — &quot;Chicken
              breast&quot; here comes off &quot;Chicken breast&quot; in the diary.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({
  label, value, onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[0.55rem] font-bold uppercase tracking-wider text-faint">
        {label}
      </span>
      <DecimalInput
        aria-label={label}
        className="h-8 w-full text-center text-xs"
        value={value}
        onValueChange={(n) => onChange(n ?? 0)}
      />
    </label>
  );
}
