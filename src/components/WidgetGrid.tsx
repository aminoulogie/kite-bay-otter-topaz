import { Eye, EyeOff, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Children, createContext, isValidElement, useContext, useMemo, useState } from "react";
import {
  SIZE_SPECS, addSpacer, allowedSizes, hasDetailRoom, hasFullRoom, hidden as hiddenOf, isDefault,
  isNatural, isSpacer, move, reconcile, removeWidget, resize, specFor, toggleHidden, visible, widgetDef,
  type WidgetSize,
} from "@/lib/dashboard-layout";
import { Glance, GlanceOpenContext, isGlance, type GlanceSpec } from "@/components/Glance";
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
 * A part of a card that only some sizes can afford.
 *
 * Resizing a widget is supposed to change what it SAYS, not how much of it is
 * cut off — the difference between an iOS widget and a photograph of one. So a
 * card marks its parts by how much room they need and the grid answers for the
 * size it was given:
 *
 *   core   — the one number or line that IS the widget. Always drawn.
 *   detail — the second tier: a breakdown, a legend, a trend, a footnote.
 *            Drawn at 2 rows and up.
 *   full   — everything the card has: charts, controls, history. Drawn at the
 *            tall sizes only.
 *
 * A card that ignores this is not broken — it simply renders the same at every
 * size and relies on the tile's own fade, which is what almost every card did
 * before this existed. Cards are converted one at a time, deliberately: the
 * rule has to be that a small size shows LESS, never that it shows something
 * unreadable.
 */
export function WidgetPart({
  level, children,
}: {
  level: "core" | "detail" | "full";
  children: React.ReactNode;
}) {
  const size = useWidgetSize();
  if (level === "detail" && !hasDetailRoom(size)) return null;
  if (level === "full" && !hasFullRoom(size)) return null;
  return <>{children}</>;
}

/**
 * Four columns on a phone, eight on a desktop.
 *
 * Two columns could not express a quarter, so a widget was half a row or the
 * whole of it and nothing else. Four is the home screen's own grid and the
 * smallest number that makes 1x1, 1x2 and 1x4 all mean something different.
 *
 * The desktop is TWELVE, and the spans do not scale with it. That is the whole
 * point. The old mapping doubled the grid and doubled every span with it, so a
 * full-width card was 4-of-4 on a phone and 8-of-8 on a desktop — the same
 * fraction, which made a 1440px window an 1176px-wide phone with four enormous
 * cards on it. Twelve columns with unscaled spans gives each card a SMALLER
 * share of a BIGGER page: a quarter-tile becomes a sixth, a half-card becomes a
 * quarter, and a full-width card becomes a half, so two of them sit side by
 * side the way a dashboard is supposed to read.
 *
 * Every size still ends up wider in pixels than it is on a phone, which is what
 * makes this safe: no card is being asked to draw itself in less room than it
 * already handles.
 */
const COL: Record<1 | 2 | 4, string> = {
  1: "col-span-1 lg:col-span-2",
  2: "col-span-2 lg:col-span-3",
  4: "col-span-4 lg:col-span-6",
};

/**
 * A height unit is about one phone column, so 1x1 comes out square.
 *
 * Fixed for a tile and a floor for a full-width card — see the note on
 * WidgetSize for why a 3x4 Routines editor must be allowed to grow past its
 * own size and a 1x1 must not.
 */
const ROW: Record<1 | 2 | 3, { tile: string; wide: string }> = {
  // One row, full width, is the one size with NO floor: it means "as tall as
  // this needs to be". That is what makes a tab bar 48px rather than a 48px
  // bar sitting in an 84px hole — and it is why the ladder now only ever goes
  // up. A floor here made 1x4 taller than 2x4 for every piece of furniture on
  // the page, which is a picker that lies about its own shapes.
  //
  // Shorter on a desktop. The heights above are a phone's: a card two columns
  // wide there is ~190px across, so anything it has to say wraps onto three
  // lines and needs the room. The same card is a quarter of a wide window now
  // and says it in one, so the phone's floor is left as empty space under the
  // content — which is what made four tiles of two numbers each fill a third
  // of a 900px screen.
  //
  // Only the one-row and three-row sizes come down. Two rows is where the ring
  // tiles live, and a ring is a fixed lump of pixels that does not reflow when
  // the card gets wider — trimming that row put the "of 2300 · 377 to go" line
  // under the tile's own bottom fade, which reads as a rendering fault rather
  // than as a smaller card. A wide 2-row CARD still comes down, because it has
  // text in it that does reflow.
  1: { tile: "h-[5.25rem] lg:h-[4.5rem]", wide: "" },
  2: { tile: "h-[11rem]", wide: "min-h-[11rem] lg:min-h-[9rem]" },
  3: { tile: "h-[17rem] lg:h-[14.5rem]", wide: "min-h-[17rem] lg:min-h-[14.5rem]" },
};

