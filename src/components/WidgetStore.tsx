import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  WIDGETS_BY_TAB, borrowedId, specFor, type WidgetDef, type WidgetPlacement,
} from "@/lib/dashboard-layout";
import { PAGE_NAMES, WIDGET_SOURCES } from "@/components/widget-sources";
import { cn } from "@/lib/utils";

/**
 * Every widget in the app, by page, with a search — the + in edit mode.
 *
 * This page's own widgets come first (adding one that was hidden brings it
 * back). Anything from another page is added as that page's live card, not a
 * copy. A new widget lands at the top of the page, to be dragged into place.
 */
export function WidgetStore({
  tab, layout, onAdd, onClose,
}: {
  tab: string;
  layout: WidgetPlacement[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const on = useMemo(() => new Set(layout.filter((p) => !p.hidden).map((p) => p.id)), [layout]);

  const groups = useMemo(() => {
    const pages = [tab, ...Object.keys(PAGE_NAMES).filter((t) => t !== tab)].filter(
      (t) => WIDGETS_BY_TAB[t] && (t === tab || WIDGET_SOURCES[t]),
    );
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return pages
      .map((page) => {
        const own = page === tab;
        const list = (WIDGETS_BY_TAB[page] ?? [])
          // A tab bar or a filter row belongs to its own page; on another one
          // it would switch nothing.
          .filter((w) => own || !isFurniture(w))
          .map((w) => ({ w, id: own ? w.id : borrowedId(page, w.id) }))
          .filter(({ w }) => {
            if (!words.length) return true;
            const hay = `${w.label} ${w.id} ${w.keywords ?? ""} ${PAGE_NAMES[page] ?? page}`.toLowerCase();
            return words.every((word) => hay.includes(word));
          });
        return { page, own, list };
      })
      .filter((g) => g.list.length);
  }, [tab, q]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Add a widget"
      onClick={onClose}
    >
      <div
        className="soma-expand flex max-h-[88vh] flex-col rounded-t-3xl border-t border-border bg-bg pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
        data-no-swipe-nav
      >
        <div className="flex items-center justify-between px-4">
          <div className="font-display text-base font-extrabold">Widgets</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full border border-border bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>
        <label className="mx-4 mt-2.5 flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search widgets — sleep, water, habits…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            type="search"
          />
        </label>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {groups.length === 0 && (
            <p className="py-10 text-center text-sm text-faint">No widget called that.</p>
          )}
          {groups.map((g) => (
            <section key={g.page} className="mt-3">
              <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted">
                {g.own ? "This page" : PAGE_NAMES[g.page] ?? g.page}
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {g.list.map(({ w, id }, i) => {
                  const added = on.has(id);
                  return (
                    <div
                      key={id}
                      className={cn("flex items-center gap-3 px-3 py-2.5", i > 0 && "border-t border-border")}
                    >
                      <Shape def={w} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{w.label}</div>
                        <div className="truncate text-[0.66rem] text-faint">
                          {PAGE_NAMES[g.page] ?? g.page} · {w.size}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={added}
                        onClick={() => {
                          onAdd(id);
                          toast.success(`${w.label} added — hold it to drag it where you want`);
                        }}
                        className={cn(
                          "flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold",
                          added ? "bg-surface-2 text-faint" : "bg-accent text-accent-ink active:scale-95",
                        )}
                        aria-label={added ? `${w.label} is on this page` : `Add ${w.label}`}
                      >
                        {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                        {added ? "Added" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function isFurniture(w: WidgetDef): boolean {
  return !!w.sizes && w.sizes.length === 1 && w.sizes[0] === "1x4";
}

/** The widget's default shape, to scale. */
function Shape({ def }: { def: WidgetDef }) {
  const spec = specFor(def.size);
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2">
      <span
        aria-hidden
        className="block rounded-[3px] border-2 border-accent/70 bg-accent/15"
        style={{ width: spec.w * 6, height: spec.h * 6 }}
      />
    </span>
  );
}
