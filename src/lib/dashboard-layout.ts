/**
 * Which widgets are on a page, in what order, and how wide.
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
export const DASHBOARD_WIDGETS: WidgetDef[] = [
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

/**
 * Every arrangeable page, and what is on it.
 *
 * Every tab is here now, Setup included. The earlier judgement — that a form
 * is a sequence of steps rather than a collection of cards, so reordering it
 * is not a feature — was wrong about this app. Setup is not one form; it is
 * fourteen unrelated panels that happen to share a screen, and which of them
 * you touch weekly against never is personal. The same goes for Fuel and
 * Train: the diary and the session are ordered, but the cards AROUND them are
 * not, and "the one card I check every day is the one I scroll past four
 * others to reach" is the entire reason this mode exists.
 *
 * What stays out is anything inside a step: the set rows of a live session,
 * the fields of one card. Those have an order that means something.
 */
export const WIDGETS_BY_TAB: Record<string, WidgetDef[]> = {
  dashboard: DASHBOARD_WIDGETS,
  // Mind is four pages behind one tab, so each keeps its own arrangement.
  // "mind-book" rather than "mind" because a layout is a layout OF A PAGE, and
  // Reading and Language are not the same page with different cards on it.
  "mind-book": [
    { id: "goal", label: "Reading goal", span: 2, resizable: false },
    { id: "shelf", label: "Reading shelf", span: 2, resizable: false },
    { id: "week", label: "This week", span: 2, resizable: true },
    { id: "log", label: "Log a book", span: 2, resizable: false },
    { id: "recent", label: "Recent books", span: 2, resizable: false },
  ],
  "mind-language": [
    { id: "languages", label: "Languages and words", span: 2, resizable: false },
    { id: "review", label: "Words to review", span: 2, resizable: false },
    { id: "words", label: "Your own words", span: 2, resizable: false },
    { id: "week", label: "This week", span: 2, resizable: true },
    { id: "log", label: "Log a drill", span: 2, resizable: false },
    { id: "recent", label: "Recent drills", span: 2, resizable: false },
  ],
  "mind-idea": [
    { id: "week", label: "This week", span: 2, resizable: true },
    { id: "log", label: "Log an idea", span: 2, resizable: false },
    { id: "recent", label: "Recent ideas", span: 2, resizable: false },
  ],
  "mind-research": [
    { id: "week", label: "This week", span: 2, resizable: true },
    { id: "log", label: "Log research", span: 2, resizable: false },
    { id: "recent", label: "Recent research", span: 2, resizable: false },
  ],
  money: [
    { id: "summary", label: "This month", span: 2, resizable: true },
    { id: "add", label: "Add an entry", span: 2, resizable: false },
    { id: "grocery", label: "Shopping list", span: 2, resizable: false },
    { id: "entries", label: "Entries", span: 2, resizable: false },
    { id: "categories", label: "Categories", span: 2, resizable: false },
  ],
  time: [
    { id: "header", label: "The day", span: 2, resizable: true },
    { id: "ring", label: "The ring", span: 2, resizable: false },
    { id: "screen", label: "Screen time", span: 2, resizable: false },
    { id: "blocks", label: "The day, in order", span: 2, resizable: false },
  ],
  habits: [
    { id: "header", label: "Consistency", span: 2, resizable: true },
    { id: "tabs", label: "Today / Matrix / Year", span: 2, resizable: false },
    { id: "list", label: "The habits", span: 2, resizable: false },
    { id: "new", label: "New habit", span: 2, resizable: false },
  ],
  nutrition: [
    { id: "target", label: "Today's totals", span: 2, resizable: true },
    { id: "suggest", label: "Suggest from pantry", span: 2, resizable: false },
    { id: "plan", label: "Plan ahead", span: 2, resizable: false },
    { id: "actions", label: "Scan / Search / Burn", span: 2, resizable: false },
    { id: "macros", label: "Macro split", span: 2, resizable: true },
    { id: "plate", label: "Plate photo", span: 2, resizable: false },
    { id: "hunger", label: "Hunger", span: 2, resizable: false },
    { id: "add", label: "Add food", span: 2, resizable: false },
    { id: "meal", label: "Meal builder", span: 2, resizable: false },
    { id: "preworkout", label: "Pre-workout", span: 2, resizable: false },
    { id: "diary", label: "The diary", span: 2, resizable: false },
    { id: "graphs", label: "The week", span: 2, resizable: false },
    { id: "minerals", label: "Minerals", span: 2, resizable: false },
  ],
  workout: [
    { id: "header", label: "Session header", span: 2, resizable: true },
    { id: "date", label: "The date", span: 2, resizable: false },
    { id: "quick", label: "Undo / Save", span: 2, resizable: false },
    { id: "session", label: "Rest timer", span: 2, resizable: false },
    { id: "chips", label: "Add exercise", span: 2, resizable: false },
  ],
  looks: [
    { id: "latest", label: "Latest front", span: 2, resizable: true },
    { id: "scan", label: "Scan button", span: 2, resizable: false },
    { id: "gallery", label: "Captures", span: 2, resizable: false },
    { id: "guide", label: "What it measures", span: 2, resizable: false },
    { id: "note", label: "What the mesh is", span: 2, resizable: false },
  ],
  // Stats is eight pages behind one tab, like Mind. Only the two that are
  // genuinely card stacks get a layout; the rest delegate to whole other
  // views, which bring their own.
  "insights-overview": [
    { id: "brief", label: "Coach brief", span: 2, resizable: false },
    { id: "meso", label: "Block review", span: 2, resizable: false },
    { id: "consistency", label: "Training consistency", span: 2, resizable: true },
    { id: "volume", label: "Weekly volume", span: 2, resizable: false },
    { id: "axial", label: "Axial load", span: 2, resizable: true },
    { id: "ratings", label: "Exercise ratings", span: 2, resizable: false },
  ],
  "insights-strength": [
    { id: "estimates", label: "Strength estimates", span: 2, resizable: false },
    { id: "prs", label: "Recent PRs", span: 2, resizable: true },
  ],
  "insights-heatmap": [
    { id: "intro", label: "What the map shows", span: 2, resizable: true },
    { id: "range", label: "Front / back", span: 2, resizable: false },
    { id: "grid", label: "The map", span: 2, resizable: false },
  ],
  body: [
    { id: "tabs", label: "Weight / Sleep / Measure / Supplements", span: 2, resizable: false },
    { id: "panel", label: "The panel", span: 2, resizable: false },
  ],
  estimates: [
    { id: "weight", label: "Bodyweight", span: 2, resizable: false },
    { id: "composition", label: "Muscle vs fat", span: 2, resizable: true },
    { id: "measures", label: "Measurements", span: 2, resizable: false },
    { id: "strength", label: "Strength", span: 2, resizable: false },
    { id: "note", label: "How these are made", span: 2, resizable: true },
  ],
  settings: [
    { id: "phase", label: "Phase", span: 2, resizable: true },
    { id: "goal", label: "Training goal", span: 2, resizable: true },
    { id: "appearance", label: "Appearance", span: 2, resizable: false },
    { id: "training", label: "Training", span: 2, resizable: false },
    { id: "nutrition", label: "Nutrition", span: 2, resizable: false },
    { id: "routines", label: "Routines", span: 2, resizable: false },
    { id: "report", label: "Report", span: 2, resizable: true },
    { id: "data", label: "Backup and restore", span: 2, resizable: false },
    { id: "csv", label: "Export as CSV", span: 2, resizable: true },
    { id: "foods", label: "Import foods", span: 2, resizable: false },
    { id: "programme", label: "Training programme", span: 2, resizable: false },
    { id: "targets", label: "Daily nutrition targets", span: 2, resizable: false },
    { id: "habit-history", label: "Habit history", span: 2, resizable: true },
    { id: "about", label: "About", span: 2, resizable: true },
  ],
};

