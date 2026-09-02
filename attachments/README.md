# SOMA Smart Coach

Obsidian fitness suite. **`main.js` is generated — edit `src/`, not `main.js`.**

## Working on it

```bash
npm install        # once; pulls esbuild (~11 MB, not kept in the vault)
node build.mjs     # src/ -> main.js
node test/all.js   # 246 tests against the BUILT main.js
```

`npm run verify` does the build and the tests in one go. `node build.mjs --watch`
rebuilds on save.

`node_modules/` is deliberately absent: this folder lives in an iCloud-synced
vault, and an 11 MB native binary syncing to every device is not worth it for a
dependency that reinstalls in seconds. Run `npm install` when you need to
rebuild, delete it when you're done.

The test runner **refuses to run against a stale bundle** — if anything in
`src/` is newer than `main.js` it tells you to rebuild rather than reporting a
green suite for code you aren't shipping.

## Layout

| Path | What's in it |
|---|---|
| `src/index.js` | Bundle entry. Exports the plugin class for Obsidian, plus `__internals` for tests. |
| `src/plugin.js` | The plugin class: widget mounting, view rendering, event wiring. |
| `src/engine.js` | `SomaIntelligenceEngine` — all the training and nutrition maths. Pure, no DOM. |
| `src/migrations.js` | Schema versioning; self-healing history and nutrition files. |
| `src/theme.js` | Light/dark resolution and contrast-aware accent derivation. |
| `src/profiles.js` | Which tabs each widget shows. |
| `src/data.js` | Seed food/exercise libraries and built-in routines. |
| `src/dates.js` | Local-time date keys. |
| `src/paths.js` | Where each data file lives in the vault. |
| `src/audio.js`, `src/workout-state.js` | Chimes/confetti; live session state with undo. |
| `src/habits/` | The habit tracker: controller, modals, photo capture, stats. |
| `test/` | Eight suites. `harness.js` loads the built bundle with a stubbed `obsidian`. |

`src/plugin.js` is still ~5,200 lines. Its methods close over a lot of shared
local state — `mountApp` builds every renderer as a closure over the same
session, settings and DOM handles — so splitting it further means restructuring
that, not relocating code. That's a separate job.

## Code blocks

| Block | Tabs |
|---|---|
| ```` ```soma-workout``` ```` | Workout · Heatmap · Calendar · Insights · Settings |
| ```` ```soma-macros``` ```` | Macros · Weight · Measure · Creatine · Settings |
| ```` ```soma-sleep``` ```` | Sleep · Settings |
| ```` ```habittracker``` ```` | Habits · Settings |
| ```` ```soma-coach``` ```` | Legacy all-in-one |

`macro-tracker` is an alias of `soma-macros`. Older blocks (`macro-weekly`,
`weekly-gym`, `creatine-tracker`, `weekly-audit`, `monthly-audit`,
`soma-progress`) still work.

## Data

Everything lives in `apps/scripts/*.json`, relative to the vault root, and is
migrated on read — `main.js` never assumes a shape it hasn't normalised.
Backups of every pre-refactor state are in `apps/scripts/_backup/`.
