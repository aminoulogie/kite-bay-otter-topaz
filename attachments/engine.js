// ==========================================================================
// The pure training/nutrition maths. No DOM, no Obsidian - which is exactly
// why it is the part covered by tests.
// ==========================================================================

const { getLocalDateKey, parseLocalDateKey } = require("./dates.js");
const { ROTATION_SEQUENCE } = require("./data.js");

class SomaIntelligenceEngine {
  static calculate1RM(weight, reps) {
    const w = parseFloat(weight) || 0;
    const r = parseInt(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    const epley = w * (1 + r / 30);
    const brzycki = r < 37 ? w * (36 / (37 - r)) : epley;
    return Math.round(((epley + brzycki) / 2) * 10) / 10;
  }

  static calculateWorkVolume(weight, reps, isBW = false, userBodyweight = 75) {
    const w = parseFloat(weight) || 0;
    const r = parseInt(reps) || 0;
    if (isBW && w === 0) return Math.round((userBodyweight * 0.65) * r);
    return Math.round(w * r);
  }

  static calculateCaloriesBurned(minutes, totalVolumeKg, totalSets, avgIntensity = 3) {
    const baseBurnPerMin = 6.0;
    const intensityMultiplier = 0.8 + (avgIntensity * 0.12);
    const volumeBonus = totalVolumeKg * 0.0055;
    return Math.max(20, Math.round((minutes * baseBurnPerMin * intensityMultiplier) + volumeBonus));
  }

  static calculatePlateStack(targetWeight, barWeight = 20, unit = "kg") {
    let perSide = (parseFloat(targetWeight) - barWeight) / 2;
    if (perSide <= 0) return [];
    const plateTypes = unit === "kg"
      ? [
          { weight: 25, color: "var(--soma-danger)" },
          { weight: 20, color: "#3b82f6" },
          { weight: 15, color: "#eab308" },
          { weight: 10, color: "var(--soma-accent)" },
          { weight: 5,  color: "var(--soma-text)" },
          { weight: 2.5,color: "#64748b" },
          { weight: 1.25,color: "var(--soma-text-dim)" }
        ]
      : [
          { weight: 45, color: "#3b82f6" },
          { weight: 35, color: "#eab308" },
          { weight: 25, color: "var(--soma-accent)" },
          { weight: 10, color: "var(--soma-text)" },
          { weight: 5,  color: "#64748b" }
        ];

    const EPSILON = 0.001;
    const plates = [];
    for (const p of plateTypes) {
      while (perSide - p.weight >= -EPSILON) {
        plates.push(p);
        perSide -= p.weight;
        if (perSide < EPSILON) perSide = 0;
      }
    }
    return plates;
  }

  static calculateWarmupRamp(targetWeight, barWeight = 20, unit = "kg") {
    const target = parseFloat(targetWeight) || 0;
    const percentages = [0.4, 0.6, 0.8];
    return percentages.map(pct => {
      let raw = target * pct;
      // Round to nearest achievable increment (2.5kg / 5lb) so the ramp is loadable
      const increment = unit === "kg" ? 2.5 : 5;
      let rounded = Math.round(raw / increment) * increment;
      if (rounded < barWeight) rounded = barWeight;
      return {
        pct: Math.round(pct * 100),
        weight: rounded,
        plates: this.calculatePlateStack(rounded, barWeight, unit)
      };
    });
  }

  static computeOverloadRecommendation(lastSet, isBW = false) {
    if (!lastSet) {
      return isBW
        ? { weight: 0, reps: 10, note: "BW Baseline Start", diffTier: "New" }
        : { weight: 20, reps: 10, note: "Baseline Start (Empty Bar / Light)", diffTier: "New" };
    }

    const lastW = parseFloat(lastSet.weight) || 0;
    const lastR = parseInt(lastSet.reps) || (isBW ? 10 : 8);
    const lastFail = parseInt(lastSet.failure) || 3;

    if (lastFail === 1) {
      if (isBW && lastW === 0) {
        return { weight: 0, reps: lastR + 2, note: `+2 Reps Target (Level 1 Easy RPE • Hit ${lastR}r)`, diffTier: "Lvl 1 (Surge)" };
      }
      return { weight: lastW + 5.0, reps: Math.max(8, lastR - 2), note: `+5.0kg Aggressive Load Surge (Level 1 RPE)`, diffTier: "Lvl 1 (Surge)" };
    } else if (lastFail === 2) {
      if (isBW && lastW === 0) {
        return { weight: 0, reps: lastR + 1, note: `+1 Rep Target (Level 2 Primed RPE)`, diffTier: "Lvl 2 (Overload)" };
      }
      return { weight: lastW + 2.5, reps: Math.max(8, lastR - 1), note: `+2.5kg Load Overload (Level 2 RPE • Previous: ${lastW}kg)`, diffTier: "Lvl 2 (Overload)" };
    } else if (lastFail === 3) {
      if (lastR >= 12 && !isBW) {
        return { weight: lastW + 2.5, reps: 8, note: `+2.5kg Step-Up (Reached 12-Rep Ceiling)`, diffTier: "Lvl 3 (Target)" };
      }
      return { weight: lastW, reps: lastR + 1, note: `+1 Rep Consolidation (Target: ${lastR + 1}r @ ${lastW > 0 ? lastW + 'kg' : 'BW'})`, diffTier: "Lvl 3 (Target)" };
    } else {
      return { weight: lastW, reps: lastR, note: `Hold Load & Solidify Form (Consolidate @ ${lastW > 0 ? lastW + 'kg' : 'BW'})`, diffTier: "Lvl 4-5 (Hold)" };
    }
  }

// --------------------------------------------------------------------
  // AUTOREGULATION LAYER
  // --------------------------------------------------------------------
  // computeOverloadRecommendation above is a pure progression ladder: it
  // sees one historical set and nothing else. Everything the app already
  // knows — how recovered the target muscle is, whether this is a deload
  // week, whether the lift has stalled — was being computed for display
  // and then thrown away. These methods fold that context back in.

  // Smallest increment that can actually be loaded on a bar, per unit.
  static loadIncrement(unit = "kg") {
    return unit === "lb" ? 5 : 2.5;
  }

  // Looks back over recent sessions for one exercise and reports whether
  // estimated 1RM is climbing, flat, or falling. `stalled` is the signal
  // the caller acts on: three sessions with no meaningful gain means the
  // linear ladder has run out and adding load will just bury the lifter.
  static computeVolumeTrend(history, exerciseName, lookback = 3) {
    if (!history || !exerciseName) return { points: [], direction: "unknown", stalled: false };

    const points = [];
    for (const session of Object.values(history)) {
      if (!session || !Array.isArray(session.exercises)) continue;
      const match = session.exercises.find(
        e => e.name && e.name.toLowerCase() === exerciseName.toLowerCase()
      );
      if (!match || !Array.isArray(match.sets)) continue;

      let best = 0;
      for (const s of match.sets) {
        // Drop sets are deliberately sub-maximal — counting them would
        // drag the trend line down and fake a stall.
        if (s.type === "dropset" || s.type === "warmup" || !s.done) continue;
        const raw = parseFloat(s.weight) || 0;
        const w = (match.usesBar && raw > 0) ? (match.barWeight || 20) + raw : raw;
        const est = this.calculate1RM(w, s.reps);
        if (est > best) best = est;
      }
      if (best > 0) points.push({ timestamp: session.timestamp || 0, est1RM: best });
    }

    points.sort((a, b) => a.timestamp - b.timestamp);
    const recent = points.slice(-lookback);
    if (recent.length < 2) return { points: recent, direction: "unknown", stalled: false };

    const first = recent[0].est1RM;
    const last = recent[recent.length - 1].est1RM;
    const pctChange = ((last - first) / first) * 100;

    let direction = "flat";
    if (pctChange > 1.5) direction = "up";
    else if (pctChange < -1.5) direction = "down";

    return {
      points: recent,
      direction,
      pctChange: Math.round(pctChange * 10) / 10,
      // Needs the full lookback window before it will call a stall, so a
      // single flat session doesn't trigger a regression.
      stalled: recent.length >= lookback && direction !== "up"
    };
  }

  // Wraps the progression ladder with the session's real context.
  // opts: { isBW, readiness (0-100|null), isDeload, unit, trend }
  // Returns the ladder's shape plus `autoNote` / `adjusted` so the UI can
  // show why the target differs from the raw progression.
  static computeAutoregulatedTarget(lastSet, opts = {}) {
    const {
      isBW = false,
      readiness = null,
      isDeload = false,
      unit = "kg",
      trend = null
    } = opts;

    const base = this.computeOverloadRecommendation(lastSet, isBW);
    const inc = this.loadIncrement(unit);
    const lastW = parseFloat(lastSet && lastSet.weight) || 0;
    const lastR = parseInt(lastSet && lastSet.reps) || (isBW ? 10 : 8);

    const out = { ...base, adjusted: false, autoNote: null, readiness };

    // 1. Deload week overrides everything else. Volume and intensity both
    //    come down; the point is to shed fatigue, not to inch forward.
    if (isDeload) {
      return {
        ...out,
        weight: isBW ? 0 : Math.max(0, Math.round((lastW * 0.6) / inc) * inc),
        reps: Math.max(5, Math.min(10, lastR)),
        adjusted: true,
        diffTier: "Deload",
        autoNote: "Deload week — 60% load, stop well short of failure.",
        note: "Deload: shed accumulated fatigue"
      };
    }

    // 2. Acute fatigue. The muscle has not recovered from its last
    //    stimulus, so adding load now buys nothing but risk.
    if (readiness !== null && readiness < 40) {
      return {
        ...out,
        weight: isBW ? 0 : Math.max(0, Math.round((lastW * 0.9) / inc) * inc),
        reps: Math.max(5, lastR - 1),
        adjusted: true,
        diffTier: "Under-recovered",
        autoNote: `Target muscle at ${readiness}% readiness — backing off 10%. Consider training something else today.`,
        note: "Autoregulated down: acute fatigue"
      };
    }

    // 3. Partially recovered. Allow a hold or a rep, but veto the
    //    aggressive load surge the ladder would otherwise prescribe.
    if (readiness !== null && readiness < 70) {
      const capped = !isBW && base.weight > lastW;
      return {
        ...out,
        weight: capped ? lastW : base.weight,
        reps: capped ? lastR + 1 : base.reps,
        adjusted: capped,
        diffTier: capped ? "Hold (Recovering)" : base.diffTier,
        autoNote: capped
          ? `Only ${readiness}% recovered — holding load, chasing a rep instead of weight.`
          : `${readiness}% recovered — proceed as planned.`
      };
    }

    // 4. Stalled lift on a recovered muscle. More load is not the answer;
    //    the ladder needs a different lever.
    if (trend && trend.stalled && !isDeload) {
      return {
        ...out,
        weight: base.weight,
        reps: base.reps,
        adjusted: true,
        diffTier: "Stalled",
        autoNote: `No estimated-1RM gain across the last ${trend.points.length} sessions. Hold this load for a week, add a set, or swap the variation.`
      };
    }

    // 5. Fully recovered and progressing — the ladder stands as computed.
    if (readiness !== null && readiness >= 90) {
      out.autoNote = `${readiness}% recovered — cleared for full progression.`;
    }
    return out;
  }

// ====================================================================
  // WEEKLY VOLUME LANDMARKS
  // --------------------------------------------------------------------
  // Hypertrophy volume is judged per muscle per week against three
  // landmarks: MEV (minimum to grow at all), MAV (the productive band)
  // and MRV (past which you accumulate more fatigue than you can
  // recover). Values are working sets per week, taken from the commonly
  // cited Renaissance Periodization ranges and rounded to whole sets.
  // ====================================================================
  static get VOLUME_LANDMARKS() {
    return {
      chest:          { mev: 8,  mav: 16, mrv: 22, label: "Chest" },
      upper_back:     { mev: 10, mav: 18, mrv: 25, label: "Back" },
      trapezius:      { mev: 4,  mav: 12, mrv: 20, label: "Traps" },
      trapezius_back: { mev: 4,  mav: 12, mrv: 20, label: "Traps" },
      deltoids:       { mev: 6,  mav: 16, mrv: 24, label: "Front Delts" },
      deltoids_back:  { mev: 6,  mav: 16, mrv: 24, label: "Rear Delts" },
      biceps:         { mev: 6,  mav: 14, mrv: 20, label: "Biceps" },
      triceps:        { mev: 6,  mav: 14, mrv: 20, label: "Triceps" },
      triceps_back:   { mev: 6,  mav: 14, mrv: 20, label: "Triceps" },
      forearm:        { mev: 2,  mav: 8,  mrv: 15, label: "Forearms" },
      forearm_back:   { mev: 2,  mav: 8,  mrv: 15, label: "Forearms" },
      quadriceps:     { mev: 8,  mav: 16, mrv: 22, label: "Quads" },
      hamstring:      { mev: 6,  mav: 14, mrv: 20, label: "Hamstrings" },
      gluteal:        { mev: 4,  mav: 12, mrv: 18, label: "Glutes" },
      adductors:      { mev: 4,  mav: 10, mrv: 16, label: "Adductors" },
      adductors_back: { mev: 4,  mav: 10, mrv: 16, label: "Adductors" },
      calves:         { mev: 6,  mav: 14, mrv: 22, label: "Calves" },
      calves_back:    { mev: 6,  mav: 14, mrv: 22, label: "Calves" },
      abs:            { mev: 4,  mav: 12, mrv: 20, label: "Abs" },
      obliques:       { mev: 3,  mav: 10, mrv: 16, label: "Obliques" },
      lower_back:     { mev: 3,  mav: 8,  mrv: 14, label: "Lower Back" },
      tibialis:       { mev: 2,  mav: 6,  mrv: 12, label: "Tibialis" },
      neck:           { mev: 2,  mav: 6,  mrv: 12, label: "Neck" }
    };
  }

  // Where a set count sits relative to that muscle's landmarks.
  static volumeStatus(sets, lm) {
    if (!lm) return { tier: "unknown", note: "" };
    if (sets === 0)      return { tier: "none",     note: "Not trained this week" };
    if (sets < lm.mev)   return { tier: "under",    note: `Below MEV (${lm.mev}) — add ${lm.mev - sets} set${lm.mev - sets === 1 ? "" : "s"}` };
    if (sets <= lm.mav)  return { tier: "optimal",  note: `In the productive range (${lm.mev}-${lm.mav})` };
    if (sets <= lm.mrv)  return { tier: "high",     note: `Above MAV (${lm.mav}) — sustainable only if recovery holds` };
    return { tier: "over", note: `Past MRV (${lm.mrv}) — cut ${sets - lm.mrv} set${sets - lm.mrv === 1 ? "" : "s"}` };
  }

  // Working sets per muscle over the last `days`. Warm-ups and drop sets
  // are excluded: neither is a stimulating working set, and counting them
  // would make you look far better trained than you are.
  static weeklyVolumeByMuscle(history, days = 7, now = Date.now()) {
    const cutoff = now - days * 86400000;
    const totals = {};

    for (const session of Object.values(history || {})) {
      if (!session || typeof session !== "object") continue;
      if ((session.timestamp || 0) < cutoff) continue;

      for (const ex of (session.exercises || [])) {
        const keys = Array.isArray(ex.targetKeys) ? ex.targetKeys : [];
        if (!keys.length) continue;

        const working = (ex.sets || []).filter(
          s => s.done && s.type !== "warmup" && s.type !== "dropset"
        ).length;
        if (!working) continue;

        for (const k of keys) totals[k] = (totals[k] || 0) + working;
      }
    }
    return totals;
  }

  // Full report: one row per muscle that has landmarks, sorted worst first
  // so what needs attention is at the top.
  static volumeReport(history, days = 7, now = Date.now()) {
    const lms = this.VOLUME_LANDMARKS;
    const cutoff = now - days * 86400000;

    // Credit each exercise's working sets once per LABEL, not once per key.
    // "triceps" and "triceps_back" are the same muscle wearing two keys, and
    // most pressing movements list both — summing the keys would report
    // double the sets actually performed.
    const byLabel = {};
    for (const session of Object.values(history || {})) {
      if (!session || typeof session !== "object") continue;
      if ((session.timestamp || 0) < cutoff) continue;

      for (const ex of (session.exercises || [])) {
        const working = (ex.sets || []).filter(
          s => s.done && s.type !== "warmup" && s.type !== "dropset"
        ).length;
        if (!working) continue;

        const labels = new Set();
        for (const k of (Array.isArray(ex.targetKeys) ? ex.targetKeys : [])) {
          if (lms[k]) labels.add(lms[k].label);
        }
        for (const label of labels) byLabel[label] = (byLabel[label] || 0) + working;
      }
    }

    const seen = new Set();
    const rows = [];
    for (const key of Object.keys(lms)) {
      const lm = lms[key];
      if (seen.has(lm.label)) continue;
      seen.add(lm.label);
      const sets = byLabel[lm.label] || 0;
      rows.push({ key, label: lm.label, sets, ...lm, ...this.volumeStatus(sets, lm) });
    }

    const order = { over: 0, under: 1, none: 2, high: 3, optimal: 4 };
    rows.sort((a, b) => (order[a.tier] - order[b.tier]) || (b.sets - a.sets));
    return rows;
  }

  // ====================================================================
  // REST TIMING
  // --------------------------------------------------------------------
  // The rest timer used to run one duration for everything, which made
  // the superset and drop-set tags decorative.
  // ====================================================================
  static restForSet(ex, set, allExercises, settings) {
    const def = (settings && settings.restDefault) || 90;
    if (!set) return { seconds: def, reason: "Standard rest" };

    if (set.type === "warmup") {
      return { seconds: Math.min(30, Math.round(def * 0.3)), reason: "Warm-up — brief rest" };
    }
    if (set.type === "dropset") {
      return { seconds: 15, reason: "Drop set — minimal rest, keep the burn" };
    }

    // Inside a superset group you move straight to the partner exercise;
    // rest only comes after the last member of the group.
    const group = ex && ex.supersetGroup;
    if (group) {
      const members = (allExercises || []).filter(e => e.supersetGroup === group);
      if (members.length > 1) {
        const idx = members.findIndex(e => e === ex);
        const isLast = idx === members.length - 1;
        if (!isLast) {
          const next = members[idx + 1];
          return { seconds: 0, reason: `Superset ${group} — go straight to ${next.name}`, nextExercise: next.name };
        }
        return { seconds: def, reason: `End of superset ${group} — full rest` };
      }
    }
    return { seconds: def, reason: "Standard rest" };
  }

  // ====================================================================
  // EXERCISE SUBSTITUTION
  // --------------------------------------------------------------------
  // When a muscle is too fatigued to train hard, name what to do instead
  // rather than just saying "train something else".
  // ====================================================================
  static suggestAlternatives(exercise, exerciseDB, readinessByMuscle, limit = 3) {
    if (!exercise || !Array.isArray(exerciseDB)) return [];
    const own = new Set(Array.isArray(exercise.targetKeys) ? exercise.targetKeys : []);
    const readinessOf = (keys) => {
      const vals = (keys || [])
        .map(k => (readinessByMuscle || {})[k])
        .filter(v => typeof v === "number");
      return vals.length ? Math.min(...vals) : 100;
    };
    const mine = readinessOf([...own]);

    return exerciseDB
      .filter(c => c.name !== exercise.name)
      .map(c => {
        const keys = Array.isArray(c.targetKeys) ? c.targetKeys : [];
        const overlap = keys.filter(k => own.has(k)).length;
        return { ex: c, overlap, readiness: readinessOf(keys), isAxial: !!c.isAxial };
      })
      // Two ways an alternative earns its place: it trains the same muscle
      // while being meaningfully fresher, OR it trains the same muscle while
      // dropping a fatigued secondary — swapping a Barbell Row for a
      // chest-supported one spares a fried lower back even though the lats
      // are equally tired either way.
      .filter(c => {
        if (c.overlap === 0) return false;
        if (c.readiness > mine + 10) return true;
        const keys = new Set(Array.isArray(c.ex.targetKeys) ? c.ex.targetKeys : []);
        const dropsFatigued = [...own].some(k => {
          const r = (readinessByMuscle || {})[k];
          return typeof r === "number" && r < 60 && !keys.has(k);
        });
        return dropsFatigued && c.readiness >= mine;
      })
      .sort((a, b) =>
        (b.readiness - a.readiness) ||
        (a.isAxial === b.isAxial ? 0 : a.isAxial ? 1 : -1) ||
        (b.overlap - a.overlap)
      )
      .slice(0, limit)
      .map(c => ({
        name: c.ex.name,
        readiness: Math.round(c.readiness),
        subTarget: c.ex.subTarget || c.ex.muscle || "",
        isAxial: c.isAxial,
        note: c.isAxial ? "still axially loaded" : "lower spinal load"
      }));
  }

  // ====================================================================
  // SUBJECTIVE READINESS
  // --------------------------------------------------------------------
  // Sleep, soreness and stress, folded into a single 0-100 modifier that
  // the autoregulator treats the same way it treats muscle readiness.
  // ====================================================================
  static computeSubjectiveReadiness({ sleepHours = null, sleepQuality = null, soreness = null, stress = null } = {}) {
    const parts = [];

    if (sleepHours !== null && !isNaN(parseFloat(sleepHours))) {
      const h = parseFloat(sleepHours);
      // 8h is the reference; below ~5h performance falls off a cliff.
      parts.push({ w: 2.0, v: Math.max(0, Math.min(100, ((h - 4) / 4) * 100)) });
    }
    if (sleepQuality !== null && !isNaN(parseInt(sleepQuality))) {
      parts.push({ w: 1.0, v: ((Math.min(5, Math.max(1, parseInt(sleepQuality))) - 1) / 4) * 100 });
    }
    // Soreness and stress are 1 (none) to 5 (severe) — inverted.
    if (soreness !== null && !isNaN(parseInt(soreness))) {
      parts.push({ w: 1.5, v: ((5 - Math.min(5, Math.max(1, parseInt(soreness)))) / 4) * 100 });
    }
    if (stress !== null && !isNaN(parseInt(stress))) {
      parts.push({ w: 1.0, v: ((5 - Math.min(5, Math.max(1, parseInt(stress)))) / 4) * 100 });
    }

    if (!parts.length) return null;
    const wsum = parts.reduce((a, p) => a + p.w, 0);
    const score = parts.reduce((a, p) => a + p.w * p.v, 0) / wsum;
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  // Blends muscle readiness with how the lifter actually feels. Subjective
  // state can only pull the figure down — feeling great does not make an
  // unrecovered muscle recovered.
  static blendReadiness(muscleReadiness, subjective) {
    if (muscleReadiness === null || muscleReadiness === undefined) return subjective ?? null;
    if (subjective === null || subjective === undefined) return muscleReadiness;
    if (subjective >= 70) return muscleReadiness;
    // A poor subjective score scales the muscle figure down, floored so a
    // terrible night never reads as total incapacity.
    const factor = 0.55 + (subjective / 70) * 0.45;
    return Math.round(Math.max(10, muscleReadiness * factor));
  }

// ====================================================================
  // MAINTENANCE CALORIES FROM REAL DATA
  // --------------------------------------------------------------------
  // bodyweight x 32 is a population average that says nothing about the
  // person in front of it. If intake and weight are both logged, the true
  // figure falls straight out of energy balance:
  //
  //   maintenance = average intake - (weight change in kcal / days)
  //
  // using 7700 kcal per kg of body mass. It self-corrects as metabolism
  // adapts, which no formula can do.
  // ====================================================================
  static KCAL_PER_KG() { return 7700; }

  // Pulls {date, cals, weight} for every day that has data.
  static nutritionSeries(nutritionDB) {
    const out = [];
    for (const [key, day] of Object.entries(nutritionDB || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== "object") continue;
      const items = Array.isArray(day.items) ? day.items : [];
      const meals = day.meals && typeof day.meals === "object"
        ? Object.values(day.meals).flat().filter(Boolean)
        : [];
      const all = items.concat(meals);
      const cals = all.reduce((a, i) => a + (parseFloat(i && i.cals) || 0), 0);
      const weight = parseFloat(day.bodyWeight);
      out.push({
        date: key,
        cals: Math.round(cals),
        loggedFood: all.length > 0,
        weight: (!isNaN(weight) && weight > 0) ? weight : null
      });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }

  // Needs both ends of a weight trend and enough food logs in between to
  // mean anything. Returns null rather than a confident-looking guess.
  static computeMaintenanceCalories(nutritionDB, opts = {}) {
    const { minDays = 10, minFoodDays = 5, window = 28 } = opts;
    const series = this.nutritionSeries(nutritionDB);
    if (!series.length) return null;

    const recent = series.slice(-window);
    const weighed = recent.filter(d => d.weight !== null);
    const fed = recent.filter(d => d.loggedFood && d.cals > 0);

    if (weighed.length < 2 || fed.length < minFoodDays) {
      return {
        ok: false,
        reason: weighed.length < 2
          ? "Log your weight on at least two different days."
          : `Log food on ${minFoodDays - fed.length} more day${minFoodDays - fed.length === 1 ? "" : "s"}.`,
        foodDays: fed.length,
        weighDays: weighed.length
      };
    }

    const first = weighed[0];
    const last = weighed[weighed.length - 1];
    const days = Math.round(
      (parseLocalDateKey(last.date) - parseLocalDateKey(first.date)) / 86400000
    );
    if (days < minDays) {
      return {
        ok: false,
        reason: `Needs ${minDays} days between weigh-ins — you have ${days}.`,
        foodDays: fed.length,
        weighDays: weighed.length
      };
    }

    const avgIntake = fed.reduce((a, d) => a + d.cals, 0) / fed.length;
    const weightDelta = last.weight - first.weight;
    // Positive delta means a surplus was eaten, so maintenance sits below
    // average intake by that much per day.
    const dailyImbalance = (weightDelta * this.KCAL_PER_KG()) / days;
    const maintenance = Math.round(avgIntake - dailyImbalance);

    return {
      ok: true,
      maintenance,
      avgIntake: Math.round(avgIntake),
      weightDelta: Math.round(weightDelta * 100) / 100,
      days,
      foodDays: fed.length,
      weighDays: weighed.length,
      startWeight: first.weight,
      endWeight: last.weight,
      // A sanity band: energy balance from short, noisy logs is an estimate.
      confidence: fed.length >= 14 && days >= 21 ? "good"
                : fed.length >= 8  && days >= 14 ? "fair"
                : "rough"
    };
  }

  // The formula estimate, kept for comparison rather than as the answer.
  static formulaMaintenance(weightKg) {
    const w = parseFloat(weightKg);
    return (!isNaN(w) && w > 0) ? Math.round(w * 32) : null;
  }

  // Protein target from bodyweight. Central so the Weight tab, the macro
  // diary and the settings screen cannot drift apart.
  static proteinTargetFor(weightKg, perKg = 2.0) {
    const w = parseFloat(weightKg);
    const p = parseFloat(perKg);
    if (isNaN(w) || w <= 0) return null;
    return Math.round(w * (isNaN(p) || p <= 0 ? 2.0 : p));
  }

// ====================================================================
  // TRAINING CONSISTENCY
  // --------------------------------------------------------------------
  // The habit tracker has had streaks since day one; training has not.
  // Streaks are counted in WEEKS rather than days, because a rest day is
  // part of the plan and should never break a streak.
  // ====================================================================

  // Monday-based week key, so a week is a training block rather than a
  // calendar accident.
  static weekKeyOf(dateObj) {
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const dow = (d.getDay() + 6) % 7;           // Mon = 0
    d.setDate(d.getDate() - dow);
    return getLocalDateKey(d);
  }

  static computeConsistency(history, opts = {}) {
    const { sessionsPerWeek = 4, weeks = 8, now = Date.now() } = opts;

    // Sessions grouped by the week they fall in.
    const byWeek = {};
    const dates = [];
    for (const [key, session] of Object.entries(history || {})) {
      if (!session || typeof session !== "object" || !Array.isArray(session.exercises)) continue;
      const ts = session.timestamp || (/^\d{4}-\d{2}-\d{2}$/.test(key) ? parseLocalDateKey(key).getTime() : 0);
      if (!ts) continue;
      const d = new Date(ts);
      const wk = this.weekKeyOf(d);
      byWeek[wk] = (byWeek[wk] || 0) + 1;
      dates.push(getLocalDateKey(d));
    }

    // Walk back week by week from the current one.
    const thisWeek = this.weekKeyOf(new Date(now));
    const weekList = [];
    for (let i = 0; i < weeks; i++) {
      const d = parseLocalDateKey(thisWeek);
      d.setDate(d.getDate() - i * 7);
      const k = this.weekKeyOf(d);
      weekList.push({ week: k, sessions: byWeek[k] || 0, hit: (byWeek[k] || 0) >= sessionsPerWeek });
    }

    // Current streak: consecutive weeks meeting the target. The week in
    // progress never breaks it, whether it has two sessions logged or none
    // yet — it simply is not over. Only completed weeks can end a run.
    let current = 0;
    for (let i = 0; i < weekList.length; i++) {
      if (weekList[i].hit) { current++; continue; }
      if (i === 0) continue;
      break;
    }

    // Best streak across every week that has any data.
    const allWeeks = Object.keys(byWeek).sort();
    let best = 0, run = 0, cursor = null;
    for (const w of allWeeks) {
      if (cursor !== null) {
        const gap = Math.round((parseLocalDateKey(w) - parseLocalDateKey(cursor)) / (7 * 86400000));
        if (gap > 1) run = 0;
      }
      run = byWeek[w] >= sessionsPerWeek ? run + 1 : 0;
      if (run > best) best = run;
      cursor = w;
    }

    const planned = weeks * sessionsPerWeek;
    const done = weekList.reduce((a, w) => a + Math.min(w.sessions, sessionsPerWeek), 0);

    return {
      currentStreak: current,
      bestStreak: Math.max(best, current),
      thisWeek: weekList[0].sessions,
      target: sessionsPerWeek,
      adherence: planned > 0 ? Math.round((done / planned) * 100) : 0,
      weeks: weekList.reverse(),
      totalSessions: dates.length,
      // Days of the current week that have a session, Monday first.
      weekDays: (() => {
        const start = parseLocalDateKey(thisWeek);
        const set = new Set(dates);
        return Array.from({ length: 7 }, (_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const key = getLocalDateKey(d);
          return { date: key, done: set.has(key), future: d.getTime() > now };
        });
      })()
    };
  }

  // ====================================================================
  // STRENGTH OVER TIME
  // --------------------------------------------------------------------
  // Estimated 1RM per session for one lift, with PRs marked. The maths is
  // the same as PR detection uses; this just exposes it as a series.
  // ====================================================================
  static strengthSeries(history, exerciseName) {
    if (!history || !exerciseName) return [];
    const points = [];

    for (const session of Object.values(history)) {
      if (!session || !Array.isArray(session.exercises)) continue;
      const match = session.exercises.find(
        e => e.name && e.name.toLowerCase() === exerciseName.toLowerCase()
      );
      if (!match || !Array.isArray(match.sets)) continue;

      let best = 0, bestSet = null, bestReps = 0, repsSet = null;
      for (const s of match.sets) {
        // Warm-ups and drop sets are not attempts at a maximum.
        if (!s.done || s.type === "warmup" || s.type === "dropset") continue;
        const raw = parseFloat(s.weight) || 0;
        const w = (match.usesBar && raw > 0) ? (match.barWeight || 20) + raw : raw;
        const reps = parseInt(s.reps) || 0;
        const est = this.calculate1RM(w, s.reps);
        if (est > best) { best = est; bestSet = { weight: w, reps }; }
        if (reps > bestReps) { bestReps = reps; repsSet = { weight: w, reps }; }
      }

      const ts = session.timestamp || 0;
      const dateStr = ts ? getLocalDateKey(new Date(ts)) : "";
      if (best > 0) {
        points.push({
          timestamp: ts, date: dateStr, metric: "est1RM",
          est1RM: Math.round(best * 10) / 10,
          weight: bestSet.weight, reps: bestSet.reps
        });
      } else if (bestReps > 0) {
        // Unloaded bodyweight work has no meaningful 1RM — an estimate from
        // zero load is zero. Reps are what actually progress there, so the
        // series switches metric rather than reporting nothing at all.
        points.push({
          timestamp: ts, date: dateStr, metric: "reps",
          est1RM: bestReps,
          weight: repsSet.weight, reps: repsSet.reps
        });
      }
    }

    points.sort((a, b) => a.timestamp - b.timestamp);
    // Mark each point that beat everything before it.
    let running = 0;
    for (const p of points) {
      p.isPR = p.est1RM > running;
      if (p.isPR) running = p.est1RM;
    }
    return points;
  }

  // Every exercise with at least one completed working set, most recent
  // first — the picker list for the strength chart.
  static loggedExerciseNames(history) {
    const seen = new Map();
    for (const session of Object.values(history || {})) {
      if (!session || !Array.isArray(session.exercises)) continue;
      for (const ex of session.exercises) {
        if (!ex.name) continue;
        const has = (ex.sets || []).some(
          s => s.done && s.type !== "warmup" && s.type !== "dropset"
        );
        if (!has) continue;
        const ts = session.timestamp || 0;
        if (!seen.has(ex.name) || seen.get(ex.name) < ts) seen.set(ex.name, ts);
      }
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  }

// ====================================================================
  // ROUTINE STORAGE
  // --------------------------------------------------------------------
  // Routines shipped hardcoded in this file, so changing one meant editing
  // source. They now live in the settings file. The built-in presets stay
  // as the fallback and the seed for a first edit, which also means a
  // plugin update can never wipe a routine the user built.
  // ====================================================================
  static mergeRoutines(builtIn, custom) {
    const out = {};
    // Deleted built-ins are remembered so they do not reappear on reload.
    const removed = new Set((custom && custom._removed) || []);
    for (const [name, list] of Object.entries(builtIn || {})) {
      if (!removed.has(name)) out[name] = list;
    }
    for (const [name, list] of Object.entries(custom || {})) {
      if (name.startsWith("_")) continue;
      if (Array.isArray(list)) out[name] = list;
    }
    return out;
  }

  // Anything stored must be {name} objects with a non-empty name.
  static normalizeRoutine(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(i => (typeof i === "string" ? { name: i } : i))
      .filter(i => i && typeof i.name === "string" && i.name.trim())
      .map(i => ({ name: i.name.trim() }));
  }

  // Returns { ok, error } so callers can refuse a bad name with a reason.
  static validateRoutineName(name, existing, originalName = null) {
    const n = (name || "").trim();
    if (!n) return { ok: false, error: "Give the routine a name." };
    if (n.length > 60) return { ok: false, error: "Name is too long (60 characters max)." };
    if (n.startsWith("_")) return { ok: false, error: "Names cannot start with an underscore." };
    if (n !== originalName && Object.prototype.hasOwnProperty.call(existing || {}, n)) {
      return { ok: false, error: "A routine called that already exists." };
    }
    return { ok: true, name: n };
  }

  static getProgramProjectedDay(targetDateObj, scheduleOverrides = {}) {
    const anchorDate = new Date(2026, 7, 23, 12, 0, 0); // Aligned to Aug 23 Base Anchor
    const targetMidday = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 12, 0, 0);
    const dateKey = getLocalDateKey(targetMidday);

    if (scheduleOverrides && scheduleOverrides[dateKey]) {
      const customSplit = scheduleOverrides[dateKey];
      const isRest = customSplit.toLowerCase().includes("rest");
      return { split: customSplit, phase: "Custom Schedule Alignment", phaseBadge: "User Overridden", repScheme: "8–12 Reps • 2–3 RIR", isDeload: false, isRest };
    }

    const diffTime = targetMidday.getTime() - anchorDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.max(1, Math.floor(diffDays / 7) + 1);

    let phase = "Mesocycle 1: Hypertrophy Foundation";
    let phaseBadge = `Meso 1 (W${totalWeeks}) • Base`;
    let repScheme = "8–12 Reps • 2–3 RIR";
    let isDeload = false;

    if (totalWeeks === 9 || totalWeeks === 18) {
      phase = "Deload & Connective Recovery";
      phaseBadge = "Deload Week • 50% Sets";
      repScheme = "8–10 Reps • 4–5 RIR";
      isDeload = true;
    } else if (totalWeeks >= 10 && totalWeeks <= 17) {
      phase = "Mesocycle 2: Strength & Load Progression";
      phaseBadge = `Meso 2 (W${totalWeeks - 9}) • Strength`;
      repScheme = "5–8 Reps • 1–2 RIR";
    }

    const seqLen = ROTATION_SEQUENCE.length;
    const seqIndex = ((diffDays % seqLen) + seqLen) % seqLen;
    const splitName = ROTATION_SEQUENCE[seqIndex];
    const isRest = splitName.toLowerCase().includes("rest");

    return { split: splitName, phase, phaseBadge, repScheme, isDeload, isRest, weekNumber: totalWeeks };
  }

  static detectPersonalRecords(history, currentExerciseName, newWeight, newReps) {
    const w = parseFloat(newWeight) || 0;
    const r = parseInt(newReps) || 0;
    if (w <= 0 || r <= 0) return null;

    const currentEst1RM = this.calculate1RM(w, r);
    let maxPreviousWeight = 0;
    let maxPreviousRepsAtWeight = 0;
    let maxPreviousEst1RM = 0;

    for (const session of Object.values(history || {})) {
      for (const ex of session.exercises || []) {
        if (ex.name && ex.name.toLowerCase() === currentExerciseName.toLowerCase()) {
          for (const s of ex.sets || []) {
            if (s.done && s.type !== "warmup") {
              const rawW = parseFloat(s.weight) || 0;
              const prevW = (ex.usesBar && rawW > 0) ? (ex.barWeight || 20) + rawW : rawW;
              const prevR = parseInt(s.reps) || 0;
              if (prevW > maxPreviousWeight) maxPreviousWeight = prevW;
              if (prevW === w && prevR > maxPreviousRepsAtWeight) maxPreviousRepsAtWeight = prevR;
              const est = this.calculate1RM(prevW, prevR);
              if (est > maxPreviousEst1RM) maxPreviousEst1RM = est;
            }
          }
        }
      }
    }

    const isWeightPR = maxPreviousWeight > 0 && w > maxPreviousWeight;
    const isRepPR = maxPreviousRepsAtWeight > 0 && r > maxPreviousRepsAtWeight;
    const isEst1RMPR = maxPreviousEst1RM > 0 && currentEst1RM > maxPreviousEst1RM;

    if (isWeightPR || isRepPR || isEst1RMPR) {
      return { isWeightPR, isRepPR, isEst1RMPR, weight: w, reps: r, est1RM: currentEst1RM, prev1RM: maxPreviousEst1RM };
    }
    return null;
  }
}

// ============================================================
// SECTION 3: AUDIO SYNTHESIZER & CELEBRATION ENGINE
// ============================================================

module.exports = { SomaIntelligenceEngine };
