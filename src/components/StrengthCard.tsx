import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { perHand, progressSince, strengthGroups, weightFor } from "@/lib/strength-transfer";
import { cn } from "@/lib/utils";

/**
 * Strength per movement, whichever variation you trained it with.
 *
 * One number per group — a barbell-equivalent estimated max — so a month of
 * machine preacher curls and a month of dumbbells still read as one line of
 * progress. Under it, what that strength means on each variation you have
 * done: the weight for 10 reps, a hand for dumbbells.
 */
export function StrengthCard() {
  const history = useSoma((s) => s.history);
  const unit = useSoma((s) => s.settings.unit);
  const [open, setOpen] = useState<string | null>(null);
  const today = getLocalDateKey();
  const since = getLocalDateKey(addDays(parseLocalDateKey(today), -56));
  const groups = useMemo(() => {
    const all = [...strengthGroups(history).values()];
    return all
      .map((g) => ({ g, change: (progressSince(g, since) ?? 0) * 100 }))
      .sort((a, b) => b.g.last.at.localeCompare(a.g.last.at));
  }, [history, since]);
  const size = useWidgetSize();
  const fmt = (n: number) => `${Math.round(n * 2) / 2} ${unit}`;

  if (isGlance(size)) {
    const top = groups[0];
    return (
      <Glance
        size={size}
        spec={{
          label: "Strength",
          short: "Strength",
          icon: TrendingUp,
          color: "#30d158",
          value: top ? fmt(top.g.strength) : "—",
          sub: top ? `${top.g.group.label} · ${top.change >= 0 ? "+" : ""}${Math.round(top.change)}% in 8 wk` : "Log a lift to start",
        }}
      />
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wider text-muted">
        <TrendingUp className="size-3.5" /> Strength by movement
      </div>
      <p className="mt-1 text-xs text-muted">
        One estimated max per movement, whatever kit you used — bar, dumbbells or machine. Tap one to see what it means
        on each variation.
      </p>
      {!groups.length && <p className="mt-2 text-sm text-muted">Log a few lifts and your strength shows up here.</p>}
      <div className="mt-2 divide-y divide-border">
        {groups.map(({ g, change }) => (
          <div key={g.group.id} className="py-2">
            <button
              type="button"
              onClick={() => setOpen((o) => (o === g.group.id ? null : g.group.id))}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold">{g.group.label}</span>
                <span className="block truncate text-[0.7rem] text-muted">
                  last: {g.last.name} · {g.last.at}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display font-extrabold tabular">{fmt(g.strength)}</span>
                <span className={cn("block text-[0.7rem] font-bold tabular", change > 0.5 ? "text-good" : change < -0.5 ? "text-danger" : "text-muted")}>
                  {change >= 0 ? "+" : ""}
                  {Math.round(change)}% · 8 wk
                </span>
              </span>
            </button>
            {open === g.group.id && (
              <div className="mt-2 space-y-1 rounded-xl bg-surface-2 p-2 text-xs">
                <p className="text-faint">For 10 reps with one left in the tank:</p>
                {[...g.ratios.values()].map((r) => {
                  let w = weightFor(g.strength * r.ratio, 10, 1);
                  const hand = perHand(r.name);
                  if (hand) w /= 2;
                  return (
                    <div key={r.name} className="flex justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <span className="shrink-0 font-bold tabular">
                        {fmt(w)}
                        {hand ? " each" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
