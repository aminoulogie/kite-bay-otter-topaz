import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Children, createContext, isValidElement, useContext, useMemo } from "react";
import {
  SIZES, hidden as hiddenOf, isDefault, move, reconcile, resize, toggleHidden, visible,
  widgetDef, type WidgetSize,
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
const SizeContext = createContext<WidgetSize>("medium");

export function useWidgetSize(): WidgetSize {
  return useContext(SizeContext);
}

/** The boxes the three sizes draw, in the grid's own two columns. */
const SIZE_CLASS: Record<WidgetSize, string> = {
  // A square, like the home screen's. Anything that does not fit is clipped
  // behind a fade rather than allowed to push the row out of shape.
  small: "col-span-1 [&>*]:max-h-full",
  medium: "col-span-2",
  large: "col-span-2",
};

const SIZE_LABEL: Record<WidgetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** The glyph in the size picker: a filled box at the shape of each size. */
function SizeGlyph({ size, on }: { size: WidgetSize; on: boolean }) {
  const box =
    size === "small" ? "h-2.5 w-2.5" : size === "medium" ? "h-2 w-4" : "h-3.5 w-4";
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-[3px] border",
        box,
        on ? "border-accent-ink bg-accent-ink" : "border-fg/60",
      )}
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
            Every card takes three sizes — small, medium, large. Pick one from the row on
            the card, or the eye to take it off the page. Nothing here is deleted —
            hidden widgets wait at the bottom.
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
          "grid grid-cols-2 items-start gap-2 lg:grid-cols-4 lg:gap-3",
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
                "min-w-0 transition-all",
                // A widget that has nothing to show right now still needs to be
                // a target: the review queue renders null when no word is due,
                // and a zero-height cell cannot be dragged onto or tapped.
                editing && "min-h-16",
                SIZE_CLASS[p.size],
                held && "scale-[0.97] opacity-60",
                target && "ring-2 ring-accent ring-offset-2 ring-offset-bg rounded-3xl",
              )}
              {...(editing ? drag.handlers(i) : {})}
            >
              <div className={cn("relative", editing && "rounded-3xl")}>
                {/* The widget still draws itself, but stops answering taps: in
                    edit mode the card is a thing you move, not a thing you
                    press. */}
                <SizeContext.Provider value={p.size}>
                  <div
                    className={cn(
                      editing && "pointer-events-none opacity-45",
                      // Small is a square you glance at, so it gets a hard box
                      // and a fade where the content runs out. Large is a panel
                      // you work in, so it gets a floor rather than a ceiling —
                      // a card told to be large and given nothing to fill it
                      // should still LOOK large.
                      p.size === "small" && "soma-widget-small",
                      p.size === "large" && "min-h-72",
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
                    {/* Three sizes shown at once rather than one button that
                        cycles. A cycling control hides what the options ARE
                        and makes the third one three taps away; the home
                        screen shows all of them side by side for the same
                        reason. */}
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                      <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface-3 p-0.5 shadow-lg">
                        {SIZES.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setDashboard(resize(layout, p.id, sz, tab))}
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full transition-colors",
                              p.size === sz ? "bg-accent" : "active:bg-surface-2",
                            )}
                            aria-label={`${SIZE_LABEL[sz]} ${def?.label ?? p.id}`}
                            aria-pressed={p.size === sz}
                          >
                            <SizeGlyph size={sz} on={p.size === sz} />
                          </button>
                        ))}
                      </div>
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

      {extras}

      {editing && shown.length === 0 && (
        <p className="py-10 text-center text-sm text-faint">
          Every widget is off the page. Tap one below to bring it back.
        </p>
      )}
    </div>
  );
}
