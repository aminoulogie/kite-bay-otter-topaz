//
//  SomaFocusPlugin.swift
//
//  The native half of src/lib/live-activity.ts. A local Capacitor plugin: it
//  lives in this Xcode project rather than in node_modules, and is registered
//  by SomaBridgeViewController. Two jobs:
//
//   1. The focus Live Activity (lock screen + Dynamic Island). iOS 16.2+.
//   2. A scheduled local notification for "this step's time is up", which is
//      the lock-screen alert on every iOS version, Live Activities or not.
//
//  Every method resolves rather than rejects when the feature is missing, so
//  the web side can call it unconditionally and read the answer.
//

import Foundation
import Capacitor
import UserNotifications
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(SomaFocusPlugin)
public class SomaFocusPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SomaFocusPlugin"
    public let jsName = "SomaFocus"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOrUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleAlert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAlert", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - availability

    @objc func isAvailable(_ call: CAPPluginCall) {
        var live = false
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            live = ActivityAuthorizationInfo().areActivitiesEnabled
        }
        #endif
        call.resolve(["liveActivities": live, "notifications": true])
    }

    // MARK: - live activity

    @objc func startOrUpdate(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else {
            call.resolve(["active": false])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["active": false])
            return
        }
        let state = Self.state(from: call)
        // Stale once the step's time is up, so the system can dim it; the
        // widget reads "time's up" itself from the end date.
        let content = ActivityContent(state: state, staleDate: state.stepEndsAt)

        Task {
            let live = Activity<FocusActivityAttributes>.activities.filter {
                $0.activityState == .active || $0.activityState == .stale
            }
            if let current = live.first {
                await current.update(content)
                // Only ever one: an earlier crash could have left a second.
                for extra in live.dropFirst() {
                    await extra.end(nil, dismissalPolicy: .immediate)
                }
                call.resolve(["active": true])
                return
            }
            do {
                _ = try Activity.request(
                    attributes: FocusActivityAttributes(sessionName: state.title),
                    content: content,
                    pushType: nil
                )
                call.resolve(["active": true])
            } catch {
                call.resolve(["active": false, "error": error.localizedDescription])
            }
        }
        #else
        call.resolve(["active": false])
        #endif
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        let after = call.getDouble("dismissAfterSeconds") ?? 0
        Task {
            for activity in Activity<FocusActivityAttributes>.activities {
                let policy: ActivityUIDismissalPolicy =
                    after > 0 ? .after(Date().addingTimeInterval(after)) : .immediate
                await activity.end(activity.content, dismissalPolicy: policy)
            }
            call.resolve()
        }
        #else
        call.resolve()
        #endif
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func state(from call: CAPPluginCall) -> FocusActivityAttributes.ContentState {
        func date(_ key: String) -> Date? {
            guard let ms = call.getDouble(key), ms > 0 else { return nil }
            return Date(timeIntervalSince1970: ms / 1000)
        }
        return FocusActivityAttributes.ContentState(
            title: call.getString("title") ?? "Focus",
            label: call.getString("label") ?? "",
            position: call.getInt("position") ?? 1,
            total: call.getInt("total") ?? 1,
            colorHex: call.getString("color") ?? "#35c9a8",
            paused: call.getBool("paused") ?? false,
            finished: call.getBool("finished") ?? false,
            remainingSeconds: max(0, call.getInt("remainingSeconds") ?? 0),
            stepStartedAt: date("stepStartedAt") ?? Date(),
            stepEndsAt: date("stepEndsAt"),
            nextLabel: call.getString("nextLabel")
        )
    }
    #endif

    // MARK: - notifications

    @objc func scheduleAlert(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let at = call.getDouble("at") else {
            call.resolve(["scheduled": false])
            return
        }
        let seconds = at / 1000 - Date().timeIntervalSince1970
        guard seconds > 0.5 else {
            call.resolve(["scheduled": false])
            return
        }
        let center = UNUserNotificationCenter.current()
        // Asked here, the first time a timer is started, rather than at launch:
        // the moment someone has just asked to be told is the moment the
        // question makes sense to them.
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else {
                call.resolve(["scheduled": false])
                return
            }
            let content = UNMutableNotificationContent()
            content.title = call.getString("title") ?? "Time's up"
            content.body = call.getString("body") ?? ""
            content.sound = .default
            if #available(iOS 15.0, *) {
                content.interruptionLevel = .timeSensitive
            }
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            center.removePendingNotificationRequests(withIdentifiers: [id])
            center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { err in
                call.resolve(["scheduled": err == nil])
            }
        }
    }

    @objc func cancelAlert(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.resolve()
            return
        }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.removeDeliveredNotifications(withIdentifiers: [id])
        call.resolve()
    }
}
