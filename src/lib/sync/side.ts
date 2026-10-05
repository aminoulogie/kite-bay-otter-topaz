/**
 * What sync carries besides the zustand store.
 *
 * Programmes, saved meals, meal programmes, membership periods and the
 * supplement checklist keep their own localStorage keys (see side-stores.ts),
 * so a sync that only read the store left them behind on whichever device
 * they were made on. Here they are offered to the sync engine as extra
 * top-level fields — `sidePrograms` and so on — which split into records like
 * any other list. Writing them back goes through the same restore path a
 * backup uses, so the screens that own them refresh.
 *
 * `syncDevices` is the other extra: each device's app version and when it was
 * last seen, so a phone left on an old version can be pointed out before it
 * does any harm.
 */

import type { SideStores } from "../side-stores.ts";

export type State = Record<string, unknown>;

/** The extra fields, in the order they are read. */
export const SIDE_FIELDS = [
  "sidePrograms",
  "sideActiveProgram",
  "sideRecipes",
  "sideMealPrograms",
  "sideMembership",
  "sideSupplements",
] as const;

/** The side stores as sync fields. Empty "unknowns" are left out rather than sent as blanks. */
export function sideFields(s: SideStores): State {
  const out: State = {
    sidePrograms: s.programs ?? [],
    sideRecipes: s.recipes ?? [],
    sideMealPrograms: s.mealPrograms ?? [],
    sideMembership: s.membership ?? [],
  };
  // A device with no programme chosen, or nothing ticked, has no opinion —
  // sending "none" would clear the other device's choice the first time the
  // two met.
  if (s.activeProgramId) out.sideActiveProgram = s.activeProgramId;
  if (s.supplements?.length) out.sideSupplements = s.supplements;
  return out;
}

/** The side stores named in `next`, or null when none are. */
export function sideFromFields(next: State): Partial<SideStores> | null {
  const out: Partial<SideStores> = {};
  const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : undefined);
  if ("sidePrograms" in next) out.programs = arr(next.sidePrograms);
  if (typeof next.sideActiveProgram === "string") out.activeProgramId = next.sideActiveProgram;
  if ("sideRecipes" in next) out.recipes = arr(next.sideRecipes);
  if ("sideMealPrograms" in next) out.mealPrograms = arr(next.sideMealPrograms);
  if ("sideMembership" in next) out.membership = arr(next.sideMembership);
  if ("sideSupplements" in next) out.supplements = arr<string>(next.sideSupplements)?.filter((x) => typeof x === "string");
  for (const k of Object.keys(out) as (keyof SideStores)[]) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : null;
}

/** Whether applying `incoming` would change `current`. */
export function sideChanged(incoming: Partial<SideStores>, current: SideStores): boolean {
  return (Object.keys(incoming) as (keyof SideStores)[]).some(
    (k) => JSON.stringify(incoming[k] ?? null) !== JSON.stringify(current[k] ?? null),
  );
}

/**
 * What this build's sync understands. Bump it whenever sync starts carrying a
 * new kind of data, so devices on older builds get pointed out. Version
 * strings cannot be compared for this: the Windows app runs the web build
 * ("web-330") and the phone its own numbered build ("0.0.202").
 *
 *   1  the first sync
 *   2  work log shifts, client rates, programmes, recipes, meal programmes,
 *      membership and supplements, device list, undo
 */
export const SYNC_SCHEMA = 2;

export interface DeviceInfo {
  id: string;
  /** Shown, never compared. */
  version: string;
  /** See SYNC_SCHEMA. */
  schema: number;
  kind: "phone" | "desktop" | "browser";
  /** Date key of the last day this device synced. */
  seen: string;
}

/** The list with this device's entry put in (or refreshed). */
export function withDevice(list: DeviceInfo[], me: DeviceInfo): DeviceInfo[] {
  const rest = list.filter((d) => d && typeof d.id === "string" && d.id !== me.id);
  return [...rest, me];
}

/** -1, 0 or 1, comparing dotted version numbers ("0.0.192" < "0.0.202"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000);

/**
 * Other devices, seen in the last two weeks, whose sync knows less than this
 * one's. An older build can only mishandle data it does not know about; a
 * newer one elsewhere is this device's own problem, shown on that device.
 */
export function outdatedDevices(list: DeviceInfo[], meId: string, mySchema: number, today: string): DeviceInfo[] {
  return list.filter(
    (d) =>
      d.id !== meId &&
      (typeof d.schema === "number" ? d.schema : 1) < mySchema &&
      typeof d.seen === "string" &&
      daysBetween(d.seen, today) <= 14,
  );
}
