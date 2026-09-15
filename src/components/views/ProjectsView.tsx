import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SwipeRow } from "@/components/SwipeRow";
import { TopTabs } from "@/components/TopTabs";
import { WidgetGrid, useWidgetSize } from "@/components/WidgetGrid";
import { getLocalDateKey } from "@/lib/soma";
import {
  PROJECT_COLORS, daysLeft, daysSinceMove, doneCount, isComplete, isStale, nextStep,
  pace, paceLabel, progress, sortProjects, stepsOf, summarise,
  type Project, type ProjectStatus,
} from "@/lib/projects";
import { tapLight, tapSuccess } from "@/lib/haptics";
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
  const [lens, setLens] = useState<ProjectStatus>("active");

  const today = getLocalDateKey();
  const sorted = useMemo(() => sortProjects(projects, today), [projects, today]);
  const board = useMemo(() => summarise(projects, today), [projects, today]);

  // Finished projects used to sort to the bottom and stay there for good, so
  // the board got longer every time something went right. Three lenses rather
  // than a "hide done" switch: paused is not a lesser kind of active, it is a
  // decision, and a list that mixes the two makes the drift warning meaningless.
  const shown = useMemo(() => sorted.filter((p) => p.status === lens), [sorted, lens]);
  const counts = useMemo(() => {
    const n: Record<ProjectStatus, number> = { active: 0, paused: 0, done: 0 };
    for (const p of projects) n[p.status] += 1;
    return n;
  }, [projects]);

  const LENSES = [
    { id: "active" as const, label: `Active ${counts.active}` },
    { id: "paused" as const, label: `Paused ${counts.paused}` },
    { id: "done" as const, label: `Done ${counts.done}` },
  ];

  const nextColor = () =>
    PROJECT_COLORS.find((c) => !projects.some((p) => p.color === c)) ??
    PROJECT_COLORS[projects.length % PROJECT_COLORS.length]!;

  const create = () => {
    const text = name.trim();
    if (!text) return;
    const id = addProject(text, nextColor());
    setName("");
    // A new project is active, so show the lens it landed in rather than
    // leaving someone looking at a list it is not in.
    setLens("active");
    setOpen(id);
    toast.success(`${text} started`);
  };

  return (
    <WidgetGrid tab="projects">
      <BoardHeader key="header" board={board} projects={projects} />

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

      <TopTabs key="filter" tabs={LENSES} value={lens} onChange={setLens} />

      <div key="list" className="space-y-2">
        {shown.length === 0 ? (
          <Card>
            <p className="text-xs text-faint">
              {lens === "active"
                ? projects.length === 0
                  ? "Nothing on the go. A project here is one you could tick off — the steps are the progress bar, so break it into pieces small enough to actually finish."
                  : "Nothing active. Everything you have is paused or finished."
                : lens === "paused"
                  ? "Nothing paused. A project you have consciously set down belongs here rather than sitting in the active list going stale."
                  : "Nothing finished yet."}
            </p>
          </Card>
        ) : (
          shown.map((p) => (
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

function BoardHeader({
  board, projects,
}: {
  board: ReturnType<typeof summarise>;
  projects: Project[];
}) {
  const size = useWidgetSize();
  const patchProject = useSoma((s) => s.patchProject);

  // The warning used to name a count and then tell you to pause one, with no
  // way to do it from here: you had to work out which, open it, and find the
  // status buttons. A nag you cannot act on where you read it is a nag people
  // learn to scroll past, which costs the signal its meaning.
  const drifting = useMemo(
    () => projects.filter((p) => isStale(p)).slice(0, 3),
    [projects],
  );

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
        <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2">
          <p className="text-[0.68rem] font-bold leading-snug text-warn">
            {board.overdue > 0 && `${board.overdue} past its date`}
            {board.overdue > 0 && board.stale > 0 && " · "}
            {board.stale > 0 && `${board.stale} untouched for a while`}
            {". Pause one rather than carrying it — a paused project stops being counted."}
          </p>
          {drifting.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {drifting.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    tapLight();
                    patchProject(p.id, { status: "paused" });
                    toast.success(`${p.name} paused`, {
                      action: {
                        label: "Undo",
                        onClick: () => patchProject(p.id, { status: "active" }),
                      },
                    });
                  }}
                  className="max-w-full truncate rounded-full border border-warn/50 px-2.5 py-1 text-[0.62rem] font-bold text-warn"
                >
                  Pause {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
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
  const since = daysSinceMove(project);
  const p = pace(project, today);

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
          {/* "Drifting" was a ten-day yes/no standing in for the whole question
              of whether a project is moving. Every tick already carries its
              time, so say the actual number: a fortnight and nine days are
              both "drifting" and only one of them is a problem. */}
          {stale && (
            <span className="font-bold text-warn">
              {since === null ? "never moved" : `${since}d since a step`}
            </span>
          )}
          {!stale && project.status === "active" && p.verdict === "behind" && (
            <span className="font-bold text-warn">behind the date</span>
          )}
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

        {/* The rate, next to the rate the deadline demands. Both are counted
            from the ticks; neither is a number anyone typed. */}
        {project.status === "active" && (p.verdict === "ahead" || p.verdict === "behind") && (
          <span className="mt-0.5 block truncate text-[0.62rem] tabular text-faint">
            {paceLabel(p)}
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
  const renameProjectStep = useSoma((s) => s.renameProjectStep);
  const moveProjectStep = useSoma((s) => s.moveProjectStep);
  const removeProject = useSoma((s) => s.removeProject);
  const [step, setStepText] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (!project) return null;
  const steps = stepsOf(project);
  const today = getLocalDateKey();
  const left = daysLeft(project, today);
  const p = pace(project, today);
  const since = daysSinceMove(project);

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

        {/* Why it exists. The field has been in the type and the backup since
            the start with nothing to write it, which meant a project could
            carry a reason nobody could read or set. One line, not a
            paragraph: most projects do not need one, and a box big enough to
            invite an essay turns the sheet into a document. */}
        <label className="mb-3 block">
          <span className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Why
          </span>
          <Input
            value={project.note ?? ""}
            onChange={(e) => patchProject(project.id, { note: e.target.value || undefined })}
            placeholder="What finishing this actually gets you"
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

        {/* Are you still moving, in the only terms that cannot be fudged: the
            rate you have actually been ticking at, against the rate the date
            you set demands. Hidden for a project with no steps, because there
            is nothing to have a rate of yet. */}
        {steps.length > 0 && (
          <div className="mb-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
                Moving
              </span>
              {since !== null && (
                <span className="text-[0.62rem] tabular text-faint">
                  last step {since === 0 ? "today" : `${since}d ago`}
                </span>
              )}
            </div>
            <p
              className={cn(
                "mt-1 text-sm font-bold",
                p.verdict === "behind" || p.verdict === "overdue" ? "text-warn" : "text-fg",
              )}
            >
              {paceLabel(p)}
            </p>
            {p.verdict === "behind" && (
              <p className="mt-1 text-[0.65rem] leading-snug text-faint">
                Either the steps get smaller or the date moves. Both are honest; carrying a
                date you are not working towards is not.
              </p>
            )}
          </div>
        )}

        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Steps
          </span>
          <span className="text-sm font-bold tabular">
            {doneCount(project)}/{steps.length}
          </span>
        </div>

        {/* Order is not cosmetic here: the card shows the first unticked step,
            and that one line is what the tab is for. Renaming and moving both
            exist so correcting the list never costs a tick — deleting and
            retyping threw away the timestamp the pace above is measured from. */}
        <div className="mb-2 space-y-1.5">
          {steps.map((s, i) => (
            <SwipeRow
              key={s.id}
              id={s.id}
              openId={swiped}
              setOpenId={setSwiped}
              onEdit={() => setEditing(s.id)}
              editLabel="Rename"
              onDelete={() => removeProjectStep(project.id, s.id)}
            >
              {editing === s.id ? (
                <Input
                  autoFocus
                  defaultValue={s.label}
                  aria-label={`Rename ${s.label}`}
                  onBlur={(e) => {
                    renameProjectStep(project.id, s.id, e.target.value);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="h-11"
                />
              ) : (
                <div className="flex w-full items-center gap-1 rounded-xl border border-border bg-surface-2 pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !s.done;
                      setProjectStep(project.id, s.id, next);
                      if (next) tapLight();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
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
                  <button
                    type="button"
                    aria-label={`Move ${s.label} up`}
                    disabled={i === 0}
                    onClick={() => moveProjectStep(project.id, s.id, -1)}
                    className="shrink-0 rounded-lg p-1.5 text-muted disabled:opacity-25"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${s.label} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => moveProjectStep(project.id, s.id, 1)}
                    className="shrink-0 rounded-lg p-1.5 text-muted disabled:opacity-25"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
              )}
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
              tapSuccess();
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
