//
//  FocusActivityAttributes.swift
//
//  The shape of the focus Live Activity, shared by the app (which starts and
//  updates it) and the FocusWidget extension (which draws it).
//
//  THIS FILE MUST BE A MEMBER OF BOTH TARGETS — App and FocusWidget. ActivityKit
//  matches an activity to its widget by this type, so two copies that drift
//  apart fail silently: the activity starts and nothing is drawn.
//
//  Everything that changes lives in ContentState, including the title and the
//  colour. A saved routine and today's focus queue run through the same
//  activity, and a new run updating one activity is simpler — and kinder to
//  the lock screen — than ending one and starting another.
//

import Foundation

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
public struct FocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var title: String
        public var label: String
        /// 1-based position of the current step.
        public var position: Int
        public var total: Int
        /// "#rrggbb" — the routine's or the queue's colour.
        public var colorHex: String
        public var paused: Bool
        public var finished: Bool
        /// What is left, frozen, for when the countdown is not running.
        public var remainingSeconds: Int
        public var stepStartedAt: Date
        /// nil while paused or finished; the widget counts down to this.
        public var stepEndsAt: Date?
        public var nextLabel: String?
    }

    /// Fixed for the life of one activity. Nothing reads it; ActivityKit
    /// requires attributes to exist.
    public var sessionName: String

    public init(sessionName: String) {
        self.sessionName = sessionName
    }
}
#endif