/** Every widget id the app knows about, whichever page it sits on. */
const BY_ID = new Map(
  Object.values(WIDGETS_BY_TAB).flatMap((list) => list.map((w) => [`${w.id}`, w] as const)),
);

/**
 * Whether a tab can be rearranged at all.
 *
 * A prefix counts, because a tab with sub-pages registers one layout per page
 * ("mind-book", "mind-language") and the header button only knows which TAB it
 * is on. Without this, Mind would lose its edit button the moment it gained
 * sub-tabs — which would be the feature removing itself.
 */
export function isArrangeable(tab: string): boolean {
  if (Object.prototype.hasOwnProperty.call(WIDGETS_BY_TAB, tab)) return true;
  return Object.keys(WIDGETS_BY_TAB).some((k) => k.startsWith(`${tab}-`));
}

export function widgetsFor(tab: string): WidgetDef[] {
  return WIDGETS_BY_TAB[tab] ?? [];
}

/**
 * A widget's definition WITHIN a tab.
 *
 * Looked up per tab rather than globally, because ids only have to be unique on
 * their own page — "header" means one thing on Time and another on Habits, and
 * a single flat map would silently give one of them the other's rules.
 */
export function widgetDef(tab: string, id: string): WidgetDef | undefined {
  return widgetsFor(tab).find((w) => w.id === id) ?? BY_ID.get(id);
}

export function defaultLayout(tab = "dashboard"): WidgetPlacement[] {
  return widgetsFor(tab).map((w) => ({ id: w.id, span: w.span, hidden: false }));
}

function cleanSpan(tab: string, id: string, span: unknown): Span {
  const def = widgetDef(tab, id);
  if (def && !def.resizable) return def.span;
  return span === 1 ? 1 : 2;
}

/**
 * A stored layout, made safe against a registry that has moved on.
 *
 * Unknown ids are dropped, missing ones are appended in registry order, and a
 * span that a widget no longer supports is pulled back to its declared one.
 */
export function reconcile(stored: WidgetPlacement[] | undefined, tab = "dashboard"): WidgetPlacement[] {
  const widgets = widgetsFor(tab);
  const known = new Set(widgets.map((w) => w.id));
  const seen = new Set<string>();
  const out: WidgetPlacement[] = [];

  for (const p of stored ?? []) {
    if (!p || typeof p.id !== "string") continue;
    if (!known.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, span: cleanSpan(tab, p.id, p.span), hidden: p.hidden === true });
  }

  // Anything the registry has gained since this layout was saved, in its own
  // order, so a new widget lands somewhere sensible rather than at the end.
  if (out.length !== widgets.length) {
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]!;
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
export function resize(
  layout: WidgetPlacement[], id: string, span: Span, tab = "dashboard",
): WidgetPlacement[] {
  return layout.map((p) => (p.id === id ? { ...p, span: cleanSpan(tab, id, span) } : p));
}

export function toggleSpan(
  layout: WidgetPlacement[], id: string, tab = "dashboard",
): WidgetPlacement[] {
  const cur = layout.find((p) => p.id === id);
  if (!cur) return layout;
  return resize(layout, id, cur.span === 2 ? 1 : 2, tab);
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
export function isDefault(layout: WidgetPlacement[], tab = "dashboard"): boolean {
  const base = defaultLayout(tab);
  if (layout.length !== base.length) return false;
  return layout.every((p, i) => {
    const b = base[i]!;
    return p.id === b.id && p.span === b.span && p.hidden === b.hidden;
  });
}
