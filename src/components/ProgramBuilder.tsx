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
  splitForDate, trainingDaysPerWeek, type Program, type ProgramKind,
} from "@/lib/programs";
import { resolveSplitName } from "@/lib/split-match";
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

/**
 * Ready-made splits, named the way people name them.
 *
 * The letters are the point: "PPLULR" is what this programme is called out
 * loud, so it is what the button says. A seven-letter pattern is stored as a
 * fixed week — every day of it lands on the same weekday every week, which is
 * the only way "Sunday is rest" can be true — while a shorter one is a rolling
 * cycle that ignores the calendar.
 *
 * `days` uses generic labels; they are matched against the user's actual
 * routines when a template is opened, so a template lands on the real
 * "Push B (Hypertrophy & Long Muscle Length)" rather than on a bare word with
 * no exercises behind it.
 */
const TEMPLATES: { name: string; sub: string; kind: ProgramKind; days: string[] }[] = [
  {
    name: "PPL",
    sub: "push · pull · legs, rolling",
    kind: "cycle",
    days: ["Push", "Pull", "Legs"],
  },
  {
    name: "PPL ×2",
    sub: "six on, one off",
    kind: "cycle",
    days: ["Push", "Pull", "Legs", "Push", "Pull", "Legs", REST_DAY],
  },
  {
    name: "PPLULR",
    sub: "push pull legs upper lower rest",
    kind: "cycle",
    days: ["Push", "Pull", "Legs", "Upper", "Lower", REST_DAY],
  },
  {
    name: "PPLRRRR",
    sub: "three on, four off — fixed week",
    kind: "week",
    days: ["Push", "Pull", "Legs", REST_DAY, REST_DAY, REST_DAY, REST_DAY],
  },
  {
    name: "ULULRUR",
    sub: "upper lower ×2, three rests — fixed week",
    kind: "week",
    days: ["Upper", "Lower", "Upper", "Lower", REST_DAY, "Upper", REST_DAY],
  },
  {
    name: "ULR",
    sub: "upper · lower · rest, rolling",
    kind: "cycle",
    days: ["Upper", "Lower", REST_DAY],
  },
  {
    name: "Upper / Lower",
    sub: "four days a week",
    kind: "cycle",
    days: ["Upper", "Lower", REST_DAY, "Upper", "Lower", REST_DAY, REST_DAY],
  },
  {
    name: "Full body ×3",
    kind: "week",
    sub: "Mon · Wed · Fri",
    days: [REST_DAY, "Full body", REST_DAY, "Full body", REST_DAY, "Full body", REST_DAY],
  },
  {
    name: "Bro split",
    sub: "one muscle a day",
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
                setEditing(
                  makeProgram({
                    name: t.name,
                    kind: t.kind,
                    // Matched against the routines this user actually has, so
                    // the template lands on real sessions with exercises in
                    // them rather than on a bare word that loads nothing.
                    days: t.days.map(
                      (d) => resolveSplitName(d, Object.keys(routines ?? {})) ?? d,
                    ),
                  }),
                )
              }
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left active:bg-surface-3"
            >
              <div className="text-[0.75rem] font-bold">{t.name}</div>
              <div className="text-[0.58rem] leading-tight text-muted">{t.sub}</div>
              <div className="mt-0.5 text-[0.6rem] text-faint">
                {t.days.filter((d) => !isRestSplit(d)).length} training ·{" "}
                {t.kind === "week" ? "fixed weekdays" : `${t.days.length}-day cycle`}
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
        "rounded-xl border p-2.5 transition-colors",
        active ? "border-accent bg-accent/10" : "border-border bg-surface-2",
      )}
    >
      <div className="flex items-center gap-2">
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
      {/* The days, on the row itself. "6-day cycle · 5 training days/week" is a
          description of a schedule, not the schedule — and this list was the
          screen where the schedule was supposed to be visible. */}
      <div className="mt-2">
        <WeekPreview draft={program} compact />
      </div>
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

      {/* What the next seven days actually work out to.
          This is the thing the screen was missing: a cycle's rows say "Day 1"
          and "Day 4", which tells you the order and nothing about which day of
          the week you are training. For a week programme it is the same
          information as the rows; for a cycle it is the only place the
          weekdays appear at all. */}
      <WeekPreview draft={draft} />

      <div className="mb-1 text-[0.6rem] font-bold uppercase tracking-wide text-faint">
        {draft.kind === "week" ? "Every week" : "The rotation"}
      </div>
      <div className="mb-2 space-y-1">
        {days.map((d, i) => {
          const weekdayIdx = draft.kind === "week" ? i : null;
          const isTodayRow = weekdayIdx !== null && weekdayIdx === new Date().getDay();
          return (
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
                    : isTodayRow
                      ? "border-accent/50 bg-surface-2"
                      : "border-border bg-surface-2",
                isRestSplit(d) && drag.dragging !== i && "opacity-70",
              )}
              // pan-y so a normal scroll through the list still works. The
              // "none" half only affects the NEXT gesture, not the one in
              // flight — touch-action is latched when a gesture begins, so
              // what actually stops the page scrolling under a held row is the
              // touchmove listener in lib/use-long-press-drag.ts.
              style={{ touchAction: drag.dragging != null ? "none" : "pan-y" }}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-faint" />
              {/* The full weekday, not three letters. This screen is where you
                  answer "what am I doing on Thursday", and "Thu" in a 4rem
                  column next to a truncated split name answered neither half. */}
              <span className="w-[4.6rem] shrink-0 text-[0.62rem] font-bold uppercase leading-tight text-faint">
                {weekdayIdx !== null ? (
                  <>
                    {WEEKDAYS[weekdayIdx]}
                    {isTodayRow && (
                      <span className="block text-[0.5rem] text-accent-text">today</span>
                    )}
                  </>
                ) : (
                  <>
                    Day {i + 1}
                    <span className="block text-[0.5rem] normal-case tracking-normal text-faint/80">
                      {nextWeekdayFor(draft, i)}
                    </span>
                  </>
                )}
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
          );
        })}
      </div>
      <p className="mb-2 text-[0.58rem] leading-snug text-faint">
        Press and hold a row, then drag it onto another day to move that session there.
        Tap the split name to change it.
      </p>

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

