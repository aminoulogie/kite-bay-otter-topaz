import { BarChart3 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { completionRate, dayBudget } from "@/lib/focus";
import { duration, type RoutineStep } from "@/lib/routine";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Planned against spent, for today.
 *
 * The day plan says how many flexible hours there are; the focus queue says
 * what you meant to put in them; the session log says what actually got
 * time. Three numbers on one bar, so "I had four free hours and worked for
 * forty minutes" is something you see rather than something you work out.
 */
export function FocusBudget({ flexHours }: { flexHours: number }) {
  const activeDate = useSoma((s) => s.activeDate);
  const queue = useSoma((s) => s.focusQueues[s.activeDate]) ?? EMPTY;
  const spent = useSoma((s) => s.focusSpent[s.activeDate]);
  const log = useSoma((s) => s.focusLog);

  const b = dayBudget(queue, spent, flexHours);
  const today = log.filter((s) => s.date === activeDate).slice(-3).reverse();

  if (!b.spentSeconds && !b.queuedSeconds && !today.length) {
    return (
      <Card>
        <CardTitle>
          <span className="flex items-center gap-1.5">
            <BarChart3 className="size-4 text-accent" /> Planned vs spent
          </span>
        </CardTitle>
        <p className="text-[0.7rem] leading-snug text-faint">
          Once you run your focus list, this compares what you planned for today with the
          time that actually went in — and how much flexible time is still unclaimed.
        </p>
      </Card>
    );
  }

  const whole = Math.max(b.flexSeconds, b.spentSeconds + b.queuedSeconds, 1);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / whole) * 100))}%`;

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-1.5">
          <BarChart3 className="size-4 text-accent" /> Planned vs spent
        </span>
      </CardTitle>

      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="spent" value={duration(b.spentSeconds)} />
        <Stat label="still queued" value={duration(b.queuedSeconds)} />
        <Stat
          label={b.leftoverSeconds < 0 ? "over flexible" : "unclaimed"}
          value={duration(Math.abs(b.leftoverSeconds))}
          warn={b.leftoverSeconds < 0}
        />
      </div>

      <div className="mb-1 flex h-3 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full bg-accent" style={{ width: pct(b.spentSeconds) }} />
        <div className="h-full bg-accent/35" style={{ width: pct(b.queuedSeconds) }} />
      </div>
      <p className="mb-3 text-[0.62rem] text-faint">
        Of {duration(b.flexSeconds)} flexible today · to-dos {duration(b.spentBySource.todo)} ·
        habits {duration(b.spentBySource.habit)} · free {duration(b.spentBySource.free)}
      </p>

      {today.length > 0 && (
        <div className="space-y-1">
          {today.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs"
            >
              <span className="truncate font-semibold">
                {s.name}
                <span className="ml-1.5 text-faint tabular">
                  {new Date(s.endedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <span className="shrink-0 tabular text-faint">
                {s.done}/{s.steps} · {duration(s.spentSeconds)} · {completionRate(s)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const EMPTY: RoutineStep[] = [];

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2">
      <div className={cn("font-display text-base font-extrabold tabular", warn && "text-warn")}>{value}</div>
      <div className="text-[0.58rem] font-bold uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}
