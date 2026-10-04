import ActivityKit
import Foundation

/**
 * A routine, running — as the lock screen and the Dynamic Island see it.
 *
 * Compiled into BOTH the app (which starts and updates the activity, see
 * RoutineActivityPlugin) and the widget extension (which draws it, see
 * RoutineLiveActivity). The two must agree on this shape exactly, so it is
 * written once.
 *
 * Times are absolute dates rather than "seconds left": the lock screen counts
 * down from a date by itself, with the app asleep, which is the whole reason a
 * countdown can keep going on a locked phone.
 */
@available(iOS 16.1, *)
struct RoutineActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var stepLabel: String
        var nextLabel: String?
        /// 0-based.
        var stepIndex: Int
        var stepCount: Int
        var stepStart: Date
        var stepEnd: Date
        var paused: Bool
        /// Seconds left in the step at the moment it was paused.
        var pausedLeft: Int
        /// When the whole window runs out, pauses included.
        var windowEnd: Date
    }

    var name: String
    /// "#rrggbb", the routine's own colour.
    var color: String
}