/**
 * Which weekday a cycle day next lands on.
 *
 * A rolling cycle deliberately ignores the calendar, which is what makes it a
 * cycle — but "Day 4" is still unanswerable without knowing when Day 4 next
 * comes around. Shown as the next occurrence rather than as a fixed mapping,
 * because for a 6-day cycle there is no fixed mapping: it moves every week.
 */
function nextWeekdayFor(program: Program, index: number): string {
  const len = program.days.length;
  if (program.kind === "week" || !len) return "";
  const anchor = program.anchor ?? isoDay(new Date());
  const [ay, am, ad] = anchor.split("-").map(Number);
  const anchorMs = Date.UTC(ay ?? 1970, (am ?? 1) - 1, ad ?? 1);
  const today = new Date();

  // Position in the cycle is computed the same way splitForDate computes it,
  // rather than by searching for a matching split name — two days of a cycle
  // can carry the same split, and a name search would report whichever came
  // first.
  for (let ahead = 0; ahead < len; ahead++) {
    const d = new Date(today);
    d.setDate(d.getDate() + ahead);
    const diff = Math.round(
      (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - anchorMs) / 86400000,
    );
    if (((diff % len) + len) % len !== index) continue;
    if (ahead === 0) return "today";
    if (ahead === 1) return "tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "short" }).toLowerCase();
  }
  return "";
}

/**
 * The next seven days, as the programme actually resolves them.
 *
 * Both programme kinds get the same strip, so switching between them shows
 * exactly what changed rather than replacing one abstraction with another.
 * Today is marked, because "which of these am I on" is the first question
 * anyone asks of a schedule.
 */
function WeekPreview({ draft, compact }: { draft: Program; compact?: boolean }) {
  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const split = splitForDate(
        { ...draft, anchor: draft.anchor ?? isoDay(today) },
        d,
      );
      return {
        key: isoDay(d),
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        split,
        rest: isRestSplit(split),
        today: i === 0,
      };
    });
  }, [draft]);

  return (
    <div className={compact ? undefined : "mb-3"}>
      {!compact && (
        <div className="mb-1 text-[0.6rem] font-bold uppercase tracking-wide text-faint">
          Next seven days
        </div>
      )}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <div
            key={d.key}
            className={cn(
              "rounded-lg border px-0.5 py-1 text-center",
              d.today ? "border-accent bg-accent/10" : "border-border bg-surface-2",
            )}
          >
            <div className="text-[0.52rem] font-bold uppercase text-faint">{d.label}</div>
            <div
              className={cn(
                "mt-0.5 truncate text-[0.55rem] font-extrabold uppercase",
                d.rest ? "text-faint" : "text-accent-text",
              )}
            >
              {shortSplit(d.split)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Legs B (Posterior Chain & Glute Bias)" will not fit in a seventh of a phone. */
function shortSplit(split: string): string {
  const s = split.toLowerCase();
  if (s.includes("rest")) return "REST";
  if (s.includes("push")) return "PUSH";
  if (s.includes("pull")) return "PULL";
  if (s.includes("leg")) return "LEGS";
  if (s.includes("upper")) return "UPPER";
  if (s.includes("lower")) return "LOWER";
  if (s.includes("full")) return "FULL";
  return (split.split(/[\s(]/)[0] ?? split).slice(0, 5).toUpperCase();
}
