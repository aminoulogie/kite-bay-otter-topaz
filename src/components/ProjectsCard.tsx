import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { hasDetailRoom, hasFullRoom } from "@/lib/dashboard-layout";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";
import { getLocalDateKey } from "@/lib/soma";
import { daysLeft, isStale, nextStep, sortProjects, summarise } from "@/lib/projects";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * What to do next, across every project, on Home.
 *
 * The Projects tab answers "how is this one going". This answers the smaller
 * question you actually have on the way past: of everything with a finish
 * line, what is the next thing I could pick up. So it shows next steps and
 * not progress bars — a bar is a status report, and Home has four of those
 * already.
 *
 * **Nothing here is tickable, for the same reason the habit rings are not**
 * (see components/HabitRings.tsx): one screen stays answerable for the
 * record. It matters more here than it does there. A step's tick carries the
 * timestamp that the whole pace read is measured from, so a mis-tap on the
 * way past Home would not just mark the wrong thing done — it would quietly
 * move the rate the Projects tab reports for weeks afterwards.
 *
 * Three, not all of them. A list of everything outstanding is the thing
 * people already have and already ignore.
 */
const SHOWN = 3;

export function ProjectsCard() {
  const projects = useSoma((s) => s.projects);
  const setTab = useSoma((s) => s.setTab);
  const size = useWidgetSize();

  const today = getLocalDateKey();
  const board = useMemo(() => summarise(projects, today), [projects, today]);
  // Sorted by the tab's own rule, so the order here and the order there agree:
  // nearest deadline first, and a project with a date outranks one without.
  const next = useMemo(
    () =>
      sortProjects(projects, today)
        .filter((p) => p.status === "active" && nextStep(p))
        .slice(0, hasFullRoom(size) ? SHOWN * 2 : isGlance(size) ? 4 : SHOWN),
    [projects, today, size],
  );

  // Nothing with a finish line is not a state worth a card on the page you see
  // first. The tab is still in the dock for anyone who wants to start one.
  if (!projects.some((p) => p.status === "active")) return null;

  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Projects",
          value: String(board.stepsLeft),
          unit: board.stepsLeft === 1 ? "step left" : "steps left",
          sub: `${board.active} on the go`,
          lines: next.map((p) => {
            const left = daysLeft(p, today);
            return {
              text: nextStep(p)!.label,
              color: p.color,
              value: left === null ? undefined : left < 0 ? `${-left}d over` : left === 0 ? "today" : `${left}d`,
            };
          }),
          onOpen: () => setTab("projects"),
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTab("projects")}
      className="block h-full w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-card active:bg-surface-2"
      aria-label={`Projects: ${board.stepsLeft} steps left across ${board.active} active. Opens the Projects tab.`}
    >
      <div className="flex items-start justify-between gap-2">
        <CardTitle className="mb-0">Projects</CardTitle>
        <span className="flex shrink-0 items-center gap-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
          {board.stepsLeft} left
          <ChevronRight className="size-3.5" />
        </span>
      </div>

      {next.length === 0 ? (
        <p className="mt-2 text-xs leading-snug text-faint">
          No steps written down. A project without a next step is a wish — open it and
          break off something you could finish.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {next.map((p) => {
            const left = daysLeft(p, today);
            const step = nextStep(p)!;
            return (
              <li key={p.id} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1 size-1.5 shrink-0 rounded-full"
                  style={{ background: p.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{step.label}</span>
                  {hasDetailRoom(size) && (
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[0.6rem] text-faint">
                      <span className="truncate">{p.name}</span>
                      {left !== null && (
                        <span
                          className={cn(
                            "tabular",
                            left < 0 ? "font-bold text-danger" : left <= 3 && "font-bold text-warn",
                          )}
                        >
                          {left < 0 ? `${-left}d over` : left === 0 ? "due today" : `${left}d`}
                        </span>
                      )}
                      {isStale(p) && <span className="font-bold text-warn">drifting</span>}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {hasDetailRoom(size) && board.active > next.length && (
        <p className="mt-2 text-[0.6rem] text-faint">
          {board.active - next.length} more on the go.
        </p>
      )}
    </button>
  );
}
