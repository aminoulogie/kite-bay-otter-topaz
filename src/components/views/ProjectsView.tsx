import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SwipeRow } from "@/components/SwipeRow";
import { WidgetGrid, useWidgetSize } from "@/components/WidgetGrid";
import { getLocalDateKey } from "@/lib/soma";
import {
  PROJECT_COLORS, daysLeft, doneCount, isComplete, isStale, nextStep, progress,
  sortProjects, stepsOf, summarise, type Project, type ProjectStatus,
} from "@/lib/projects";
import { hasDetailRoom } from "@/lib/dashboard-layout";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Things with a finish line.
 *
 * Everything else here is a habit or a measurement — something repeated, or
 * something read off a scale. A project is neither, and that is why it earns a
 * tab rather than a card on Home: it has an end, and the only questions worth
 * asking about one are what the next actual step is and whether it is still
 * moving.
 *
 * Progress is the count of ticked steps and nothing else. A percentage typed
 * in by hand is a mood, and the rest of this app is built on not letting
 * anyone grade their own homework.
 */
export function ProjectsView() {
  const projects = useSoma((s) => s.projects);
  const addProject = useSoma((s) => s.addProject);
  const removeProject = useSoma((s) => s.removeProject);
  const restoreProject = useSoma((s) => s.restoreProject);

  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);

  const today = getLocalDateKey();
  const sorted = useMemo(() => sortProjects(projects, today), [projects, today]);
  const board = useMemo(() => summarise(projects, today), [projects, today]);

  const nextColor = () =>
    PROJECT_COLORS.find((c) => !projects.some((p) => p.color === c)) ??
    PROJECT_COLORS[projects.length % PROJECT_COLORS.length]!;

  const create = () => {
    const text = name.trim();
    if (!text) return;
    const id = addProject(text, nextColor());
    setName("");
    setOpen(id);
    toast.success(`${text} started`);
  };

  return (
    <WidgetGrid tab="projects">
      <BoardHeader key="header" board={board} />

      <Card key="new">
        <CardTitle>Start something</CardTitle>
        <div className="flex gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Thesis, flat move, launch…"
            className="h-11 flex-1"
          />
          <Button variant="primary" disabled={!name.trim()} onClick={create}>
            <Plus className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[0.65rem] leading-snug text-faint">
          A project is a thing that is finished at some point. Anything you do every week
          belongs in Habits, where the streak means something.
        </p>
      </Card>

      <div key="list" className="space-y-2">
        {sorted.length === 0 ? (
          <Card>
            <p className="text-xs text-faint">
              Nothing on the go. A project here is one you could tick off — the steps are
              the progress bar, so break it into pieces small enough to actually finish.
            </p>
          </Card>
        ) : (
          sorted.map((p) => (
            <SwipeRow
              key={p.id}
              id={p.id}
              openId={swiped}
              setOpenId={setSwiped}
              onEdit={() => setOpen(p.id)}
              onDelete={() => {
                const idx = projects.findIndex((x) => x.id === p.id);
                removeProject(p.id);
                toast.success(`${p.name} removed`, {
                  action: { label: "Undo", onClick: () => restoreProject(idx, p) },
                });
              }}
            >
              <ProjectRow project={p} today={today} onOpen={() => setOpen(p.id)} />
            </SwipeRow>
          ))
        )}
      </div>

      {open && <ProjectSheet id={open} onClose={() => setOpen(null)} />}
    </WidgetGrid>
  );
}

function BoardHeader({ board }: { board: ReturnType<typeof summarise> }) {
  const size = useWidgetSize();
  return (
    <Card className="overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent_55%),var(--color-surface)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
            On the go
          </div>
          <h1 className="mt-1 font-display text-xl font-extrabold tracking-tight">
            {board.active} {board.active === 1 ? "project" : "projects"}
          </h1>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl font-extrabold tabular">{board.stepsLeft}</div>
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            steps left
          </div>
        </div>
      </div>

      {hasDetailRoom(size) && (board.overdue > 0 || board.stale > 0) && (
        <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[0.68rem] font-bold leading-snug text-warn">
          {board.overdue > 0 && `${board.overdue} past its date`}
          {board.overdue > 0 && board.stale > 0 && " · "}
          {board.stale > 0 && `${board.stale} untouched for a while`}
          {". Pause one rather than carrying it — a paused project stops being counted."}
        </p>
      )}

      {hasDetailRoom(size) && board.done > 0 && (
        <p className="mt-2 text-[0.65rem] text-faint">
          {board.done} finished.
        </p>
      )}
    </Card>
  );
}

