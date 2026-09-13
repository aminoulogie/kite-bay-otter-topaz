/**
 * Which widgets are on the Home page, in what order, and how wide.
 *
 * The page was a fixed stack, which is fine until the thing you check first is
 * the thing you have to scroll past four cards to reach. So the order and the
 * widths are the user's, and this is the arithmetic behind that.
 *
 * The grid is two columns, because a phone is not wide enough for three and one
 * is just the stack again. A widget is therefore either HALF the row or the
 * WHOLE of it, and nothing in between — a third of a phone screen cannot hold a
 * number and its label.
 *
 * Two rules exist to stop a saved layout rotting:
 *
 * **A stored layout is reconciled against the registry, never trusted whole.**
 * A widget added in a later version has to appear for someone who saved a
 * layout before it existed, and one that has been removed must not leave a hole
 * behind. So the registry is the source of truth for WHICH widgets exist and
 * the stored layout only says where they go.
 *
 * **Hiding is not deleting.** A hidden widget keeps its place in the order, so
 * bringing it back puts it where it was rather than at the bottom.
 */

export type Span = 1 | 2;

export interface WidgetDef {
  id: string;
  /** What the edit overlay calls it. */
  label: string;
  span: Span;
  /** False for widgets that are all prose and unreadable in half a phone. */
  resizable: boolean;
}

export interface WidgetPlacement {
  id: string;
  span: Span;
  hidden: boolean;
}

/**
 * Every widget the Home page can show, in the order a fresh install gets.
 *
 * The six tiles are separate widgets rather than one block: "put protein at the
 * top and move carbs off the page" is the entire reason someone opens an edit
 * mode, and a single grid could not answer it.
 */
export const WIDGETS: WidgetDef[] = [
  { id: "brief", label: "Coach brief", span: 2, resizable: false },
  { id: "score", label: "Today's score", span: 2, resizable: true },
  { id: "cals", label: "Calories", span: 1, resizable: true },
  { id: "protein", label: "Protein", span: 1, resizable: true },
  { id: "carbs", label: "Carbs", span: 1, resizable: true },
  { id: "fat", label: "Fat", span: 1, resizable: true },
  { id: "water", label: "Water", span: 1, resizable: true },
  { id: "session", label: "Session", span: 1, resizable: true },
  { id: "todos", label: "To-do", span: 2, resizable: true },
  { id: "gap", label: "Log the gap", span: 2, resizable: false },
  { id: "correlate", label: "Across everything", span: 2, resizable: false },
];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function widgetDef(id: string): WidgetDef | undefined {
  return BY_ID.get(id);
}

export function defaultLayout(): WidgetPlacement[] {
  return WIDGETS.map((w) => ({ id: w.id, span: w.span, hidden: false }));
}

function cleanSpan(id: string, span: unknown): Span {
  const def = BY_ID.get(id);
  if (def && !def.resizable) return def.span;
  return span === 1 ? 1 : 2;
}

/**
 * A stored layout, made safe against a registry that has moved on.
 *
 * Unknown ids are dropped, missing ones are appended in registry order, and a
 * span that a widget no longer supports is pulled back to its declared one.
 */
export function reconcile(stored: WidgetPlacement[] | undefined): WidgetPlacement[] {
  const seen = new Set<string>();
  const out: WidgetPlacement[] = [];

  for (const p of stored ?? []) {
    if (!p || typeof p.id !== "string") continue;
    if (!BY_ID.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, span: cleanSpan(p.id, p.span), hidden: p.hidden === true });
  }

  // Anything the registry has gained since this layout was saved, in its own
  // order, so a new widget lands somewhere sensible rather than at the end.
  if (out.length !== WIDGETS.length) {
    for (let i = 0; i < WIDGETS.length; i++) {
      const w = WIDGETS[i]!;
      if (seen.has(w.id)) continue;
      const at = Math.min(i, out.length);
      out.splice(at, 0, { id: w.id, span: w.span, hidden: false });
      seen.add(w.id);
    }
  }
  return out;
}

/** Move one widget to a new index, the rest closing up behind it. */
export function move(layout: WidgetPlacement[], id: string, to: number): WidgetPlacement[] {
  const from = layout.findIndex((p) => p.id === id);
  if (from < 0) return layout;
  const target = Math.max(0, Math.min(layout.length - 1, Math.floor(to)));
  if (target === from) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

/** Half the row, or the whole of it. A locked widget does not budge. */
export function resize(layout: WidgetPlacement[], id: string, span: Span): WidgetPlacement[] {
  return layout.map((p) => (p.id === id ? { ...p, span: cleanSpan(id, span) } : p));
}

export function toggleSpan(layout: WidgetPlacement[], id: string): WidgetPlacement[] {
  const cur = layout.find((p) => p.id === id);
  if (!cur) return layout;
  return resize(layout, id, cur.span === 2 ? 1 : 2);
}

/** Hidden, not removed: it keeps its place for when it comes back. */
export function setHidden(layout: WidgetPlacement[], id: string, hidden: boolean): WidgetPlacement[] {
  return layout.map((p) => (p.id === id ? { ...p, hidden } : p));
}

export function toggleHidden(layout: WidgetPlacement[], id: string): WidgetPlacement[] {
  const cur = layout.find((p) => p.id === id);
  return cur ? setHidden(layout, id, !cur.hidden) : layout;
}

export function visible(layout: WidgetPlacement[]): WidgetPlacement[] {
  return layout.filter((p) => !p.hidden);
}

export function hidden(layout: WidgetPlacement[]): WidgetPlacement[] {
  return layout.filter((p) => p.hidden);
}

/** True when the layout is exactly what a fresh install would have. */
export function isDefault(layout: WidgetPlacement[]): boolean {
  const base = defaultLayout();
  if (layout.length !== base.length) return false;
  return layout.every((p, i) => {
    const b = base[i]!;
    return p.id === b.id && p.span === b.span && p.hidden === b.hidden;
  });
}
