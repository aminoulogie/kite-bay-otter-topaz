import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CornerDownRight, Minus, Plus, Target, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput, parseDecimal } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SwipeRow } from "@/components/SwipeRow";
import { Sized, WidgetGrid } from "@/components/WidgetGrid";
import {
  GOAL_COLORS, HORIZONS, carryOver, childrenOf, daysLeftIn, goalProgress, logProgress,
  parentsFor, periodLabel, periodOf, shiftPeriod, summarisePeriod, type Goal, type Horizon,
} from "@/lib/life-goals";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Goals for the week, the month and the year.
 *
 * Beside Projects rather than inside it: a project is a thing with steps and
 * a finish line; a goal is one result to have by the end of a stretch of time.
 * The period is the deadline — this week's goals are due on Sunday without a
 * date being typed — and each horizon has its own card, so the week's three
 * things are never buried under the year's.
 *
 * The rules live in lib/life-goals.ts.
 */
export function GoalsView() {
  const goals = useSoma((s) => s.goals);
  const now = new Date();

  const summaries = HORIZONS.map((h) => ({
    ...h,
    s: summarisePeriod(goals, h.id, periodOf(h.id, now)),
  }));

  return (
    <WidgetGrid tab="projects-goals">
      <Sized
        key="header"
        glance={{
          label: "Goals",
          icon: Target,
          value: String(summaries.reduce((a, x) => a + x.s.done, 0)),
          unit: `of ${summaries.reduce((a, x) => a + x.s.total, 0)} done`,
          stats: summaries.map((x) => ({ label: x.noun, value: `${x.s.done}/${x.s.total}` })),
          empty: "Set a goal for this week",
        }}
      >
        <Card>
          <CardTitle>
            <span className="flex items-center gap-1.5">
              <Target className="size-4 text-accent" />
              Goals
            </span>
          </CardTitle>
          <div className="grid grid-cols-3 gap-2">
            {summaries.map((x) => (
              <div key={x.id} className="rounded-xl border border-border bg-surface-2 p-2.5">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">{x.label}</div>
                <div className="mt-0.5 font-display text-lg font-extrabold tabular">
                  {x.s.done}
                  <span className="text-xs font-bold text-faint">/{x.s.total}</span>
                </div>
                <Progress className="mt-1.5 h-1.5" value={x.s.progress * 100} />
              </div>
            ))}
          </div>
        </Card>
      </Sized>

      {HORIZONS.map((h) => (
        <HorizonCard key={h.id} horizon={h.id} />
      ))}
    </WidgetGrid>
  );
}

