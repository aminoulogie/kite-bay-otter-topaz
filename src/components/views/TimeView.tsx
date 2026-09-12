import { useMemo, useState } from "react";
import { Lock, Plus, RotateCcw, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DayRing } from "@/components/DayRing";
import { DecimalInput } from "@/components/ui/decimal-input";
import { ScreenTimeCard } from "@/components/ScreenTimeCard";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import {
  DAY_HOURS, MIN_BLOCK_HOURS, PALETTE, STEP_HOURS, addBlock, arcs, clockAt, defaultPlan,
  formatHours, normalise, patchBlock, removeBlock, setHours, splitBlock, totalHours,
  type TimeBlock,
} from "@/lib/day-plan";
import { getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The twenty-four hours, and where they went.
 *
 * Every other tab in this app measures something after the fact. This one is
 * the only place that commits ahead of time — and the ring is why it earns a
 * tab rather than a list. A list of durations lets you write down 26 hours
 * without noticing. A ring is full, always, so taking an hour for something
 * visibly takes it FROM something, which is the entire point.
 *
 * Fixed and flexible is the one distinction that matters. Sleep does not
 * negotiate; the evening does. The maths lives in lib/day-plan.ts, where the
 * invariant — the blocks always sum to 24 — is enforced and tested.
 */
export function TimeView() {
  const activeDate = useSoma((s) => s.activeDate);
  const dayPlans = useSoma((s) => s.dayPlans);
  const setDayPlan = useSoma((s) => s.setDayPlan);
  const resetDayPlan = useSoma((s) => s.resetDayPlan);

  const stored = dayPlans[activeDate];
  const blocks = useMemo(() => stored ?? defaultPlan(), [stored]);

  const [editing, setEditing] = useState<TimeBlock | null>(null);
  const [adding, setAdding] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);

  const plan = useMemo(() => normalise(blocks), [blocks]);
  const list = useMemo(() => arcs(plan.blocks), [plan.blocks]);
  const flex = plan.blocks.filter((b) => !b.fixed);
  const freeLeft = totalHours(flex);

  const write = (next: TimeBlock[]) => setDayPlan(activeDate, next);

  const nextColor = () =>
    PALETTE.find((c) => !plan.blocks.some((b) => b.color === c)) ??
    PALETTE[plan.blocks.length % PALETTE.length]!;

  const day = parseLocalDateKey(activeDate);
  const isToday = activeDate === getLocalDateKey(new Date());

  return (
    <div className="space-y-3 pb-4">
      <Card className="overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_14%,transparent),transparent_55%),var(--color-surface)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
              {isToday ? "Today" : day.toLocaleDateString(undefined, { weekday: "long" })}
            </div>
            <h1 className="mt-1 font-display text-xl font-extrabold tracking-tight">
              24 hours
            </h1>
            <p className="mt-1 text-xs text-muted">
              {day.toLocaleDateString(undefined, { day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-2xl font-extrabold tabular">
              {formatHours(freeLeft)}
            </div>
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              flexible
            </div>
          </div>
        </div>

        {plan.over && (
          <p className="mt-3 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-xs font-bold leading-snug text-danger">
            The fixed blocks come to {formatHours(-plan.free + DAY_HOURS)} — more than a day
            exists. Nothing has been trimmed automatically; shorten one yourself.
          </p>
        )}
      </Card>

      <DayRing
        blocks={plan.blocks}
        selectedId={editing?.id ?? null}
        onSelect={(b) => setEditing(b)}
        className="mx-auto max-w-[min(90vw,420px)]"
      />

      <p className="px-1 text-center text-[0.68rem] leading-snug text-faint">
        Drag the ring to bring any hour to the marker. Tap a segment to edit it.
      </p>

      {/* The phone belongs on the tab that asks where the day went, and it is
          measured against the flexible hours rather than the whole 24: sleep
          and work are not time the phone was competing for. */}
      <ScreenTimeCard flexibleHours={freeLeft} />

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle className="mb-0">The day, in order</CardTitle>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold"
          >
            <Plus className="size-3.5" /> Activity
          </button>
        </div>

        <div className="space-y-1.5">
          {list.map((a) => (
            <SwipeRow
              key={a.block.id}
              id={a.block.id}
              openId={swiped}
              setOpenId={setSwiped}
              onDelete={() => {
                const before = plan.blocks;
                write(removeBlock(plan.blocks, a.block.id));
                toast.success(`${a.block.label} removed`, {
                  action: { label: "Undo", onClick: () => write(before) },
                });
              }}
            >
              <button
                type="button"
                onClick={() => setEditing(a.block)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-8 w-1.5 shrink-0 rounded-full",
                    !a.block.fixed && "opacity-55",
                  )}
                  style={{ background: a.block.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold">{a.block.label}</span>
                    {a.block.fixed ? (
                      <Lock className="size-3 shrink-0 text-faint" aria-label="Fixed" />
                    ) : null}
                  </span>
                  <span className="block text-[0.68rem] tabular text-faint">
                    {clockAt(a.startHour)} – {clockAt(a.endHour)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular">
                  {formatHours(a.block.hours)}
                </span>
              </button>
            </SwipeRow>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
          <span className="text-muted">Total</span>
          <span
            className={cn(
              "font-bold tabular",
              totalHours(plan.blocks) === DAY_HOURS ? "text-faint" : "text-danger",
            )}
          >
            {formatHours(totalHours(plan.blocks))} of 24h
          </span>
        </div>
      </Card>

      <button
        type="button"
        onClick={() => {
          const before = plan.blocks;
          resetDayPlan(activeDate);
          toast.success("Back to the default day", {
            action: { label: "Undo", onClick: () => write(before) },
          });
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-muted"
      >
        <RotateCcw className="size-3.5" /> Reset this day
      </button>

      {editing && (
        <BlockSheet
          block={plan.blocks.find((b) => b.id === editing.id) ?? editing}
          maxHours={
            (plan.blocks.find((b) => b.id === editing.id)?.fixed ?? false)
              ? DAY_HOURS - totalHours(plan.blocks.filter((b) => b.fixed && b.id !== editing.id))
              : freeLeft
          }
          onClose={() => setEditing(null)}
          onChange={(patch) => write(patchBlock(plan.blocks, editing.id, patch))}
          onHours={(h) => write(setHours(plan.blocks, editing.id, h))}
          onSplit={(label, hours) =>
            write(splitBlock(plan.blocks, editing.id, label, hours, nextColor()))
          }
          onDelete={() => {
            write(removeBlock(plan.blocks, editing.id));
            setEditing(null);
          }}
        />
      )}

      {adding && (
        <AddSheet
          free={freeLeft}
          color={nextColor()}
          onClose={() => setAdding(false)}
          onAdd={(label, hours, fixed, color) => {
            write(addBlock(plan.blocks, { label, hours, color, fixed }));
            setAdding(false);
            toast.success(`${label} added`);
          }}
        />
      )}
    </div>
  );
}

/** A bottom sheet, the shape the rest of the app uses for editing one thing. */
function Sheet({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BlockSheet({
  block, maxHours, onClose, onChange, onHours, onSplit, onDelete,
}: {
  block: TimeBlock;
  maxHours: number;
  onClose: () => void;
  onChange: (patch: Partial<Omit<TimeBlock, "id">>) => void;
  onHours: (hours: number) => void;
  onSplit: (label: string, hours: number) => void;
  onDelete: () => void;
}) {
  const [splitName, setSplitName] = useState("");
  const [splitHours, setSplitHours] = useState(1);
  const canSplit = !block.fixed && block.hours >= MIN_BLOCK_HOURS * 2;

  return (
    <Sheet title={block.label} onClose={onClose}>
      <label className="mb-3 block">
        <span className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
          Name
        </span>
        <Input
          value={block.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-11"
        />
      </label>

      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
          Hours
        </span>
        <span className="text-sm font-bold tabular">{formatHours(block.hours)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(block.hours, maxHours)}
        step={STEP_HOURS}
        value={block.hours}
        onChange={(e) => onHours(Number(e.target.value))}
        aria-label={`Hours for ${block.label}`}
        className="mb-1 w-full accent-[var(--color-accent)]"
      />
      <p className="mb-3 text-[0.65rem] leading-snug text-faint">
        {block.fixed
          ? "Fixed: these hours come out of flexible time and stay put when anything else changes."
          : "Flexible: this shares whatever the fixed blocks leave. Growing it takes from the other flexible blocks."}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            onClick={() => onChange({ color: c })}
            className={cn(
              "size-8 rounded-lg border-2",
              block.color === c ? "border-fg" : "border-transparent",
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange({ fixed: !block.fixed })}
        className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
      >
        {block.fixed ? <Lock className="size-4 text-faint" /> : <Unlock className="size-4 text-faint" />}
        <span className="text-sm font-bold">
          {block.fixed ? "Pinned to these hours" : "Flexes with the day"}
          <span className="block text-[0.65rem] font-normal text-faint">
            {block.fixed ? "Tap to let it flex" : "Tap to pin it"}
          </span>
        </span>
      </button>

      {canSplit && (
        <div className="mb-3 rounded-xl border border-border bg-surface-2 p-3">
          <div className="mb-2 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Split this block
          </div>
          <div className="flex gap-1.5">
            <Input
              value={splitName}
              onChange={(e) => setSplitName(e.target.value)}
              placeholder="New activity"
              className="h-10 flex-1"
            />
            <DecimalInput
              aria-label="Hours to take"
              value={splitHours}
              onValueChange={(n) => setSplitHours(n ?? 0)}
              className="h-10 w-16 text-center"
            />
          </div>
          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={!splitName.trim() || splitHours < MIN_BLOCK_HOURS}
            onClick={() => {
              onSplit(splitName.trim(), splitHours);
              setSplitName("");
            }}
          >
            Take {formatHours(splitHours)} out of {block.label}
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          onDelete();
          toast.success(`${block.label} removed`);
        }}
        className="w-full rounded-xl border border-danger/50 py-2.5 text-xs font-bold text-danger"
      >
        Remove {block.label}
      </button>
    </Sheet>
  );
}

function AddSheet({
  free, color, onClose, onAdd,
}: {
  free: number;
  color: string;
  onClose: () => void;
  onAdd: (label: string, hours: number, fixed: boolean, color: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(1);
  const [fixed, setFixed] = useState(true);

  const tooMuch = fixed && hours > free;

  return (
    <Sheet title="New activity" onClose={onClose}>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Gym, study, commute…"
        className="mb-3 h-11"
        autoFocus
      />

      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">Hours</span>
        <span className="text-sm font-bold tabular">{formatHours(hours)}</span>
      </div>
      <input
        type="range"
        min={STEP_HOURS}
        max={Math.max(STEP_HOURS, free)}
        step={STEP_HOURS}
        value={Math.min(hours, Math.max(STEP_HOURS, free))}
        onChange={(e) => setHours(Number(e.target.value))}
        aria-label="Hours"
        className="mb-3 w-full accent-[var(--color-accent)]"
      />

      <div className="mb-3 grid grid-cols-2 gap-2">
        {([
          [true, "Fixed", "Holds its hours"],
          [false, "Flexible", "Shares what is left"],
        ] as const).map(([v, title, sub]) => (
          <button
            key={title}
            type="button"
            onClick={() => setFixed(v)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left",
              fixed === v ? "border-accent bg-accent/10" : "border-border bg-surface-2",
            )}
          >
            <span className="block text-sm font-bold">{title}</span>
            <span className="block text-[0.62rem] text-faint">{sub}</span>
          </button>
        ))}
      </div>

      {tooMuch && (
        <p className="mb-2 text-[0.68rem] leading-snug text-warn">
          Only {formatHours(free)} of flexible time left. A fixed block bigger than that
          would need hours taken from something already pinned.
        </p>
      )}

      <Button
        variant="primary"
        className="w-full"
        disabled={!label.trim() || tooMuch || free < MIN_BLOCK_HOURS}
        onClick={() => onAdd(label.trim(), hours, fixed, color)}
      >
        {free < MIN_BLOCK_HOURS ? "The day is full" : `Add ${formatHours(hours)}`}
      </Button>
    </Sheet>
  );
}
