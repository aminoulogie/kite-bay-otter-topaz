import { useMemo } from "react";
import { CalendarCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";
import { PLAN_RULES, READING_PLAN, isSunday, pagesThisWeek, planState } from "@/lib/reading-plan";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function short(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

/**
 * The reading plan: this week's assignment up top, the whole schedule under
 * it, and the rules that keep it on track. On Sundays it also shows the pages
 * logged this week, for the weekly check.
 */
export function ReadingPlan() {
  const mind = useSoma((s) => s.mind);
  const today = getLocalDateKey(new Date());
  const state = planState(today);
  const pages = useMemo(() => pagesThisWeek(mind, today), [mind, today]);
  const sunday = isSunday(today);
  const current = state.phase === "during" ? state.index : -1;

  const headline =
    state.phase === "during"
      ? { label: `${state.block.label} · day ${state.dayOf} of ${state.days}`, what: state.block.what }
      : state.phase === "done"
        ? { label: "Plan finished", what: "Every book on the plan is done." }
        : { label: `${state.next.label} starts ${short(state.next.start)} · in ${state.inDays} day${state.inDays === 1 ? "" : "s"}`, what: state.next.what };

  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Reading plan",
          short: "Plan",
          icon: CalendarCheck,
          value: state.phase === "during" ? state.block.label : state.phase === "done" ? "Done" : short(state.next.start),
          sub: headline.what,
          progress: state.phase === "during" ? state.dayOf / state.days : undefined,
        }}
      />
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-wider text-muted">
        <CalendarCheck className="size-3.5" />
        Reading plan
      </div>

      <div className="mt-3 rounded-2xl border border-accent-line bg-accent-soft px-3.5 py-3">
        <p className="text-[0.7rem] font-bold text-muted">{headline.label}</p>
        <p className="mt-0.5 font-display text-base font-extrabold leading-snug">{headline.what}</p>
      </div>

      {sunday && state.phase !== "done" && (
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-surface-2 px-3.5 py-2.5">
          <span className="text-xs font-bold">Sunday check</span>
          <span className="text-xs text-muted">
            <span className="font-display text-sm font-extrabold tabular text-fg">{pages}</span> pages logged this week
          </span>
        </div>
      )}

      <ol className="mt-4 space-y-1.5">
        {READING_PLAN.map((b, i) => {
          const past = b.end < today;
          return (
            <li
              key={b.start}
              className={cn(
                "flex gap-3 rounded-xl px-2.5 py-2",
                i === current ? "bg-surface-2" : "",
                past ? "opacity-50" : "",
              )}
            >
              <div className="w-[4.5rem] shrink-0">
                <p className={cn("text-xs font-bold", i === current && "text-accent")}>{b.label}</p>
                <p className="text-[0.65rem] tabular text-faint">
                  {short(b.start)}–{short(b.end)}
                </p>
              </div>
              <p className={cn("text-sm leading-snug", past && "line-through")}>{b.what}</p>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-[0.7rem] font-bold uppercase tracking-wider text-muted">Rules that keep it on track</p>
      <ul className="mt-2 space-y-2">
        {PLAN_RULES.map((r) => (
          <li key={r.title} className="text-sm leading-snug">
            <span className="font-bold">{r.title}: </span>
            <span className="text-muted">{r.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
