# Performance notes

## What was measured

Measured in the in-app browser at 375x812, on the heaviest screen — the
Database table with a muscle group open and an exercise expanded.

| | measured | budget |
| --- | --- | --- |
| Forced layout per scroll step | **1.02 ms** | 16.7 ms at 60fps, 8.3 ms at 120fps |
| Expanding one exercise | **0.5 ms** | one frame |
| DOM nodes, whole document | **1,368** | — |
| DOM nodes under `<main>` | **424** | — |

Roughly 16x headroom against a 60fps frame and 8x against 120fps, on the view
most likely to struggle. The node count is low because the Database renders
only the sessions of the exercise that is open, and the exercise-by-date grid
that preceded it — which mounted every cell — is gone.

## What was NOT measured, and why

**Actual frame rate.** `requestAnimationFrame` is paused while the browser pane
is hidden, so a frame-timing loop never resolves. Every number above is
synchronous layout cost, which is a good proxy and not the same thing.

Real fps has to come from a device: Safari on the phone, Develop > Show Web
Inspector > Timelines, while scrolling the Database. Nothing here can stand in
for that, and the claim "60/120fps verified" would be false.

**Sustained scrolling and memory over time.** A short scripted loop cannot show
a leak that appears after twenty minutes of use.

## What is already done for performance

- The Database renders one exercise's sessions at a time, in a window capped at
  42vh, rather than an exercise-by-date grid that was ~90% empty cells.
- Chart data is memoised on its inputs, so panning and zooming re-render the
  chart without recomputing the series.
- Scroll position for the old wide table was read through `useDeferredValue`,
  so dragging never blocked on rendering cells.
- Habit photos are stored as blobs in IndexedDB and turned into object URLs in
  an effect, then revoked on cleanup — never during render, which used to tear
  down URLs mid-fetch and render blank tiles.
- `prefers-reduced-motion` disables every animation wholesale rather than
  merely shortening it.

## Liquid Glass & 120 Hz

The Liquid Glass pass (`src/glass.css`, `src/lib/use-liquid-glass.ts`) was
built around one rule: **the 120 Hz path is the compositor's, not the main
thread's.** Every continuous animation is a transform or opacity; nothing
continuous animates layout.

What that means in practice:

- **The dock and TopTabs pills slide with `translateX` (+ `scaleX` for
  TopTabs, where tabs differ in width).** The old `width` transition pushed
  layout through the main thread every frame; now the pill's width is set
  once and only its transform animates, with `will-change: transform`.
- **`Progress` fills by `scaleX`**, same reason. Width is always 100%; the
  bar's visual scale is what changes.
- **Backdrop blur is capped to hero surfaces** — header, dock, rail, overlay
  scrims, sheet panels, full-screen sheets. One or two are composited at a
  time. Cards, chips, buttons and inputs get the specular rim, sheen and
  shadow only (no `backdrop-filter`), because twenty blurred cards would be
  the 120fps budget by themselves.
- **Sheet glass uses one blur on the scrim, not one per panel.** The panel
  tints what the scrim already frosted, so nested backdrop filters — the
  usual source of WebKit blur artifacts — cannot occur.
- **Tilt parallax costs two composited moves per frame.** The hook publishes
  two eased CSS variables on `<html>`; only the ambient backdrop layer and
  its light spots consume them. The loop performs zero layout reads and
  parks when the values settle, so a still phone costs zero frames.
- **Reduced motion still stops everything**, including the parallax (the
  variables are zeroed and the ambient layer is static).

What was NOT re-measured: real frame rate on a ProMotion device. Same caveat
as above — CSS animations and compositor transforms run at the display's
refresh rate by construction, but the "120 Hz verified" claim still belongs
to Safari's own Timeline on the phone.

## If it does get slow

The first suspects, in order: the micro-muscle panel (recomputes an index
across every exercise on every history change), `buildTrainingLog` (rebuilds
the whole log from seed plus history rather than diffing), and the Estimates
tab (a regression per lift). All three are memoised but all three are O(all
history), so they will be the first to show at several years of data.
