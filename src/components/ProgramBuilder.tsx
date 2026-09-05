import { useMemo, useState } from "react";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { tapLight, tapMedium } from "@/lib/haptics";
import { useLongPressDrag } from "@/lib/use-long-press-drag";
import {
  REST_DAY, WEEKDAYS, isRestSplit, isoDay, makeProgram, normaliseWeek, reorder,
  trainingDaysPerWeek, type Program, type ProgramKind,
} from "@/lib/programs";
import { ROTATION_SEQUENCE, ROUTINE_PRESETS, SomaIntelligenceEngine } from "@/lib/soma";
import { BUILT_IN_PROGRAM, useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Building and choosing the training programme.
 *
 * Selecting one changes what the whole app is scheduled from — the calendar
 * labels, the Train tab's split for today, backfilling a missed day, rest
 * detection in the day score, and the projections in Ahead. All of those read
 * the same projection function, so this screen only has to set which sequence
 * that function uses; nothing else needed rewiring.
 */

const TEMPLATES: { name: string; kind: ProgramKind; days: string[] }[] = [
  {
    name: "PPL × 2",
    kind: "cycle",
    days: ["Push", "Pull", "Legs", "Push", "Pull", "Legs", REST_DAY],
  },
  {
    name: "PPLULR",
    kind: "cycle",
    days: ["Push", "Pull", "Legs", "Upper", "Lower", REST_DAY],
  },
  {
    name: "Upper / Lower",
    kind: "cycle",
    days: ["Upper", "Lower", REST_DAY, "Upper", "Lower", REST_DAY, REST_DAY],
  },
  {
    name: "Full body ×3",
    kind: "week",
    days: [REST_DAY, "Full body", REST_DAY, "Full body", REST_DAY, "Full body", REST_DAY],
  },
  {
    name: "Bro split",
    kind: "cycle",
    days: ["Chest", "Back", "Legs", "Shoulders", "Arms", REST_DAY, REST_DAY],
  },
];

export function ProgramBuilder({ onClose }: { onClose: () => void }) {
  const programs = useSoma((s) => s.programs);
  const activeId = useSoma((s) => s.activeProgramId);
  const setPrograms = useSoma((s) => s.setPrograms);
  const setActiveProgram = useSoma((s) => s.setActiveProgram);
  // Subscribed to as raw settings and merged here, not read through
  // s.routines(): that method builds a new object on every call, and a new
  // object returned from a selector makes the store look changed on every
  // render — which is what took this screen down with React #185.
  const customRoutines = useSoma((s) => s.settings.customRoutines);
  const removedRoutines = useSoma((s) => s.settings.customRoutinesRemoved);
  const routines = useMemo(
    () =>
      SomaIntelligenceEngine.mergeRoutines(ROUTINE_PRESETS, {
        ...customRoutines,
        _removed: removedRoutines,
      }) as Record<string, { name: string }[]>,
    [customRoutines, removedRoutines],
  );

  const [editing, setEditing] = useState<Program | null>(null);

  /** Split names available to assign — the user's own routines, plus rest. */
  const splitNames = useMemo(() => {
    const names = Object.keys(routines ?? {});
    const all = [...new Set([...names, ...ROTATION_SEQUENCE, REST_DAY])];
    return all.sort((a, b) => (isRestSplit(a) ? 1 : isRestSplit(b) ? -1 : a.localeCompare(b)));
  }, [routines]);

  const persist = (next: Program[]) => setPrograms(next);

  if (editing) {
    return (
      <ProgramEditor
        program={editing}
        splitNames={splitNames}
        onCancel={() => setEditing(null)}
        onSave={(p) => {
          persist([...programs.filter((x) => x.id !== p.id), p]);
          setEditing(null);
          toast.success(`${p.name} saved`);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle className="mb-0">Your programmes</CardTitle>
          <button
            type="button"
            onClick={() =>
              setEditing(makeProgram({ name: "", kind: "cycle", days: [REST_DAY] }))
            }
            className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.65rem] font-bold text-accent-text"
          >
            <Plus className="size-3" /> New
          </button>
        </div>
        <p className="mb-3 text-[0.66rem] leading-snug text-muted">
          The selected programme decides what the calendar shows, which split Train opens
          on, and what Ahead projects against. Changing it changes all of them at once.
        </p>

        <div className="space-y-1.5">
          <ProgramRow
            program={BUILT_IN_PROGRAM}
            active={!activeId || activeId === "built-in"}
            onSelect={() => {
              setActiveProgram("built-in");
              tapMedium();
              toast.success("Default rotation selected");
            }}
          />
          {programs.map((p) => (
            <ProgramRow
              key={p.id}
              program={p}
              active={activeId === p.id}
              onSelect={() => {
                setActiveProgram(p.id);
                tapMedium();
                toast.success(`${p.name} selected`);
              }}
              onEdit={() => setEditing(p)}
              onDelete={() => {
                persist(programs.filter((x) => x.id !== p.id));
                // Falling back rather than leaving a dangling id, which would
                // silently drop the whole app back to the default anyway.
                if (activeId === p.id) setActiveProgram("built-in");
              }}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Start from a template</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() =>
                setEditing(makeProgram({ name: t.name, kind: t.kind, days: [...t.days] }))
              }
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left active:bg-surface-3"
            >
              <div className="text-[0.75rem] font-bold">{t.name}</div>
              <div className="text-[0.6rem] text-faint">
                {t.days.filter((d) => !isRestSplit(d)).length} training ·{" "}
                {t.kind === "week" ? "weekly" : `${t.days.length}-day cycle`}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.6rem] text-faint">
          A template opens as a copy — editing it never changes the template.
        </p>
      </Card>

      <Button className="w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

function ProgramRow({
  program, active, onSelect, onEdit, onDelete,
}: {
  program: Program;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border p-2.5 transition-colors",
        active ? "border-accent bg-accent/10" : "border-border bg-surface-2",
      )}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border",
            active ? "border-accent bg-accent text-accent-ink" : "border-border",
          )}
        >
          {active && <Check className="size-3" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.76rem] font-bold">
            {program.name || "Untitled"}
          </span>
          <span className="block text-[0.6rem] text-faint">
            {program.kind === "week" ? "weekly" : `${program.days.length}-day cycle`} ·{" "}
            {trainingDaysPerWeek(program)} training days/week
          </span>
        </span>
      </button>
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-[0.65rem] font-bold text-accent-text">
          Edit
        </button>
      )}
      {onDelete && (
        <button type="button" aria-label={`Delete ${program.name}`} onClick={onDelete} className="text-danger">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Editing one programme's days.
 *
 * Reordering is press-and-drag rather than a pair of arrows: a six-day
 * rotation reordered by arrows is a dozen taps, and the order is the entire
 * point of the screen.
 */
function ProgramEditor({
  program, splitNames, onCancel, onSave,
}: {
  program: Program;
  splitNames: string[];
  onCancel: () => void;
  onSave: (p: Program) => void;
}) {
  const [draft, setDraft] = useState<Program>(program);
  const [picking, setPicking] = useState<number | null>(null);
  /**
   * Press-and-hold to pick a day up, then drag it over another.
   *
   * Not HTML5 drag-and-drop: that never fires for touch on iOS, so on the
   * phone this app actually runs on it would do nothing at all.
   */
  const drag = useLongPressDrag(
    draft.days.length,
    (from, to) => setDays(reorder(days, from, to)),
    tapMedium,
  );

  const days = draft.kind === "week" ? normaliseWeek(draft.days) : draft.days;

  const setDays = (next: string[]) => setDraft({ ...draft, days: next });

  const switchKind = (kind: ProgramKind) => {
    // Converting to a week pads to seven and fills the gaps with rest, so the
    // days already chosen survive the switch instead of being discarded.
    setDraft({
      ...draft,
      kind,
      days: kind === "week" ? normaliseWeek(draft.days) : draft.days,
    });
  };

  return (
    <Card>
      <CardTitle>{draft.name || "New programme"}</CardTitle>

      <Input
        className="mb-2"
        placeholder="Name — PPLULR, Winter block…"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />

      <div className="mb-3 flex gap-1">
        {(["cycle", "week"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            className={cn(
              "h-9 flex-1 rounded-lg text-[0.7rem] font-bold transition-colors",
              draft.kind === k ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
            )}
          >
            {k === "cycle" ? "Rolling cycle" : "Fixed weekdays"}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[0.6rem] leading-snug text-faint">
        {draft.kind === "cycle"
          ? "Repeats every " + days.length + " days regardless of the weekday — a Thursday is whatever the cycle says."
          : "Pinned to the week. Any day left as rest stays a rest day, every week."}
      </p>

      <div className="mb-2 space-y-1">
        {days.map((d, i) => (
          <div
            key={`${d}-${i}`}
            data-drag-index={i}
            {...drag.handlers(i)}
            className={cn(
              "flex items-center gap-2 rounded-xl border p-2 transition-[colors,transform]",
              // Held: lifted and following the finger.
              drag.dragging === i
                ? "scale-[1.02] border-accent bg-accent/15 shadow-lg"
                : drag.over === i && drag.dragging != null
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface-2",
              isRestSplit(d) && drag.dragging !== i && "opacity-70",
            )}
            // Vertical panning is handled by the drag itself once a row is
            // held; leaving it to the browser would scroll the page instead.
            style={{ touchAction: drag.dragging != null ? "none" : "pan-y" }}
          >
            <GripVertical className="size-4 shrink-0 cursor-grab text-faint" />
            <span className="w-16 shrink-0 text-[0.6rem] font-bold uppercase text-faint">
              {draft.kind === "week" ? WEEKDAYS[i]?.slice(0, 3) : `Day ${i + 1}`}
            </span>
            <button
              type="button"
              onClick={() => setPicking(picking === i ? null : i)}
              className="min-w-0 flex-1 truncate text-left text-[0.72rem] font-bold"
            >
              {d}
            </button>
            {draft.kind === "cycle" && (
              <button
                type="button"
                aria-label={`Remove day ${i + 1}`}
                onClick={() => setDays(days.filter((_, j) => j !== i))}
                className="text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {picking !== null && (
        <div className="mb-2 max-h-48 overflow-y-auto rounded-xl border border-border">
          {splitNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                const next = [...days];
                next[picking] = name;
                setDays(next);
                setPicking(null);
                tapLight();
              }}
              className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left last:border-0 active:bg-surface-2"
            >
              <span className="truncate text-[0.72rem] font-bold">{name}</span>
              {days[picking] === name && <Check className="size-3.5 text-accent-text" />}
            </button>
          ))}
        </div>
      )}

      {draft.kind === "cycle" && (
        <Button className="mb-3 w-full" onClick={() => setDays([...days, REST_DAY])}>
          <Plus className="size-3.5" /> Add a day
        </Button>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!draft.name.trim() || days.length === 0}
          onClick={() =>
            onSave({
              ...draft,
              days,
              // Anchored the day it is saved, so a new cycle starts today
              // rather than being phased by whenever the app was first opened.
              // Local date, not toISOString(): that returns UTC, which stamps
              // tomorrow for an evening save east of Greenwich and shifts every
              // day of the cycle by one.
              anchor: draft.anchor ?? isoDay(new Date()),
            })
          }
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