function ProjectRow({
  project, today, onOpen,
}: {
  project: Project;
  today: string;
  onOpen: () => void;
}) {
  const pct = progress(project);
  const left = daysLeft(project, today);
  const step = nextStep(project);
  const steps = stepsOf(project);
  const stale = isStale(project);
  const complete = isComplete(project);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-2.5 rounded-2xl border border-border bg-surface-2 p-3 text-left"
    >
      <span
        aria-hidden
        className={cn("mt-0.5 h-10 w-1.5 shrink-0 rounded-full", project.status !== "active" && "opacity-40")}
        style={{ background: project.color }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm font-bold", project.status === "done" && "line-through text-faint")}>
            {project.name}
          </span>
          {project.status === "paused" && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[0.52rem] font-bold uppercase tracking-wide text-faint">
              paused
            </span>
          )}
        </span>

        <span className="mt-1.5 block">
          <Progress value={pct * 100} />
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] text-faint">
          <span className="tabular">
            {doneCount(project)}/{steps.length || 0} steps
          </span>
          {left !== null && (
            <span className={cn("tabular", left < 0 ? "font-bold text-danger" : left <= 3 && "font-bold text-warn")}>
              {left < 0
                ? `${-left}d over`
                : left === 0
                  ? "due today"
                  : `${left}d left`}
            </span>
          )}
          {stale && <span className="font-bold text-warn">drifting</span>}
        </span>

        {/* The next step, not all of them. A list of ten on a card is a list
            nobody reads; the one thing you could do now is the whole point. */}
        {project.status !== "done" && (
          <span className="mt-1 block truncate text-[0.68rem] text-muted">
            {complete
              ? "Every step ticked — open it to close it off."
              : step
                ? `Next: ${step.label}`
                : "No steps yet. Break it into pieces you can finish."}
          </span>
        )}
      </span>
    </button>
  );
}

function ProjectSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const project = useSoma((s) => s.projects.find((p) => p.id === id));
  const patchProject = useSoma((s) => s.patchProject);
  const addProjectStep = useSoma((s) => s.addProjectStep);
  const setProjectStep = useSoma((s) => s.setProjectStep);
  const removeProjectStep = useSoma((s) => s.removeProjectStep);
  const removeProject = useSoma((s) => s.removeProject);
  const [step, setStepText] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);

  if (!project) return null;
  const steps = stepsOf(project);
  const today = getLocalDateKey();
  const left = daysLeft(project, today);

  const addIt = () => {
    const text = step.trim();
    if (!text) return;
    addProjectStep(project.id, text);
    setStepText("");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={project.name}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="truncate font-display text-base font-extrabold">{project.name}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Name
          </span>
          <Input
            value={project.name}
            onChange={(e) => patchProject(project.id, { name: e.target.value })}
            className="h-11"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Finish by
          </span>
          <div className="flex gap-2">
            <Input
              type="date"
              value={project.due ?? ""}
              onChange={(e) => patchProject(project.id, { due: e.target.value || undefined })}
              aria-label="Deadline"
              className="h-11 flex-1 tabular"
            />
            {project.due && (
              <button
                type="button"
                onClick={() => patchProject(project.id, { due: undefined })}
                className="h-11 shrink-0 rounded-xl border border-border bg-surface-2 px-3 text-[0.7rem] font-bold text-muted"
              >
                Clear
              </button>
            )}
          </div>
          {left !== null && (
            <p className="mt-1 text-[0.65rem] text-faint">
              {left < 0 ? `${-left} days past.` : left === 0 ? "Due today." : `${left} days to go.`}
            </p>
          )}
        </label>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {(["active", "paused", "done"] as ProjectStatus[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => patchProject(project.id, { status: st })}
              className={cn(
                "h-11 rounded-xl border text-sm font-bold capitalize",
                project.status === st ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2",
              )}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => patchProject(project.id, { color: c })}
              className={cn(
                "size-8 rounded-lg border-2",
                project.color === c ? "border-fg" : "border-transparent",
              )}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Steps
          </span>
          <span className="text-sm font-bold tabular">
            {doneCount(project)}/{steps.length}
          </span>
        </div>

        <div className="mb-2 space-y-1.5">
          {steps.map((s) => (
            <SwipeRow
              key={s.id}
              id={s.id}
              openId={swiped}
              setOpenId={setSwiped}
              onDelete={() => removeProjectStep(project.id, s.id)}
            >
              <button
                type="button"
                onClick={() => setProjectStep(project.id, s.id, !s.done)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                    s.done ? "border-accent bg-accent text-accent-ink" : "border-border",
                  )}
                >
                  {s.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cn("min-w-0 flex-1 text-sm font-semibold", s.done && "text-faint line-through")}>
                  {s.label}
                </span>
              </button>
            </SwipeRow>
          ))}
        </div>

        <div className="mb-3 flex gap-1.5">
          <Input
            value={step}
            onChange={(e) => setStepText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addIt()}
            placeholder="Next step"
            className="h-11 flex-1"
          />
          <Button variant="primary" disabled={!step.trim()} onClick={addIt}>
            <Plus className="size-4" />
          </Button>
        </div>

        {isComplete(project) && project.status !== "done" && (
          <Button
            variant="primary"
            className="mb-3 w-full"
            onClick={() => {
              patchProject(project.id, { status: "done" });
              toast.success(`${project.name} finished`);
              onClose();
            }}
          >
            Every step is ticked — close it off
          </Button>
        )}

        <button
          type="button"
          onClick={() => {
            removeProject(project.id);
            onClose();
            toast.success(`${project.name} removed`);
          }}
          className="w-full rounded-xl border border-danger/50 py-2.5 text-xs font-bold text-danger"
        >
          Remove {project.name}
        </button>
      </div>
    </div>
  );
}