function boxFor(size: WidgetSize, natural: boolean): string {
  const spec = specFor(size);
  const h = ROW[spec.h];
  // Furniture and working cards keep their own height at one row. Every other
  // small size is a glance with a hard box; a big card gets a floor and may
  // grow past it, so a card with controls in it stays usable.
  if (natural) return COL[spec.w];
  return cn(COL[spec.w], isGlance(size) ? h.tile : h.wide);
}

/**
 * The widget id inside a key React has already mangled.
 *
 * `Children.toArray` rewrites every key so it is unique across the whole tree,
 * and how it rewrites depends on where the child sits: a direct child with an
 * explicit key comes back as ".$header", but the SAME child inside a mapped
 * array comes back as ".5:$header" — the array's own position, then the key.
 *
 * Reading only the ".$" form is why Train's exercise cards were not widgets.
 * They were keyed, they were meant to be arrangeable, and because they were
 * produced by a `.map` they failed the test and fell through to the unarranged
 * extras below the grid — with no gap between them, which is exactly what it
 * looked like. Everything after the last "$" is the key the view wrote; "=0"
 * and "=2" are React's own escapes for "=" and ":" and are put back.
 */
function idOf(key: string): string {
  const at = key.lastIndexOf("$");
  if (at < 0) return "";
  return key.slice(at + 1).replace(/=2/g, ":").replace(/=0/g, "=");
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
   */
  const { nodes, order, extras } = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    const ids: string[] = [];
    const rest: React.ReactNode[] = [];
    for (const child of Children.toArray(children)) {
      const id = idOf(isValidElement(child) ? String(child.key ?? "") : "");
      if (id) {
        if (!(id in map)) ids.push(id);
        map[id] = child;
      } else rest.push(child);
    }
    return { nodes: map, order: ids, extras: rest };
  }, [children]);

  // `order` rather than Object.keys, so the exercise a session just gained
  // lands where the view put it rather than wherever the object felt like.
  const layout = useMemo(() => reconcile(layouts[tab], tab, order), [layouts, tab, order]);
  const setDashboard = (next: typeof layout) => setLayout(tab, next);
  const resetDashboard = () => resetLayout(tab);

  /** Which widget's size picker is open, if any. */
  const [picking, setPicking] = useState<string | null>(null);
  /** A small widget tapped open: its whole card, in a sheet. */
  const [expanded, setExpanded] = useState<string | null>(null);

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
          <p className="mt-0.5 text-[0.68rem] leading-snug text-muted">
            Spacing adds an empty card you can drag between two others and size like any
            other, for when the gap is the point.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => setEditing(false)}>
              Done
            </Button>
            <Button className="flex-1" onClick={() => setDashboard(addSpacer(layout))}>
              <Plus className="size-4" /> Spacing
            </Button>
            {!isDefault(layout, tab) && (
              <Button onClick={resetDashboard} aria-label="Reset the layout">
                <RotateCcw className="size-4" />
              </Button>
            )}
          </div>

          {/* The way back, AT THE TOP.
              This list used to sit under the whole page, which on a sixteen
              card tab is four screens below the eye you just tapped: hiding
              something worked and looked permanent. It belongs beside the
              control that hid it, where the answer to "where did it go" is on
              screen while you are still asking. */}
          {off.length > 0 && (
            <div className="mt-2.5 border-t border-accent-line pt-2">
              <div className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted">
                Off the page — tap to bring back
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {off.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDashboard(toggleHidden(layout, p.id))}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.7rem] font-bold text-fg"
                    aria-label={`Show ${widgetDef(tab, p.id)?.label ?? p.id}`}
                  >
                    <Eye className="size-3.5" />
                    {widgetDef(tab, p.id)?.label ?? p.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Four columns on a phone, twelve on a desktop — and the SAME stored
          span means "half" and "full" on the phone but "quarter" and "half" on
          the desktop. A wide screen should hold two cards side by side, not one
          card stretched to two thousand pixels, and this gets that without the
          layout being stored twice. */}
      <div
        className={cn(
          // More air between rows than between columns. Two tiles side by side
          // are one row of a grid and belong close together; two cards stacked
          // are two separate things and were reading as one block — which is
          // what the exercise list looked like once it joined the grid.
          "soma-grid grid grid-cols-4 items-start gap-x-2 gap-y-3 lg:grid-cols-12 lg:gap-x-4 lg:gap-y-4",
          editing && "select-none",
        )}
        data-editing={editing ? "true" : "false"}
      >
        {shown.map((p, i) => {
          const def = widgetDef(tab, p.id);
          const spacer = isSpacer(p.id);
          const node = nodes[p.id];
          // A spacer has no view behind it — being nothing IS the widget — so
          // the "this page does not draw that one" guard has to let it past.
          if (!node && !spacer) return null;
          // An invented widget has no registry entry to be named by, so it is
          // called what the view called it — which for an exercise card is the
          // heading already printed on its face.
          const label = spacer ? "Spacing" : def?.label ?? p.id;
          const natural = isNatural(tab, p.id);
          const glance = !spacer && !natural && isGlance(p.size);
          const held = drag.dragging === i;
          const target = drag.over === i && drag.dragging !== null && !held;

          return (
            <div
              key={p.id}
              data-drag-index={i}
              data-widget={p.id}
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
                boxFor(p.size, natural),
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
                 <GlanceOpenContext.Provider value={editing ? null : () => setExpanded(p.id)}>
                  <div
                    className={cn(
                      // A spacer is deliberately empty, and the rule that
                      // collapses an empty widget keys off .soma-widget-box —
                      // so a gap must not wear that class, or the one widget
                      // whose whole job is to take up room would take none.
                      spacer ? "soma-spacer" : "soma-widget-box",
                      editing && "pointer-events-none opacity-45",
                      // Small is a square you glance at, so it gets a hard box
                      // and a fade where the content runs out. Large is a panel
                      // you work in, so it gets a floor rather than a ceiling —
                      // a card told to be large and given nothing to fill it
                      // should still LOOK large.
                      // A tile is a glance and gets a hard box with a fade
                      // where its content runs out; a full-width card keeps
                      // its natural height and only gains a floor.
                      glance && "soma-widget-tile",
                    )}
                  >
                    {node}
                  </div>
                 </GlanceOpenContext.Provider>
                </SizeContext.Provider>

                {/* No grip glyph: the whole card is the handle, so an icon in
                    one corner would both cover the widget's title and imply you
                    have to grab it there. The dashed border says it moves. */}
                {/* A gap is invisible when the page is live, which is the
                    point — but in edit mode it has to be something you can see
                    to grab, or it is a hole you can only move by accident. */}
                {editing && spacer && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-surface-2/60">
                    <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
                      Spacing
                    </span>
                  </div>
                )}

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
                        aria-label={`Size of ${label}, currently ${p.size}`}
                      >
                        <SizeGlyph size={p.size} on={false} />
                        {p.size}
                      </button>
                      {/* A gap is thrown away rather than parked off the page:
                          "Off the page" is a list of widgets you might want
                          back, and a nameless blank in it is a puzzle. There
                          is always another gap a tap away. */}
                      {spacer ? (
                        <button
                          type="button"
                          onClick={() => setDashboard(removeWidget(layout, p.id))}
                          className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-3 text-fg shadow-lg"
                          aria-label="Remove this spacing"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDashboard(toggleHidden(layout, p.id))}
                          className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-3 text-fg shadow-lg"
                          aria-label={`Hide ${label}`}
                        >
                          <EyeOff className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {picking && (
        <SizeSheet
          label={isSpacer(picking) ? "Spacing" : widgetDef(tab, picking)?.label ?? picking}
          current={layout.find((x) => x.id === picking)?.size ?? "2x4"}
          sizes={allowedSizes(tab, picking)}
          onPick={(sz) => setDashboard(resize(layout, picking, sz, tab))}
          onClose={() => setPicking(null)}
        />
      )}

      {expanded && nodes[expanded] && (
        <WidgetSheet
          label={widgetDef(tab, expanded)?.label ?? expanded}
          onClose={() => setExpanded(null)}
        >
          <SizeContext.Provider value="3x4">
            <GlanceOpenContext.Provider value={null}>{nodes[expanded]}</GlanceOpenContext.Provider>
          </SizeContext.Provider>
        </WidgetSheet>
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
  label, current, sizes, onPick, onClose,
}: {
  label: string;
  current: WidgetSize;
  sizes: WidgetSize[];
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
          {label} — rows by columns, out of four. The small sizes show the headline
          (tap one to open the whole card); the big ones show everything and can grow
          taller than they say, so a card with controls in it stays usable.
          {sizes.length < SIZE_SPECS.length && " This one only comes in the sizes where it still works."}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {SIZE_SPECS.filter((spec) => sizes.includes(spec.id)).map((spec) => {
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

/** A small widget, opened: the whole card in a sheet, at its largest. */
function WidgetSheet({
  label, onClose, children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
        data-no-swipe-nav
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="font-display text-base font-extrabold">{label}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full border border-border bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col">{children}</div>
      </div>
    </div>
  );
}

/**
 * A card that has a glance: the glance at the small sizes, the card itself
 * at the big ones (and in the sheet a glance opens).
 *
 * For cards written inline in a view — wrapping them is one line, where
 * teaching each one about sizes would be a rewrite. The spec is only built
 * when it is needed.
 */
export function Sized({
  glance, children,
}: {
  glance: GlanceSpec | (() => GlanceSpec);
  children: React.ReactNode;
}) {
  const size = useWidgetSize();
  if (isGlance(size)) return <Glance size={size} spec={typeof glance === "function" ? glance() : glance} />;
  return <>{children}</>;
}
