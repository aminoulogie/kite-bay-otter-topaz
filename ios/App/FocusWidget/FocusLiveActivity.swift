//
//  FocusLiveActivity.swift
//
//  The running focus / routine step, on the lock screen and in the Dynamic
//  Island.
//
//  The countdown is NOT pushed from the app once a second. It is drawn by the
//  system from the step's end time (`Text(timerInterval:)` and
//  `ProgressView(timerInterval:)`), which keeps ticking with the phone locked
//  and the app suspended — the only way a countdown here can stay honest,
//  because a suspended app sends nothing. The app updates the activity only
//  when something changes: a new step, a pause, the end.
//
//  Past the end the system timer stops at 0:00, and the activity goes stale
//  (the app sets staleDate to the end time), which is when this reads
//  "Time's up". The step is still not advanced: the app's rule is that a step
//  is finished when you say so, not when its clock runs out.
//

import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            LockScreenView(state: context.state, stale: context.isStale)
                .activityBackgroundTint(Color.black.opacity(0.82))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let s = context.state
            let tint = Color(hex: s.colorHex)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    StepBadge(state: s, tint: tint)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: s, stale: context.isStale)
                        .font(.system(size: 30, weight: .heavy, design: .rounded))
                        .foregroundStyle(tint)
                        .frame(maxWidth: 110, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.label)
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        StepProgress(state: s, tint: tint)
                        if let next = s.nextLabel, !s.finished {
                            Text("Next: \(next)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: s.paused ? "pause.fill" : "timer")
                    .foregroundStyle(tint)
            } compactTrailing: {
                Countdown(state: s, stale: context.isStale)
                    .monospacedDigit()
                    .frame(maxWidth: 52)
                    .foregroundStyle(tint)
            } minimal: {
                Image(systemName: s.paused ? "pause.fill" : "timer")
                    .foregroundStyle(tint)
            }
            .keylineTint(tint)
        }
    }
}

// MARK: - pieces

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let state: FocusActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        let tint = Color(hex: state.colorHex)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.title.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white.opacity(0.6))
                    Text(state.label)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Countdown(state: state, stale: stale)
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 140, alignment: .trailing)
            }
            StepProgress(state: state, tint: tint)
            HStack {
                StepBadge(state: state, tint: tint)
                Spacer()
                if let next = state.nextLabel, !state.finished {
                    Text("Next: \(next)")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                }
            }
        }
        .padding(16)
    }
}

/// mm:ss, counted down by the system while running; frozen text otherwise.
@available(iOS 16.2, *)
private struct Countdown: View {
    let state: FocusActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        if state.finished {
            Text("Done")
        } else if state.paused {
            Text("Paused")
        } else if let end = state.stepEndsAt, end > Date(), !stale {
            Text(timerInterval: state.stepStartedAt...end, countsDown: true)
        } else {
            Text("Time's up")
        }
    }
}

/// "2/5" — where you are in the whole run.
@available(iOS 16.2, *)
private struct StepBadge: View {
    let state: FocusActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        Text(state.finished ? "\(state.total)/\(state.total)" : "\(state.position)/\(state.total)")
            .font(.caption.weight(.heavy))
            .monospacedDigit()
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.25), in: Capsule())
            .foregroundStyle(tint)
    }
}

/// The current step as a bar the system fills on its own.
@available(iOS 16.2, *)
private struct StepProgress: View {
    let state: FocusActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        if let end = state.stepEndsAt, !state.paused, !state.finished, end > state.stepStartedAt {
            ProgressView(timerInterval: state.stepStartedAt...end, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(tint)
        } else {
            // Paused or finished: the run's overall progress, which does not
            // need a clock to be right.
            let done = state.finished ? state.total : max(0, state.position - 1)
            ProgressView(value: Double(done), total: Double(max(1, state.total)))
                .tint(tint)
        }
    }
}

private extension Color {
    /// "#35c9a8" -> Color. Anything unreadable falls back to the app's teal.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&v) else {
            self = Color(red: 0x35 / 255, green: 0xC9 / 255, blue: 0xA8 / 255)
            return
        }
        self = Color(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}
