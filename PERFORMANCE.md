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

## If it does get slow

The first suspects, in order: the micro-muscle panel (recomputes an index
across every exercise on every history change), `buildTrainingLog` (rebuilds
the whole log from seed plus history rather than diffing), and the Estimates
tab (a regression per lift). All three are memoised but all three are O(all
history), so they will be the first to show at several years of data.
