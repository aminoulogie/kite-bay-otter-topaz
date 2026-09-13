import { Eye, EyeOff, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  hidden as hiddenOf, isDefault, move, toggleHidden, toggleSpan, visible, widgetDef,
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
export function WidgetGrid({ nodes }: { nodes: Record<string, React.ReactNode> }) {
  const layout = useSoma((s) => s.dashboard);
  const setDashboard = useSoma((s) => s.setDashboard);
  const resetDashboard = useSoma((s) => s.resetDashboard);
  const editing = useSoma((s) => s.editingDashboard);
  const setEditing = useSoma((s) => s.setEditingDashboard);

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
    <div className="pb-4">
      {editing && (
        <div className="mb-3 rounded-2xl border border-accent-line bg-accent-soft px-3 py-2.5">
          <p className="text-xs font-bold leading-snug">
            Hold a widget to pick it up, drag to move it.
          </p>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-muted">
            Tap the arrows to make one half or full width, the eye to take it off the
            page. Nothing here is deleted — hidden widgets wait at the bottom.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => setEditing(false)}>
              Done
            </Button>
            {!isDefault(layout) && (
              <Button onClick={resetDashboard} aria-label="Reset the layout">
                <RotateCcw className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={cn("grid grid-cols-2 items-start gap-2", editing && "select-none")}>
        {shown.map((p, i) => {
          const def = widgetDef(p.id);
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
                p.span === 2 ? "col-span-2" : "col-span-1",
                held && "scale-[0.97] opacity-60",
                target && "ring-2 ring-accent ring-offset-2 ring-offset-bg rounded-3xl",
              )}
              {...(editing ? drag.handlers(i) : {})}
            >
              <div className={cn("relative", editing && "rounded-3xl")}>
                {/* The widget still draws itself, but stops answering taps: in
                    edit mode the card is a thing you move, not a thing you
                    press. */}
                <div className={cn(editing && "pointer-events-none opacity-45")}>{node}</div>

                {/* No grip glyph: the whole card is the handle, so an icon in
                    one corner would both cover the widget's title and imply you
                    have to grab it there. The dashed border says it moves. */}
                {editing && (
                  <>
                    <div className="pointer-events-none absolute inset-0 rounded-3xl border-2 border-dashed border-accent-line" />
                    <div className="absolute right-1.5 top-1.5 flex gap-1">
                      {def?.resizable && (
                        <button
                          type="button"
                          onClick={() => setDashboard(toggleSpan(layout, p.id))}
                          className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-3 text-fg shadow-lg"
                          aria-label={
                            p.span === 2
                              ? `Make ${def.label} half width`
                              : `Make ${def.label} full width`
                          }
                        >
                          {p.span === 2 ? (
                            <Minimize2 className="size-3.5" />
                          ) : (
                            <Maximize2 className="size-3.5" />
                          )}
                        </button>
                      )}
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
                aria-label={`Show ${widgetDef(p.id)?.label ?? p.id}`}
              >
                <Eye className="size-3.5" />
                {widgetDef(p.id)?.label ?? p.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && shown.length === 0 && (
        <p className="py-10 text-center text-sm text-faint">
          Every widget is off the page. Tap one below to bring it back.
        </p>
      )}
    </div>
  );
}
