/**
 * The stores that live outside the persisted zustand store.
 *
 * Almost everything is in one zustand store behind a `persist` middleware, and
 * `exportJson` dumps that. Four things are not: programmes, saved meals,
 * membership periods and the supplement checklist each keep their own
 * localStorage key, written directly by the screen that owns them.
 *
 * That was invisible until someone asked whether a backup keeps everything. It
 * did not. Restoring onto a wiped phone brought back every session, every meal
 * and every photo — and then left the user to rebuild their weekday splits from
 * memory, because `soma-programs` had never been in the file.
 *
 * So this module is the single place that knows the full list. Anything named
 * here is exported and restored. Anything that keeps its own localStorage key
 * and is NOT named here is silently lost on a restore, which is exactly the bug
 * this exists to stop happening again.
 *
 * Deliberately not included: `soma-last-backup`. That records when this device
 * last took a backup, which is a fact about the device rather than about the
 * data — restoring it would tell a fresh phone it was already safe.
 */

import { loadPeriods, savePeriods, type MembershipPeriod } from "./membership.ts";
import { loadActiveId, loadPrograms, saveActiveId, savePrograms, type Program } from "./programs.ts";
import { loadRecipes, saveRecipes, type Recipe } from "./recipes.ts";
import { loadTaken, saveTaken } from "./supplements.ts";

/** Fired once a restore has rewritten the keys below. */
export const SIDE_STORES_RESTORED = "soma-side-stores-restored";

export interface SideStores {
  programs?: Program[];
  activeProgramId?: string | null;
  recipes?: Recipe[];
  membership?: MembershipPeriod[];
  /** Ids of the supplements the user has ticked. */
  supplements?: string[];
}

/** Everything outside the zustand store, read straight from localStorage. */
export function collectSideStores(): SideStores {
  return {
    programs: loadPrograms(),
    activeProgramId: loadActiveId(),
    recipes: loadRecipes(),
    membership: loadPeriods(),
    supplements: loadTaken(),
  };
}

/**
 * Merge by id, with the device winning.
 *
 * The same rule the rest of the restore follows: a backup is a snapshot of an
 * older moment, so on a genuine conflict the copy on the phone is the newer
 * edit. Rows that exist only in the backup are missing rows, not deleted ones,
 * and come back.
 */
function mergeById<T extends { id: string }>(incoming: T[], mine: T[]): T[] {
  const out = new Map<string, T>();
  for (const x of incoming) out.set(x.id, x);
  for (const x of mine) out.set(x.id, x);
  return [...out.values()];
}

/**
 * What the side stores should hold after folding a backup in.
 *
 * Pure, so the merge rules can be tested without a browser. `restoreSideStores`
 * is the half that writes.
 */
export function mergeSideStores(incoming: SideStores, mine: SideStores): SideStores {
  return {
    programs: mergeById(incoming.programs ?? [], mine.programs ?? []),
    // A programme is only "active" if one was chosen. Whatever this device is
    // on now beats whatever it was on when the backup was written.
    activeProgramId: mine.activeProgramId ?? incoming.activeProgramId ?? null,
    recipes: mergeById(incoming.recipes ?? [], mine.recipes ?? []),
    // Membership periods union rather than one side winning outright, for the
    // same reason habit day-marks do: a month that was paid for was paid for,
    // whichever copy remembers it.
    membership: mergeById(incoming.membership ?? [], mine.membership ?? []),
    // Likewise — a supplement ticked in either copy is one the user takes.
    supplements: [...new Set([...(incoming.supplements ?? []), ...(mine.supplements ?? [])])],
  };
}

/**
 * Fold a backup's side stores into this device and write them back.
 *
 * Returns what was written, so the caller can push the programmes into the
 * zustand copy without reading localStorage a second time. Returns null when
 * the backup carries no side stores at all.
 *
 * That null case matters more than it looks. Backups written before this
 * existed have no `sideStores`, and a "replace" restore of one must NOT be
 * read as "the user had no programmes" — clearing them would be precisely the
 * data loss this feature was added to prevent. An absent section means unknown,
 * so nothing is touched, in either mode.
 */
export function restoreSideStores(
  incoming: SideStores | undefined | null,
  mode: "merge" | "replace",
): SideStores | null {
  if (!incoming || typeof incoming !== "object") return null;

  const next =
    mode === "replace"
      ? {
          programs: incoming.programs ?? [],
          activeProgramId: incoming.activeProgramId ?? null,
          recipes: incoming.recipes ?? [],
          membership: incoming.membership ?? [],
          supplements: incoming.supplements ?? [],
        }
      : mergeSideStores(incoming, collectSideStores());

  savePrograms(next.programs ?? []);
  // saveActiveId takes an id; clearing the selection is not something the UI
  // can do, so "no programme" simply leaves the key alone.
  if (next.activeProgramId) saveActiveId(next.activeProgramId);
  saveRecipes(next.recipes ?? []);
  savePeriods(next.membership ?? []);
  saveTaken(next.supplements ?? []);

  // The screens that own these keys read them once into useState, so without a
  // nudge the calendar would still be showing the old membership bands until
  // the app was closed and reopened.
  try {
    window.dispatchEvent(new Event(SIDE_STORES_RESTORED));
  } catch {
    /* no window on the server, and nothing to refresh there either */
  }

  return next;
}

/** What a backup's side stores amount to, for the restore confirmation. */
export function sideStoreCounts(s: SideStores | undefined | null) {
  return {
    programs: s?.programs?.length ?? 0,
    recipes: s?.recipes?.length ?? 0,
    membership: s?.membership?.length ?? 0,
    supplements: s?.supplements?.length ?? 0,
  };
}
