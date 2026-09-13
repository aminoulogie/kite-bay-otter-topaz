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

/**
 * The three sizes, named after what they are rather than how many columns
 * they take.
 *
 * Borrowed wholesale from the home screen, because that is where everyone
 * already learned it: SMALL is a square you glance at, MEDIUM is a row you
 * read, LARGE is a panel you work in. Columns are an implementation detail of
 * the grid; "small" is a promise about how much fits.
 */
export type WidgetSize = "small" | "medium" | "large";

export const SIZES: WidgetSize[] = ["small", "medium", "large"];

/** How many of the two columns each size takes. */
export function columnsFor(size: WidgetSize): 1 | 2 {
  return size === "small" ? 1 : 2;
}

export function nextSize(size: WidgetSize): WidgetSize {
  const i = SIZES.indexOf(size);
  return SIZES[(i + 1) % SIZES.length]!;
}

export interface WidgetDef {
  id: string;
  /** What the edit overlay calls it. */
  label: string;
  /** The size it ships at. Every widget can be set to any of the three. */
  size: WidgetSize;
}

export interface WidgetPlacement {
  id: string;
  size: WidgetSize;
  hidden: boolean;
}

/** A stored value read back as a size, whatever shape it was written in. */
export function asSize(value: unknown): WidgetSize | null {
  if (value === "small" || value === "medium" || value === "large") return value;
  // Layouts saved before there were three sizes stored a column count.
  if (value === 1) return "small";
  if (value === 2) return "medium";
  return null;
}

/**
 * Every widget the Home page can show, in the order a fresh install gets.
 *
 * The six tiles are separate widgets rather than one block: "put protein at the
 * top and move carbs off the page" is the entire reason someone opens an edit
 * mode, and a single grid could not answer it.
 */
export const DASHBOARD_WIDGETS: WidgetDef[] = [
  { id: "brief", label: "Coach brief", size: "medium" },
  { id: "score", label: "Today's score", size: "medium" },
  { id: "cals", label: "Calories", size: "small" },
  { id: "protein", label: "Protein", size: "small" },
  { id: "carbs", label: "Carbs", size: "small" },
  { id: "fat", label: "Fat", size: "small" },
  { id: "water", label: "Water", size: "small" },
  { id: "session", label: "Session", size: "small" },
  { id: "todos", label: "To-do", size: "medium" },
  { id: "gap", label: "Log the gap", size: "medium" },
  { id: "correlate", label: "Across everything", size: "medium" },
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
    { id: "goal", label: "Reading goal", size: "medium" },
    { id: "shelf", label: "Reading shelf", size: "medium" },
    { id: "week", label: "This week", size: "medium" },
    { id: "log", label: "Log a book", size: "medium" },
    { id: "recent", label: "Recent books", size: "medium" },
  ],
  "mind-language": [
    { id: "languages", label: "Languages and words", size: "medium" },
    { id: "review", label: "Words to review", size: "medium" },
    { id: "words", label: "Your own words", size: "medium" },
    { id: "week", label: "This week", size: "medium" },
    { id: "log", label: "Log a drill", size: "medium" },
    { id: "recent", label: "Recent drills", size: "medium" },
  ],
  "mind-idea": [
    { id: "week", label: "This week", size: "medium" },
    { id: "log", label: "Log an idea", size: "medium" },
    { id: "recent", label: "Recent ideas", size: "medium" },
  ],
  "mind-research": [
    { id: "week", label: "This week", size: "medium" },
    { id: "log", label: "Log research", size: "medium" },
    { id: "recent", label: "Recent research", size: "medium" },
  ],
  projects: [
    { id: "header", label: "On the go", size: "medium" },
    { id: "new", label: "Start something", size: "medium" },
    { id: "list", label: "The projects", size: "medium" },
  ],
  money: [
    { id: "summary", label: "This month", size: "medium" },
    { id: "add", label: "Add an entry", size: "medium" },
    { id: "grocery", label: "Shopping list", size: "medium" },
    { id: "entries", label: "Entries", size: "medium" },
    { id: "categories", label: "Categories", size: "medium" },
  ],
  time: [
    { id: "header", label: "The day", size: "medium" },
    { id: "ring", label: "The ring", size: "medium" },
    { id: "screen", label: "Screen time", size: "medium" },
    { id: "blocks", label: "The day, in order", size: "medium" },
  ],
  habits: [
    { id: "header", label: "Consistency", size: "medium" },
    { id: "tabs", label: "Today / Matrix / Year", size: "medium" },
    { id: "list", label: "The habits", size: "medium" },
    { id: "new", label: "New habit", size: "medium" },
  ],
  // Fuel is four pages behind one tab. The old single page held thirteen cards
  // and you scrolled past the ones you were not using to reach the ones you
  // were — logging a meal and reviewing the week are different jobs done at
  // different times of day, and stacking them made both worse.
  "nutrition-dash": [
    { id: "target", label: "Today's totals", size: "medium" },
    { id: "suggest", label: "Suggest from pantry", size: "medium" },
    { id: "plan", label: "Plan ahead", size: "medium" },
    { id: "actions", label: "Scan / Search / Burn", size: "medium" },
    { id: "plate", label: "Plate photo", size: "medium" },
    { id: "hunger", label: "Hunger", size: "medium" },
    { id: "add", label: "Add food", size: "medium" },
    { id: "meal", label: "Meal builder", size: "medium" },
    { id: "preworkout", label: "Pre-workout", size: "medium" },
  ],
  "nutrition-week": [
    { id: "weekly", label: "The last seven days", size: "medium" },
    { id: "graphs", label: "Charts", size: "medium" },
  ],
  "nutrition-log": [
    { id: "diary", label: "Meal by meal", size: "medium" },
    { id: "water", label: "Water", size: "medium" },
    { id: "minerals", label: "Micronutrients", size: "medium" },
  ],
  "nutrition-weight": [
    { id: "weight", label: "Weight", size: "medium" },
  ],
  workout: [
    { id: "header", label: "Session header", size: "medium" },
    { id: "date", label: "The date", size: "medium" },
    { id: "quick", label: "Undo / Save", size: "medium" },
    { id: "session", label: "Rest timer", size: "medium" },
    { id: "chips", label: "Add exercise", size: "medium" },
  ],
  looks: [
    { id: "latest", label: "Latest front", size: "medium" },
    { id: "scan", label: "Scan button", size: "medium" },
    { id: "gallery", label: "Captures", size: "medium" },
    { id: "guide", label: "What it measures", size: "medium" },
    { id: "note", label: "What the mesh is", size: "medium" },
  ],
  // Stats is eight pages behind one tab, like Mind. Only the two that are
  // genuinely card stacks get a layout; the rest delegate to whole other
  // views, which bring their own.
  "insights-overview": [
    { id: "brief", label: "Coach brief", size: "medium" },
    { id: "meso", label: "Block review", size: "medium" },
    { id: "consistency", label: "Training consistency", size: "medium" },
    { id: "volume", label: "Weekly volume", size: "medium" },
    { id: "axial", label: "Axial load", size: "medium" },
    { id: "ratings", label: "Exercise ratings", size: "medium" },
  ],
  "insights-strength": [
    { id: "estimates", label: "Strength estimates", size: "medium" },
    { id: "prs", label: "Recent PRs", size: "medium" },
  ],
  "insights-heatmap": [
    { id: "intro", label: "What the map shows", size: "medium" },
    { id: "range", label: "Front / back", size: "medium" },
    { id: "grid", label: "The map", size: "medium" },
  ],
  body: [
    { id: "tabs", label: "Sleep / Measure / Supplements", size: "medium" },
    { id: "panel", label: "The panel", size: "medium" },
  ],
  estimates: [
    { id: "weight", label: "Bodyweight", size: "medium" },
    { id: "composition", label: "Muscle vs fat", size: "medium" },
    { id: "measures", label: "Measurements", size: "medium" },
    { id: "strength", label: "Strength", size: "medium" },
    { id: "note", label: "How these are made", size: "medium" },
  ],
  settings: [
    { id: "phase", label: "Phase", size: "medium" },
    { id: "goal", label: "Training goal", size: "medium" },
    { id: "appearance", label: "Appearance", size: "medium" },
    { id: "training", label: "Training", size: "medium" },
    { id: "nutrition", label: "Nutrition", size: "medium" },
    { id: "routines", label: "Routines", size: "medium" },
    { id: "report", label: "Report", size: "medium" },
    { id: "data", label: "Backup and restore", size: "medium" },
    { id: "csv", label: "Export as CSV", size: "medium" },
    { id: "foods", label: "Import foods", size: "medium" },
    { id: "programme", label: "Training programme", size: "medium" },
    { id: "targets", label: "Daily nutrition targets", size: "medium" },
    { id: "habit-history", label: "Habit history", size: "medium" },
    { id: "about", label: "About", size: "medium" },
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
  return widgetsFor(tab).map((w) => ({ id: w.id, size: w.size, hidden: false }));
}

