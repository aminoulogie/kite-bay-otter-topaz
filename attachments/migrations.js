// ==========================================================================
// Schema versioning and the self-healing migrations for the history and
// nutrition files.
// ==========================================================================

const { getLocalDateKey } = require("./dates.js");

// ============================================================================
// SCHEMA VERSIONING & HISTORY MIGRATION
// ----------------------------------------------------------------------------
// soma-history.json accumulated three kinds of drift over earlier versions:
//   1. Empty sessions saved from template notes, keyed by the note title
//      ("daily template") instead of a date. These polluted every aggregate
//      that walks Object.values(history) — the Recovery HUD, PR detection
//      and 14-day volume all counted them.
//   2. Mixed field types — `failure`, `weight` and `reps` were stored as
//      strings by the input handlers but as numbers by the seed paths.
//   3. Fields added after the fact (`type`, `supersetGroup`, `usesBar`)
//      missing entirely on older sets and exercises.
// migrateHistory() is idempotent and runs on every read, so the file heals
// itself once and stays normalized regardless of which version wrote it.
// ============================================================================

const SOMA_SCHEMA_VERSION = 1;

const isDateKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);

function sessionIsEmpty(session) {
  if (!session || typeof session !== "object") return true;
  const exercises = Array.isArray(session.exercises) ? session.exercises : [];
  if (exercises.length === 0) return true;
  // A session with exercises but not one logged set is an abandoned shell.
  return !exercises.some(ex => Array.isArray(ex.sets) && ex.sets.length > 0);
}

function normalizeSet(s) {
  const num = (v, fallback) => {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  };
  return {
    ...s,
    weight: num(s.weight, 0),
    reps: Math.round(num(s.reps, 0)),
    failure: Math.min(5, Math.max(1, Math.round(num(s.failure, 3)))),
    done: !!s.done,
    type: s.type === "dropset" ? "dropset" : "normal"
  };
}

function normalizeExercise(ex) {
  return {
    ...ex,
    isBW: !!ex.isBW,
    isAxial: !!ex.isAxial,
    usesBar: !!ex.usesBar,
    supersetGroup: typeof ex.supersetGroup === "string" ? ex.supersetGroup : "",
    targetKeys: Array.isArray(ex.targetKeys) ? ex.targetKeys : [],
    sets: (Array.isArray(ex.sets) ? ex.sets : []).map(normalizeSet)
  };
}

// Returns { history, changed, report } — `changed` tells the caller whether
// the normalized copy needs writing back to disk.
function migrateHistory(raw) {
  const report = { dropped: [], normalized: 0, alreadyCurrent: false };
  if (!raw || typeof raw !== "object") return { history: {}, changed: false, report };

  if (raw._schemaVersion === SOMA_SCHEMA_VERSION) {
    report.alreadyCurrent = true;
  }

  const out = {};
  let changed = false;

  for (const [key, session] of Object.entries(raw)) {
    if (key === "_schemaVersion") continue;

    if (sessionIsEmpty(session)) {
      report.dropped.push(key);
      changed = true;
      continue;
    }

    // Recover a usable date key for legacy title-keyed sessions.
    let outKey = key;
    if (!isDateKey(key)) {
      const fromTimestamp = typeof session.timestamp === "number"
        ? getLocalDateKey(new Date(session.timestamp))
        : null;
      outKey = fromTimestamp || getLocalDateKey(new Date());
      changed = true;
      // Never clobber a real dated session with a recovered one.
      while (out[outKey]) outKey = `${outKey}~recovered`;
    }

    const before = JSON.stringify(session);
    const migrated = {
      ...session,
      exercises: (Array.isArray(session.exercises) ? session.exercises : []).map(normalizeExercise)
    };
    if (JSON.stringify(migrated) !== before) {
      changed = true;
      report.normalized++;
    }
    out[outKey] = migrated;
  }

  if (raw._schemaVersion !== SOMA_SCHEMA_VERSION) changed = true;
  out._schemaVersion = SOMA_SCHEMA_VERSION;

  return { history: out, changed, report };
}

// Nutrition file cleanup, mirroring the history migration. Same cause: a
// widget opened inside an untitled or template note saved a day record keyed
// by the note title. Only entries holding no data at all are dropped — an
// orphaned key that still contains a logged food, a weight or a water total
// is kept and reported, because deleting real entries is the user's call.
function nutritionEntryIsEmpty(entry) {
  if (!entry || typeof entry !== "object") return true;
  const items = Array.isArray(entry.items) ? entry.items.length : 0;
  const meals = entry.meals && typeof entry.meals === "object"
    ? Object.values(entry.meals).reduce((a, m) => a + (Array.isArray(m) ? m.length : 0), 0)
    : 0;
  const hasBody = parseFloat(entry.bodyWeight) > 0;
  const hasWater = parseFloat(entry.water) > 0;
  const hasCreatine = parseFloat(entry.creatine) > 0;
  return items === 0 && meals === 0 && !hasBody && !hasWater && !hasCreatine;
}

function migrateNutrition(raw) {
  const report = { dropped: [], orphanedWithData: [] };
  if (!raw || typeof raw !== "object") return { nutrition: {}, changed: false, report };

  const out = {};
  let changed = false;

  for (const [key, entry] of Object.entries(raw)) {
    // Metadata keys (_settings, __defaultGoals) always pass through.
    if (key.startsWith("_")) { out[key] = entry; continue; }

    if (isDateKey(key)) { out[key] = entry; continue; }

    if (nutritionEntryIsEmpty(entry)) {
      report.dropped.push(key);
      changed = true;
      continue;
    }

    // Keyed by a note title but holds real data — keep it untouched and
    // surface it rather than guessing which day it belonged to.
    report.orphanedWithData.push(key);
    out[key] = entry;
  }

  return { nutrition: out, changed, report };
}

// ============================================================================
// THEME ENGINE
// ----------------------------------------------------------------------------
// Two settings drive the whole look: `theme` ("dark" | "light" | "system") and
// `accent` (any CSS colour). Applied by stamping a data attribute and one
// inline custom property on a widget root — every stylesheet rule reads
// through those tokens, so nothing else has to know a theme changed.
// ============================================================================

module.exports = { SOMA_SCHEMA_VERSION, isDateKey, sessionIsEmpty, normalizeSet, normalizeExercise, migrateHistory, nutritionEntryIsEmpty, migrateNutrition };
