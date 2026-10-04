/**
 * The app's state as a set of small records, so two devices can merge.
 *
 * SOMA persists one big object. Syncing it whole would mean the last device
 * to save wins EVERYTHING — log food on the phone while ticking a task on the
 * PC and one of the two is lost. Split into records, each change touches only
 * its own record, and two edits only collide when they are to the same thing.
 *
 * The split is generic, read off the shape of the data rather than listed per
 * field, so a field added later syncs without anyone remembering to wire it:
 *
 *   - a map keyed by date or id   →  one record per entry   ("nutrition/2026-10-04")
 *   - an array of objects with ids →  one record per item    ("todos#a1b2") + its order
 *   - settings                     →  one record per setting ("settings.mealTimes")
 *   - anything else                →  one record             ("restDays")
 *
 * Device-local fields (which tab is open, display size, a session running on
 * this phone) are never synced.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type State = Record<string, unknown>;

/** Top-level fields that belong to one device. */
export const LOCAL_FIELDS = new Set(["seeded", "activeDate", "live", "tab"]);
/** Settings that belong to one device: how this screen looks, not what you did. */
export const LOCAL_SETTINGS = new Set(["uiScale", "dockTransparency", "dockScale", "mealVerdictsSince", "workstation"]);
/** Maps whose entries are records of their own. */
export const MAP_FIELDS = new Set([
  "history", "nutrition", "logOverrides", "dayNotes", "restDays", "dayPlans", "screenTime", "layouts", "reading",
]);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** An array of objects that each carry a distinct string id. */
function idArray(v: unknown): v is { id: string }[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  const seen = new Set<string>();
  for (const x of v) {
    if (!isObj(x) || typeof x.id !== "string" || seen.has(x.id)) return false;
    seen.add(x.id);
  }
  return true;
}

/** Fields synced as an array of id'd items, remembered once seen so an emptied list still splits. */
export const ID_ARRAY_FIELDS = new Set([
  "habits", "hunger", "scans", "ledger", "mind", "pantry", "grocery", "todos", "projects", "goals", "trades", "dayRoutines", "langs",
]);

/** Every synced record in `state`, as key → JSON text. */
export function toRecords(state: State): Map<string, string> {
  const out = new Map<string, string>();
  for (const [field, value] of Object.entries(state)) {
    if (LOCAL_FIELDS.has(field) || value === undefined || typeof value === "function") continue;
    if (field === "settings" && isObj(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (!LOCAL_SETTINGS.has(k) && v !== undefined) out.set(`settings.${k}`, JSON.stringify(v));
      }
    } else if (MAP_FIELDS.has(field) && isObj(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) out.set(`${field}/${k}`, JSON.stringify(v));
      }
    } else if (ID_ARRAY_FIELDS.has(field) && (idArray(value) || (Array.isArray(value) && value.length === 0))) {
      const items = value as { id: string }[];
      for (const it of items) out.set(`${field}#${it.id}`, JSON.stringify(it));
      out.set(`${field}@order`, JSON.stringify(items.map((it) => it.id)));
    } else {
      out.set(field, JSON.stringify(value));
    }
  }
  return out;
}

export interface Change {
  key: string;
  /** JSON text, or null when the record was removed. */
  value: string | null;
}

/** What changed between two record sets. */
export function diff(prev: Map<string, string>, next: Map<string, string>): Change[] {
  const out: Change[] = [];
  for (const [k, v] of next) if (prev.get(k) !== v) out.push({ key: k, value: v });
  for (const k of prev.keys()) if (!next.has(k)) out.push({ key: k, value: null });
  return out;
}

function parseKey(key: string): { field: string; kind: "setting" | "map" | "item" | "order" | "whole"; sub?: string } {
  if (key.startsWith("settings.")) return { field: "settings", kind: "setting", sub: key.slice(9) };
  const at = key.indexOf("@order");
  if (at > 0 && key.endsWith("@order")) return { field: key.slice(0, at), kind: "order" };
  const hash = key.indexOf("#");
  if (hash > 0) return { field: key.slice(0, hash), kind: "item", sub: key.slice(hash + 1) };
  const slash = key.indexOf("/");
  if (slash > 0) return { field: key.slice(0, slash), kind: "map", sub: key.slice(slash + 1) };
  return { field: key, kind: "whole" };
}

/**
 * The state with `changes` applied. Pure: returns a new object, touching only
 * the fields that changed, so React re-renders what it must and no more.
 */
export function applyChanges(state: State, changes: Change[]): State {
  if (!changes.length) return state;
  const next: State = { ...state };
  const items = new Map<string, Map<string, unknown>>();
  const orders = new Map<string, string[]>();
  const itemsOf = (field: string) => {
    let m = items.get(field);
    if (!m) {
      const arr = Array.isArray(next[field]) ? (next[field] as { id?: string }[]) : [];
      m = new Map(arr.filter((x) => isObj(x) && typeof x.id === "string").map((x) => [x.id as string, x]));
      items.set(field, m);
    }
    return m;
  };

  for (const { key, value } of changes) {
    const p = parseKey(key);
    if (LOCAL_FIELDS.has(p.field)) continue;
    const v = value === null ? undefined : (JSON.parse(value) as unknown);
    switch (p.kind) {
      case "setting": {
        if (LOCAL_SETTINGS.has(p.sub!)) break;
        const s = { ...(isObj(next.settings) ? next.settings : {}) };
        if (v === undefined) delete s[p.sub!];
        else s[p.sub!] = v;
        next.settings = s;
        break;
      }
      case "map": {
        const m = { ...(isObj(next[p.field]) ? (next[p.field] as Record<string, unknown>) : {}) };
        if (v === undefined) delete m[p.sub!];
        else m[p.sub!] = v;
        next[p.field] = m;
        break;
      }
      case "item": {
        const m = itemsOf(p.field);
        if (v === undefined) m.delete(p.sub!);
        else m.set(p.sub!, v);
        break;
      }
      case "order":
        if (Array.isArray(v)) orders.set(p.field, v as string[]);
        break;
      case "whole":
        if (v === undefined) delete next[p.field];
        else next[p.field] = v;
        break;
    }
  }

  // Rebuild each touched list: the order record first, then anything it does
  // not mention (an item that arrived before its order did) at the end.
  for (const field of new Set([...items.keys(), ...orders.keys()])) {
    const m = itemsOf(field);
    const order = orders.get(field) ?? (Array.isArray(next[field]) ? (next[field] as { id: string }[]).map((x) => x.id) : []);
    const out: unknown[] = [];
    const used = new Set<string>();
    for (const id of order) {
      if (m.has(id) && !used.has(id)) {
        out.push(m.get(id));
        used.add(id);
      }
    }
    for (const [id, it] of m) if (!used.has(id)) out.push(it);
    next[field] = out;
  }
  return next;
}
