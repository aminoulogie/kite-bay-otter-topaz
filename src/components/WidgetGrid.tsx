import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Children, createContext, isValidElement, useContext, useMemo, useState } from "react";
import {
  SIZE_SPECS, hidden as hiddenOf, isDefault, isTile, move, reconcile, resize, specFor,
  toggleHidden, visible, widgetDef, type WidgetSize,
} from "@/lib/dashboard-layout";
import { useSoma } from "@/lib/store";
import { useLongPressDrag } from "@/lib/use-long-press-drag";
import { cn } from "@/lib/utils";

/**
 * The Home page, arranged by whoever is holding the phone.
 *
 * Two columns, because a phone is not wide enough for three and one is just
 * the stack this replaced. A widget is half a row or the whole of it.
 *
 * Editing is a MODE rather than a set of always-on handles. Every widget here
 * is also a button — the tiles jump to Nutrition, the to-do list ticks things
 * off — so a drag handle permanently attached to each one would be four extra
 * targets on every card, next to the target you actually want. In edit mode
 * the widgets stop being buttons and start being furniture, which is the only
 * way both can have the whole card as their hit area.
 *
 * Reordering reuses the long-press drag hook rather than a fresh
 * implementation: it already solves the part that is genuinely hard, which is
 * that iOS fires no drag events for touch and starts scrolling out from under
 * a held card unless a non-passive touchmove listener stops it.
 */
/**
 * The size the widget being rendered was given.
 *
 * Published so a card CAN answer the question — the macro tiles drop their
 * label at small, the score card drops its breakdown — without every card
 * being forced to. One that ignores it is simply clipped by its box, which is
 * a reasonable default and much better than sixty cards each needing three
 * hand-written variants before any of them could be resized at all.
 */
const SizeContext = createContext<WidgetSize>("2x4");

export function useWidgetSize(): WidgetSize {
  return useContext(SizeContext);
}

/**
 * Four columns on a phone, eight on a desktop.
 *
 * Two columns could not express a quarter, so a widget was half a row or the
 * whole of it and nothing else. Four is the home screen's own grid and the
 * smallest number that makes 1x1, 1x2 and 1x4 all mean something different.
 * The desktop doubles it so the same stored size stays roughly half the width
 * it is on a phone, rather than one card stretched across a monitor.
 */
const COL: Record<1 | 2 | 4, string> = {
  1: "col-span-1 lg:col-span-2",
  2: "col-span-2 lg:col-span-4",
  4: "col-span-4 lg:col-span-8",
};

/**
 * A height unit is about one phone column, so 1x1 comes out square.
 *
 * Fixed for a tile and a floor for a full-width card — see the note on
 * WidgetSize for why a 3x4 Routines editor must be allowed to grow past its
 * own size and a 1x1 must not.
 */
const ROW: Record<1 | 2 | 3, { tile: string; wide: string }> = {
  1: { tile: "h-[5.25rem]", wide: "min-h-[5.25rem]" },
  2: { tile: "h-[11rem]", wide: "min-h-[11rem]" },
  3: { tile: "h-[17rem]", wide: "min-h-[17rem]" },
};

function boxFor(size: WidgetSize): string {
  const spec = specFor(size);
  const h = ROW[spec.h];
  return cn(COL[spec.w], isTile(size) ? h.tile : h.wide);
}

/** The shape, drawn to scale, for the picker. */
function SizeGlyph({ size, on }: { size: WidgetSize; on: boolean }) {
  const spec = specFor(size);
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-[3px] border",
        on ? "border-accent-ink bg-accent-ink" : "border-fg/55",
      )}
      style={{ width: spec.w * 7, height: spec.h * 7 }}
    />
  );
}