/**
 * Every widget takes every size.
 *
 * There used to be a `resizable: false` on anything that was mostly prose,
 * which is a real concern — a paragraph in a quarter of a phone is unreadable.
 * But it was the app deciding, for the user, which of THEIR cards were
 * important enough to keep full width, and the answer to "this one looks bad
 * small" is to size it back up, not to have the button refuse. The grid clips
 * an over-stuffed small widget behind a fade rather than letting it break the
 * row, so the worst case is a card that reads as a preview of itself.
 */
function cleanSize(tab: string, id: string, value: unknown): WidgetSize {
  return asSize(value) ?? widgetDef(tab, id)?.size ?? "medium";
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
    // `span` is read too: layouts saved before the three sizes existed hold a
    // column count, and dropping them would reset everyone's page.
    const stored_ = (p as { size?: unknown; span?: unknown });
    out.push({
      id: p.id,
      size: cleanSize(tab, p.id, stored_.size ?? stored_.span),
      hidden: p.hidden === true,
    });
  }

  // Anything the registry has gained since this layout was saved, in its own
  // order, so a new widget lands somewhere sensible rather than at the end.
  if (out.length !== widgets.length) {
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]!;
      if (seen.has(w.id)) continue;
      const at = Math.min(i, out.length);
      out.splice(at, 0, { id: w.id, size: w.size, hidden: false });
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

/** Set one widget to one of the three sizes. */
export function resize(
  layout: WidgetPlacement[], id: string, size: WidgetSize, tab = "dashboard",
): WidgetPlacement[] {
  return layout.map((p) => (p.id === id ? { ...p, size: cleanSize(tab, id, size) } : p));
}

/** Small → medium → large → small, for a single control that cycles. */
export function cycleSize(
  layout: WidgetPlacement[], id: string, tab = "dashboard",
): WidgetPlacement[] {
  const cur = layout.find((p) => p.id === id);
  if (!cur) return layout;
  return resize(layout, id, nextSize(cur.size), tab);
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
    return p.id === b.id && p.size === b.size && p.hidden === b.hidden;
  });
}
