import ActivityKit
import SwiftUI
import WidgetKit

/**
 * A running routine on the lock screen and in the Dynamic Island.
 *
 * Everything that moves here moves on its own: the countdown and the bar are
 * driven from the step's start and end dates, which the system animates with
 * the app asleep. The app only updates the activity when something happens —
 * a step done, skipped, paused — which is why the timer keeps going on a
 * locked phone.
 */
struct RoutineLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RoutineActivityAttributes.self) { context in
            RoutineLockScreen(context: context)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let tint = Color(hex: context.attributes.color)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.name.uppercased())
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(tint)
                            .lineLimit(1)
                        Text(context.state.stepLabel)
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(2)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    StepClock(state: context.state, size: 30)
                        .foregroundColor(tint)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        StepBar(state: context.state, tint: tint)
                        StepFooter(state: context.state)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                StepDial(state: context.state, tint: tint)
                    .frame(width: 20, height: 20)
            } compactTrailing: {
                StepClock(state: context.state, size: 14)
                    .foregroundColor(tint)
                    .frame(maxWidth: 46)
            } minimal: {
                StepDial(state: context.state, tint: tint)
                    .frame(width: 20, height: 20)
            }
        }
    }
}

private struct RoutineLockScreen: View {
    let context: ActivityViewContext<RoutineActivityAttributes>

    var body: some View {
        let tint = Color(hex: context.attributes.color)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(context.attributes.name.uppercased())
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(tint)
                        .lineLimit(1)
                    Text(context.state.stepLabel)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                StepClock(state: context.state, size: 34)
                    .foregroundColor(tint)
            }
            StepBar(state: context.state, tint: tint)
            StepFooter(state: context.state)
        }
        .padding(16)
    }
}

/// The step's countdown. Counts past zero into the overrun on its own; while
/// paused it is a fixed figure, since nothing is counting.
private struct StepClock: View {
    let state: RoutineActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        Group {
            if state.paused {
                Text(format(state.pausedLeft))
            } else {
                Text(state.stepEnd, style: .timer)
            }
        }
        .font(.system(size: size, weight: .heavy))
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }

    private func format(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// How far through the step, filling on its own.
private struct StepBar: View {
    let state: RoutineActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        if state.paused || state.stepEnd <= state.stepStart {
            let total = max(1, state.stepEnd.timeIntervalSince(state.stepStart))
            let done = max(0, min(1, 1 - Double(state.pausedLeft) / total))
            ProgressView(value: done)
                .tint(tint)
        } else {
            ProgressView(timerInterval: state.stepStart...state.stepEnd, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .tint(tint)
        }
    }
}

private struct StepDial: View {
    let state: RoutineActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        if state.paused || state.stepEnd <= state.stepStart {
            Image(systemName: "pause.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(tint)
        } else {
            ProgressView(timerInterval: state.stepStart...state.stepEnd, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.circular)
            .tint(tint)
        }
    }
}

private struct StepFooter: View {
    let state: RoutineActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 6) {
            Text(state.paused ? "Paused" : "Step \(state.stepIndex + 1) of \(state.stepCount)")
            Spacer(minLength: 4)
            if let next = state.nextLabel, !next.isEmpty {
                Text("Next: \(next)")
                    .lineLimit(1)
            } else {
                Text("Last step")
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(.gray)
    }
}