function HorizonCard({ horizon }: { horizon: Horizon }) {
  const goals = useSoma((s) => s.goals);
  const addGoal = useSoma((s) => s.addGoal);
  const patchGoal = useSoma((s) => s.patchGoal);
  const removeGoal = useSoma((s) => s.removeGoal);
  const restoreGoal = useSoma((s) => s.restoreGoal);

  const current = periodOf(horizon);
  const [period, setPeriod] = useState(current);
  const [title, setTitle] = useState("");
  const [counted, setCounted] = useState(false);
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [swiped, setSwiped] = useState<string | null>(null);
  const [editing, setEditing] = useState<Goal | null>(null);

  const meta = HORIZONS.find((x) => x.id === horizon)!;
  const list = useMemo(
    () => goals.filter((g) => g.horizon === horizon && g.period === period).sort((a, b) => Number(a.done) - Number(b.done)),
    [goals, horizon, period],
  );
  const summary = summarisePeriod(goals, horizon, period);
  const isCurrent = period === current;
  const past = period < current;
  const left = daysLeftIn(horizon, period);

  // What a goal here can serve: this period's goals one or two horizons up.
  const parents = useMemo(
    () => goals.filter((g) => parentsFor(horizon).includes(g.horizon) && g.period === periodOf(g.horizon)),
    [goals, horizon],
  );

  const nextColor = () => GOAL_COLORS[goals.length % GOAL_COLORS.length]!;

  const add = () => {
    const text = title.trim();
    if (!text) return;
    const t = counted ? parseDecimal(target) : null;
    addGoal({
      title: text,
      horizon,
      period,
      target: t && t > 0 ? t : undefined,
      progress: t && t > 0 ? 0 : undefined,
      unit: t && t > 0 && unit.trim() ? unit.trim() : undefined,
      parentId: parentId || undefined,
      color: nextColor(),
    });
    setTitle("");
    setTarget("");
    setUnit("");
    tapLight();
  };

  const toggle = (g: Goal) => {
    if (!g.done) tapSuccess();
    patchGoal(g.id, { done: !g.done, doneAt: g.done ? undefined : Date.now() });
  };

  const bump = (g: Goal, by: number) => {
    const next = logProgress(g, by);
    if (next.done && !g.done) tapSuccess();
    else tapLight();
    patchGoal(g.id, { progress: next.progress, done: next.done, doneAt: next.doneAt });
  };

  return (
    <Sized
      glance={{
        label: meta.label,
        short: meta.noun,
        value: summary.total ? `${summary.done}/${summary.total}` : null,
        progress: summary.total ? summary.progress : null,
        lines: list.map((g) => ({ text: g.title, color: g.color, done: g.done })),
        empty: `No goals this ${meta.noun}`,
        emptyShort: "None",
      }}
    >
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle className="mb-0">{isCurrent ? meta.label : periodLabel(horizon, period)}</CardTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Previous ${meta.noun}`}
              onClick={() => setPeriod(shiftPeriod(horizon, period, -1))}
              className="grid size-8 place-items-center rounded-full border border-border bg-surface-2"
            >
              <ChevronLeft className="size-4" />
            </button>
            {!isCurrent && (
              <button
                type="button"
                onClick={() => setPeriod(current)}
                className="h-8 rounded-full border border-border bg-surface-2 px-2.5 text-[0.65rem] font-bold"
              >
                Now
              </button>
            )}
            <button
              type="button"
              aria-label={`Next ${meta.noun}`}
              onClick={() => setPeriod(shiftPeriod(horizon, period, 1))}
              className="grid size-8 place-items-center rounded-full border border-border bg-surface-2"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="mb-1 flex items-baseline justify-between text-[0.68rem] font-semibold text-faint">
          <span>{isCurrent ? periodLabel(horizon, period) : past ? "Over" : "Coming up"}</span>
          <span className="tabular">
            {summary.done}/{summary.total} done
            {isCurrent && ` · ${left} ${left === 1 ? "day" : "days"} left`}
          </span>
        </div>
        <Progress className="mb-3 h-1.5" value={summary.progress * 100} />

        <div className="space-y-1.5">
          {list.length === 0 && (
            <p className="text-[0.72rem] leading-snug text-faint">
              {past
                ? `Nothing was set for this ${meta.noun}.`
                : horizon === "week"
                  ? "Two or three things to have done by Sunday. Fewer than you think."
                  : horizon === "month"
                    ? "What this month should leave behind."
                    : "The few things this year is for."}
            </p>
          )}
          {list.map((g) => {
            const kids = childrenOf(goals, g.id);
            const parent = g.parentId ? goals.find((x) => x.id === g.parentId) : undefined;
            return (
              <SwipeRow
                key={g.id}
                id={g.id}
                openId={swiped}
                setOpenId={setSwiped}
                onEdit={() => setEditing(g)}
                onDelete={() => {
                  const idx = goals.findIndex((x) => x.id === g.id);
                  removeGoal(g.id);
                  toast.success(`${g.title} removed`, { action: { label: "Undo", onClick: () => restoreGoal(idx, g) } });
                }}
              >
                <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  {g.target ? (
                    <span className="relative grid size-6 shrink-0 place-items-center" aria-hidden>
                      <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
                        <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--color-surface-3)" strokeWidth="3" />
                        <circle
                          cx="12"
                          cy="12"
                          r="9.5"
                          fill="none"
                          stroke={g.color}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${goalProgress(g) * 59.7} 59.7`}
                        />
                      </svg>
                      {g.done && <Check className="size-3" style={{ color: g.color }} strokeWidth={3.5} />}
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={g.done ? "Mark not done" : "Mark done"}
                      onClick={() => toggle(g)}
                      className="grid size-6 shrink-0 place-items-center rounded-full border-2"
                      style={{ borderColor: g.color, background: g.done ? g.color : "transparent" }}
                    >
                      {g.done && <Check className="size-3.5 text-black" strokeWidth={3.5} />}
                    </button>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-bold", g.done && "text-faint line-through")}>
                      {g.title}
                    </span>
                    {(g.target || parent || kids.length > 0 || g.from) && (
                      <span className="flex flex-wrap items-center gap-x-2 text-[0.64rem] font-semibold text-faint">
                        {g.target ? (
                          <span className="tabular" style={{ color: g.color }}>
                            {g.progress ?? 0} / {g.target}
                            {g.unit ? ` ${g.unit}` : ""}
                          </span>
                        ) : null}
                        {parent && (
                          <span className="flex items-center gap-0.5">
                            <CornerDownRight className="size-3" /> {parent.title}
                          </span>
                        )}
                        {kids.length > 0 && (
                          <span>
                            {kids.filter((k) => k.done).length}/{kids.length} smaller goals done
                          </span>
                        )}
                        {g.from && <span>carried over</span>}
                      </span>
                    )}
                  </span>
                  {g.target && !past ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label="Less"
                        onClick={() => bump(g, -1)}
                        className="grid size-8 place-items-center rounded-full bg-surface-3"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="More"
                        onClick={() => bump(g, 1)}
                        className="grid size-8 place-items-center rounded-full"
                        style={{ background: g.color, color: "#0b0d12" }}
                      >
                        <Plus className="size-3.5" strokeWidth={3} />
                      </button>
                    </span>
                  ) : null}
                  {past && !g.done && (
                    <button
                      type="button"
                      onClick={() => {
                        patchGoal(g.id, carryOver(g));
                        toast.success(`${g.title} carried into this ${meta.noun}`);
                      }}
                      className="shrink-0 rounded-full border border-border bg-surface-3 px-2.5 py-1 text-[0.62rem] font-bold"
                    >
                      Carry over
                    </button>
                  )}
                </div>
              </SwipeRow>
            );
          })}
        </div>

        {!past && (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <div className="flex gap-1.5">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder={
                  horizon === "week" ? "Run 20 km, finish chapter 3…" : horizon === "month" ? "Read two books…" : "Bench 100 kg…"
                }
                className="h-10 flex-1"
              />
              <Button variant="primary" disabled={!title.trim()} onClick={add} aria-label={`Add a goal for this ${meta.noun}`}>
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCounted((c) => !c)}
                className={cn(
                  "h-8 rounded-full px-3 text-[0.68rem] font-bold",
                  counted ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
                )}
              >
                {counted ? "Counted" : "Done / not done"}
              </button>
              {counted && (
                <>
                  <DecimalInput
                    value={target}
                    onValueChange={(_, raw) => setTarget(raw)}
                    placeholder="Target"
                    aria-label="Target"
                    className="h-8 w-20 text-center text-xs"
                  />
                  <Input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="km, books…"
                    className="h-8 w-24 text-xs"
                  />
                </>
              )}
              {parents.length > 0 && (
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  aria-label="Serves a bigger goal"
                  className="h-8 max-w-[11rem] truncate rounded-full border border-border bg-surface-2 px-2.5 text-[0.68rem] font-bold text-muted"
                >
                  <option value="">Serves… (optional)</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.horizon === "year" ? "Year" : "Month"}: {p.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <EditGoalSheet
          goal={goals.find((x) => x.id === editing.id) ?? editing}
          parents={parents.filter((p) => p.id !== editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </Sized>
  );
}

function EditGoalSheet({ goal, parents, onClose }: { goal: Goal; parents: Goal[]; onClose: () => void }) {
  const patchGoal = useSoma((s) => s.patchGoal);
  const [title, setTitle] = useState(goal.title);
  const [target, setTarget] = useState(goal.target ? String(goal.target) : "");
  const [unit, setUnit] = useState(goal.unit ?? "");
  const [parentId, setParentId] = useState(goal.parentId ?? "");
  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="soma-expand rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,var(--safe-bottom,env(safe-area-inset-bottom)))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-base font-extrabold">Edit goal</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mb-2 h-11" />
        <div className="mb-2 flex gap-2">
          <DecimalInput
            value={target}
            onValueChange={(_, raw) => setTarget(raw)}
            placeholder="Target (optional)"
            aria-label="Target"
            className="h-11 flex-1"
          />
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className="h-11 w-28" />
        </div>
        {parents.length > 0 && (
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            aria-label="Serves a bigger goal"
            className="mb-3 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm"
          >
            <option value="">Serves no bigger goal</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.horizon === "year" ? "Year" : "Month"}: {p.title}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="primary"
          className="w-full"
          disabled={!title.trim()}
          onClick={() => {
            const t = parseDecimal(target);
            const counted = !!t && t > 0;
            patchGoal(goal.id, {
              title: title.trim(),
              target: counted ? t! : undefined,
              progress: counted ? (goal.progress ?? 0) : undefined,
              unit: counted && unit.trim() ? unit.trim() : undefined,
              parentId: parentId || undefined,
              done: counted ? (goal.progress ?? 0) >= t! : goal.done,
            });
            onClose();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
