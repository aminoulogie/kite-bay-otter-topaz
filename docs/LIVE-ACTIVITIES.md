# Focus on the lock screen and in the Dynamic Island

The Focus queue and saved Routines run in the same full-screen runner
(`src/components/RoutineRunner.tsx`, mounted app-wide by `SessionHost`). On a
native iOS build the running step also shows as a **Live Activity** on the lock
screen and in the Dynamic Island. Every build also gets a **scheduled local
notification** when a step's time runs out.

In a browser or the web preview, only the in-app runner exists. The bridge
(`src/lib/live-activity.ts`) reports "not available" and does nothing.

## What is in the repo

| File | Target | Job |
| --- | --- | --- |
| `ios/App/App/SomaFocusPlugin.swift` | App | Capacitor plugin `SomaFocus`: start, update or end the activity; schedule or cancel the step-end notification |
| `ios/App/App/SomaBridgeViewController.swift` | App | Registers the local plugin (`Main.storyboard` now points here) |
| `ios/App/App/FocusActivityAttributes.swift` | **App + FocusWidget** | The activity's data shape, which must be identical in both targets |
| `ios/App/FocusWidget/FocusLiveActivity.swift` | FocusWidget | Lock screen and Dynamic Island UI |
| `ios/App/FocusWidget/FocusWidgetBundle.swift` | FocusWidget | Extension entry point |
| `ios/App/FocusWidget/Info.plist` | FocusWidget | WidgetKit extension point |

The three App files are already in `App.xcodeproj`, and `Info.plist` has
`NSSupportsLiveActivities = YES`. The app target still deploys to iOS 13.
ActivityKit calls are behind `#available(iOS 16.2, *)`.

## One-time Xcode step: add the widget extension target

A new target can't be added to the project file reliably by hand, so this step
is done once in Xcode:

1. `npm run ios:sync`, then open `ios/App/App.xcworkspace`.
2. **File → New → Target… → Widget Extension**. Name it `FocusWidget`.
   Tick **Include Live Activity**. Untick *Include Configuration App Intent*.
   Choose **Don't activate** if asked about the scheme.
3. Xcode creates an `ios/App/FocusWidget/` group with template files. **Delete
   the generated `.swift` files** (Move to Trash), then **Add Files to "App"…**
   and pick the repo's `FocusLiveActivity.swift`, `FocusWidgetBundle.swift` and
   `Info.plist` in that folder, with the target set to **FocusWidget** only.
4. Select `App/FocusActivityAttributes.swift`. In the File inspector →
   *Target Membership*, tick **both App and FocusWidget**.
5. FocusWidget target → *General* → **Minimum Deployments: iOS 16.2**. Set the
   same Team as the app. The bundle id must be a child of the app's
   (`io.github.aminoulogie.soma.FocusWidget`).
6. Build and run on a **physical device**. Simulators show Live Activities,
   but notifications and the Dynamic Island behave most faithfully on
   hardware.

## Testing on device

1. On the Time tab, open **Focus**, then **Add from today**. Add a to-do and a
   habit, set one row to 1 minute, and tap **Run my list**.
2. The first run asks for notification permission. Allow it.
3. Lock the phone. The lock screen shows the label, a live `mm:ss`, the step
   bar and `1/2`. On iPhone 14 Pro or later, the Dynamic Island shows the
   timer, and a long-press expands it.
4. Wait out the minute. A time-sensitive notification ("Time's up: …")
   arrives, and the activity reads *Time's up*. The step does **not**
   advance: a step is done when you say so.
5. Unlock and tap **Done · next**. The to-do or habit is ticked, and the
   activity moves to `2/2` with a fresh countdown.
6. **Pause** shows *Paused*. **End** or finishing the list ends the activity.
   A finished list stays on screen as *Done* for about 8 seconds.
7. **Kill the app** mid-step and reopen it. The run comes back where it was,
   with the time recomputed from timestamps. Swipe the Live Activity away,
   then return to the app, and the next change brings it back.

If nothing shows: check **Settings → SOMA → Live Activities** is on, that
`FocusActivityAttributes.swift` is in both targets, and that the device runs
iOS 16.2 or later. Notifications still work without a Live Activity.

## Design notes

- The countdown is drawn by the system from the step's end time
  (`Text(timerInterval:)`). The app pushes an update only when something
  changes (step, pause, end), not every second, so it stays within
  ActivityKit's update budget and keeps counting while the app is suspended.
- The run is persisted as timestamps (`dayRoutineRun` in the store). A run
  older than 18 hours is dropped on launch (`reviveRun` in `src/lib/focus.ts`).
- The rest timer on Train uses the same plugin to schedule its "Rest over"
  notification.