export function WidgetGrid({
  tab, children, innerRef,
}: {
  tab: string;
  children: React.ReactNode;
  /**
   * A handle on the outer box, for a caller that needs one.
   *
   * Train fires its confetti INSIDE the page's own element, so converting that
   * page to a grid would otherwise have dropped the ref — and the celebration
   * on saving a session would have silently stopped happening, with nothing
   * failing to say so.
   */
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const layouts = useSoma((s) => s.layouts);
  const setLayout = useSoma((s) => s.setLayout);
  const resetLayout = useSoma((s) => s.resetLayout);
  const editing = useSoma((s) => s.editingDashboard);
  const setEditing = useSoma((s) => s.setEditingDashboard);

  /**
   * A child with an explicit KEY is a widget; anything else is page furniture.
   *
   * That is what keeps converting a page to this cheap — a view adds a key per
   * section and wraps its return, rather than being turned inside out into a
   * lookup table. And it gives the sheets, dialogs and footnotes a home: they
   * are not cards, they must not be reorderable, and dropping them on the floor
   * because they had no key would quietly break every editor on the page.
   *
   * React.Children.toArray marks the difference for us: an explicit key comes
   * back prefixed ".$", a positional one as "." plus its index.
   */
  const { nodes, extras } = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    const rest: React.ReactNode[] = [];
    for (const child of Children.toArray(children)) {
      const key = isValidElement(child) ? String(child.key ?? "") : "";
      const id = key.startsWith(".$") ? key.slice(2) : "";
      if (id) map[id] = child;
      else rest.push(child);
    }
    return { nodes: map, extras: rest };
  }, [children]);

  const layout = useMemo(() => reconcile(layouts[tab], tab), [layouts, tab]);
  const setDashboard = (next: typeof layout) => setLayout(tab, next);
  const resetDashboard = () => resetLayout(tab);

  /** Which widget's size picker is open, if any. */
  const [picking, setPicking] = useState<string | null>(null);

  const shown = visible(layout);
  const off = hiddenOf(layout);

  // The drag works on the VISIBLE list, so dropping onto position three means
  // the third card you can see. Translating back through the full layout is
  // what keeps a hidden widget from silently swallowing a drop.
  const drag = useLongPressDrag(shown.length, (from, to) => {
    const id = shown[from]?.id;
    const anchor = shown[to]?.id;
    if (!id || !anchor) return;
    setDashboard(move(layout, id, layout.findIndex((p) => p.id === anchor)));
  });

  return (
    <div ref={innerRef} className="pb-4">
      {editing && (
        <div className="mb-3 rounded-2xl border border-accent-line bg-accent-soft px-3 py-2.5">
          <p className="text-xs font-bold leading-snug">
            Hold a widget to pick it up, drag to move it.
          </p>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-muted">
            Every card takes six sizes, rows by columns out of four — 1x1 up to 3x4. Tap
            the shape on a card to change it, or the eye to take it off the page. Nothing
            here is deleted: hidden widgets wait at the bottom.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => setEditing(false)}>
              Done
            </Button>
            {!isDefault(layout, tab) && (
              <Button onClick={resetDashboard} aria-label="Reset the layout">
                <RotateCcw className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Two columns on a phone, four on a desktop — and the SAME stored span
          means "half" and "full" on the phone but "quarter" and "half" on the
          desktop. A wide screen should hold two cards side by side, not one
          card stretched to two thousand pixels, and this gets that without the
          layout being stored twice. */}
      <div
        className={cn(
          "grid grid-cols-4 items-start gap-2 lg:grid-cols-8 lg:gap-3",
          editing && "select-none",
        )}
      >
        {shown.map((p, i) => {
          const def = widgetDef(tab, p.id);
          const node = nodes[p.id];
          if (!node) return null;
          const held = drag.dragging === i;
          const target = drag.over === i && drag.dragging !== null && !held;

          return (
            <div
              key={p.id}
              data-drag-index={i}
              className={cn(
                // A flex column, so the card inside stretches to the box the
                // size asked for. A percentage height cannot do it: `min-h` is
                // not a definite height, so `h-full` under one silently
                // collapses back to the content's own height — which is what
                // left short cards floating in a taller cell.
                "flex min-w-0 flex-col transition-all",
                // A widget that has nothing to show right now still needs to be
                // a target: the review queue renders null when no word is due,
                // and a zero-height cell cannot be dragged onto or tapped.
                editing && "min-h-16",
                boxFor(p.size),
                held && "scale-[0.97] opacity-60",
                target && "ring-2 ring-accent ring-offset-2 ring-offset-bg rounded-3xl",
              )}
              {...(editing ? drag.handlers(i) : {})}
            >
              <div className={cn("relative flex min-h-0 flex-1 flex-col", editing && "rounded-3xl")}>
                {/* The widget still draws itself, but stops answering taps: in
                    edit mode the card is a thing you move, not a thing you
                    press. */}
                <SizeContext.Provider value={p.size}>
                  <div
                    className={cn(
                      "soma-widget-box",
                      editing && "pointer-events-none opacity-45",
                      // Small is a square you glance at, so it gets a hard box
                      // and a fade where the content runs out. Large is a panel
                      // you work in, so it gets a floor rather than a ceiling —
                      // a card told to be large and given nothing to fill it
                      // should still LOOK large.
                      // A tile is a glance and gets a hard box with a fade
                      // where its content runs out; a full-width card keeps
                      // its natural height and only gains a floor.
                      isTile(p.size) && "soma-widget-tile",
                      specFor(p.size).w === 1 && "soma-tile-1",
                    )}
                  >
                    {node}
                  </div>
                </SizeContext.Provider>

                {/* No grip glyph: the whole card is the handle, so an icon in
                    one corner would both cover the widget's title and imply you
                    have to grab it there. The dashed border says it moves. */}
                {editing && (
                  <>
                    <div className="pointer-events-none absolute inset-0 rounded-3xl border-2 border-dashed border-accent-line" />
                    {/* One button that opens a picker, not six buttons in a
                        row. Six inline controls are wider than a 1x1 tile, so
                        the control would not fit on exactly the widget that
                        most needs it — and the shapes need labels to be
                        readable at this size, which a row cannot carry. */}
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPicking(p.id)}
                        className="flex h-7 items-center gap-1 rounded-full border border-border bg-surface-3 px-2 text-[0.6rem] font-bold tabular text-fg shadow-lg"
                        aria-label={`Size of ${def?.label ?? p.id}, currently ${p.size}`}
                      >
                        <SizeGlyph size={p.size} on={false} />
                        {p.size}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDashboard(toggleHidden(layout, p.id))}
                        className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-3 text-fg shadow-lg"
                        aria-label={`Hide ${def?.label ?? p.id}`}
                      >
                        <EyeOff className="size-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && off.length > 0 && (
        <div className="mt-4">
          <h2 className="px-1 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
            Off the page
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {off.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDashboard(toggleHidden(layout, p.id))}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold text-muted"
                aria-label={`Show ${widgetDef(tab, p.id)?.label ?? p.id}`}
              >
                <Eye className="size-3.5" />
                {widgetDef(tab, p.id)?.label ?? p.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {picking && (
        <SizeSheet
          label={widgetDef(tab, picking)?.label ?? picking}
          current={layout.find((x) => x.id === picking)?.size ?? "2x4"}
          onPick={(sz) => setDashboard(resize(layout, picking, sz, tab))}
          onClose={() => setPicking(null)}
        />
      )}

      {extras}

      {editing && shown.length === 0 && (
        <p className="py-10 text-center text-sm text-faint">
          Every widget is off the page. Tap one below to bring it back.
        </p>
      )}
    </div>
  );
}

/**
 * The size picker.
 *
 * A sheet rather than a row of six on the card, because six controls are
 * wider than a 1x1 tile and the shapes need their names to be readable at
 * that scale. The shapes are drawn to scale against each other so the
 * difference between 1x4 and 2x4 is visible before you commit to it —
 * which is the whole job of a picker.
 */
function SizeSheet({
  label, current, onPick, onClose,
}: {
  label: string;
  current: WidgetSize;
  onPick: (size: WidgetSize) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={`Size of ${label}`}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 font-display text-base font-extrabold">Size</div>
        <p className="mb-3 text-[0.68rem] leading-snug text-faint">
          {label} — rows by columns, out of four. A narrow size is a fixed tile and
          anything past its edge fades out; a full-width one can grow taller than it
          says, so a card with controls in it stays usable.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {SIZE_SPECS.map((spec) => {
            const on = spec.id === current;
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => {
                  onPick(spec.id);
                  onClose();
                }}
                aria-pressed={on}
                className={cn(
                  "flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border",
                  on ? "border-accent bg-accent/10" : "border-border bg-surface-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "block rounded-[4px] border-2",
                    on ? "border-accent bg-accent/40" : "border-fg/45",
                  )}
                  style={{ width: spec.w * 11, height: spec.h * 11 }}
                />
                <span
                  className={cn(
                    "text-[0.7rem] font-bold tabular",
                    on ? "text-accent-text" : "text-muted",
                  )}
                >
                  {spec.id}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
