# Jeff Nippard Ultimate Push-Pull-Legs — Technical Spec

Status: **design**. Applies to the SOMA workout surface (`src/lib/autoregulate.ts`,
`src/lib/stimulus.ts`, `src/lib/set-quality.ts`, `src/components/views/WorkoutView.tsx`).

---

## Data model

### Set

Extend `WorkoutSet` (see `src/lib/types.ts`) with optional, backwards-compatible fields.
Old sessions load unchanged; new fields are absent by default.

```ts
type SetType = "warmup" | "feeder" | "working" | "dropset" | "stretch";
type GripOrientation = "pronated" | "supinated" | "neutral";
type CableVector = "low-high" | "mid" | "high-low";
type RomTag = "full" | "lengthened" | "shortened";

interface WorkoutSet {
  // …existing: weight, reps, done, type, failure, burn, form…
  type: SetType;              // NEW: "feeder" | "stretch" join existing
  rpe?: number | null;        // NEW: 5..10.5 (10.5 = "10+"), halves allowed
  grip?: {                    // NEW: omni-grip
    width: "wide" | "medium" | "narrow";
    orientation: GripOrientation;
    vector?: CableVector;     // cable exercises only
  };
  rom?: RomTag;               // NEW
  partialReps?: number;       // NEW: e.g. 10 full + 5 partials
  dropChildren?: string[];    // NEW: ids of nested drop sets (or inline)
  stretchSeconds?: number;    // NEW: only when type === "stretch"
  parentSetId?: string;       // NEW: for nested drop sets
}
```

### Exercise

```ts
interface SessionExercise {
  // …existing: name, muscle, subTarget, targetKeys, sets…
  gripSequence?: Grip[];        // NEW: preset per-set grips (omni-grip)
  substitutions?: string[];     // NEW: pre-configured alternatives by name
  feederRamp?: boolean;         // NEW: whether the ramp generator applies
}
```

### Tier → set-type mapping (Jeff Nippard ULPPL)

Feeder sets are a *working-set ramp*, not warmups: warmups are `warmup`, the ramp
is `feeder`, the top set is `working`.

---

## 1. Feeder sets & dynamic target scaling

**UI flow**
1. In a set row, the type chip cycles `Warmup → Feeder → Working → Drop → Stretch`.
2. When a `working` set has a target weight and a "Feeder ramp" toggle is on, a
   **"Auto-fill feeder ramp"** button appears above it.
3. Tapping it inserts three `feeder` sets above the working set.

**Generator** (pure fn `feederRamp(targetWeight, unit)` in `autoregulate.ts`)

| Feeder | % target | reps | target RPE |
|---|---|---|---|
| 1 | 50% | 10 | 4–5 |
| 2 | 70% | 10 | 6 |
| 3 | 85–90% | 10 | 7–8 |

Weight rounds to the smallest loadable increment (2.5 kg / 5 lb — reuse
`SomaIntelligenceEngine.loadIncrement`).

**Real-time adjustment** — on Feeder 3 rating (after the survey or quick-log):

| Feeder 3 RPE | Action |
|---|---|
| ≥ 9 | working target −5% |
| ≤ 6 | working target +5% |
| 7–8 | unchanged |

Shown as an inline chip ("−5% — feeder felt heavy") on the working set, never
silent — the lifter must be able to see and override.

**Analytics** — `feeder` and `warmup` sets are excluded from volume/fatigue
strain (`stimulus.ts` already keys on `done` sets; add `type !== "feeder"` to the
`workingSets` filter) but retained in set history and set-quality scores.

---

## 2. Explicit RPE & quick-log

**Badges** — the set table swaps qualitative text for numeric badges: `RPE 5`,
`RPE 7`, `RPE 8`, `RPE 9`, `RPE 10`, `RPE 10+`.

**Survey → RPE mapping** (in `set-quality.ts`, on `failureFromQuality`):

| Survey answer | RPE |
|---|---|
| Forced / drop | 10.5 |
| Nothing left | 10 |
| ~1 left | 9 |
| 2+ left | 8 (5–7 when `type === "feeder"`) |

**1-tap quick-log (feeders)** — the feeder row shows a tap bar in place of the
survey drawer:

| Button | RPE | implied score |
|---|---|---|
| Easy | 5 | technique-forward |
| Good groove | 7 | balanced |
| Heavy | 9 | closeness-forward |

**Manual precision** — tapping a badge opens a horizontal wheel, halves
(8.0/8.5/9.0/9.5/10.0/10.5), same pattern as `DecimalInput`.

---

## 3. Omni-grip & cable angle

**Set parameter field** — each set row gains a "grip / vector" chip cycling:
`Wide/Medium/Narrow × Pronated/Supinated/Neutral (+ Low-to-High/Mid/High-to-Low
for cables)`.

**Preset sequence** — exercises flagged `gripSequence` auto-stamp consecutive
sets (Set 1 Wide, Set 2 Close, Set 3 Neutral) on load.

**History** — grips persist in `HistorySession` sets; strength analytics
(`training-log.ts`) gain a `byGrip` breakdown under the exercise trend.

---

## 4. Movement & intensity modifiers

- **ROM tags** (`Full / Lengthened / Shortened`) + a `partialReps` input rendered
  as "10 + 5".
- **Nested drop sets** — "+ Add drop" under a parent working set pre-fills
  `weight = 0.7 × parent` and links `parentSetId`.
- **Stretch sets** (`type: "stretch"`) measure seconds; selecting one starts the
  guided inter-set countdown (e.g. 30s right lat → 30s left lat) using the
  existing `useRestTimer`.
- **Substitutions** — an exercise-level menu lists `substitutions` by name,
  swapping the exercise without fragmenting muscle history (keeps `targetKeys`).

---

## 5. Adjusted scoring

`set-quality.ts` weights become type-aware:

| Pillar | Working | Feeder |
|---|---|---|
| Closeness to failure | 40% | 10% |
| Right muscle failed | 50% | 30% |
| Technique / path | 5% | 60% |
| Burn | 5% | — |

Feeders logged ≥ RPE 8 are penalised (overreaching a feeder is an error, not a PR).

---

## Build order (suggested)

1. Types + `feederRamp()` + exclusion filter (pure, tested).
2. RPE badge + survey mapping (backwards-compatible).
3. Set-type chips + feeder quick-log row in `WorkoutView`.
4. Grip/ROM/drop/stretch modifiers.
5. Scoring weights.
6. Substitution menu.

All stages keep old sessions loadable; nothing is migrated destructively.
