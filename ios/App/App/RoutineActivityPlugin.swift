import ActivityKit
import Capacitor
import Foundation
import UserNotifications

/**
 * Puts a running routine on the lock screen and in the Dynamic Island, and
 * rings when a step's time is up.
 *
 * JS: RoutineActivity.update(state) → { ok, live }, RoutineActivity.end().
 * Called by lib/native/routine-activity.ts whenever the run changes — a step
 * finished, skipped, paused or resumed. Between those the system counts the
 * step down by itself from the dates it was given, with the app asleep.
 *
 * The alert at the end of a step is a local notification scheduled for that
 * moment, replaced on every update: a locked phone does not run the app's
 * timers, but it does deliver a notification at the time it was booked for.
 */
@objc(RoutineActivityPlugin)
public class RoutineActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RoutineActivityPlugin"
    public let jsName = "RoutineActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    /// What stands between a routine and the lock screen, checked on the phone.
    /// The Live Activity is drawn by the widget extension, so if a sideloader
    /// dropped the extension there is nothing to draw it with — the same cause
    /// as a missing home-screen widget.
    @objc func status(_ call: CAPPluginCall) {
        var result: [String: Any] = ["extension": Self.extensionInstalled()]
        let signing = Self.extensionSigning()
        result["extensionId"] = signing.bundleId ?? ""
        result["extensionSignedFor"] = signing.signedFor ?? ""
        result["extensionSignedRight"] = signing.matches
        if #available(iOS 16.2, *) {
            result["activitiesEnabled"] = ActivityAuthorizationInfo().areActivitiesEnabled
        } else {
            result["activitiesEnabled"] = false
        }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            result["notifications"] = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
            call.resolve(result)
        }
    }

    /// Whether the widget was signed for its OWN identifier.
    ///
    /// iOS only runs an extension whose provisioning profile names its bundle
    /// id. A sideloader that signs it with the app's profile leaves the file
    /// on the phone ("installed") but iOS never registers it: no widget in
    /// the gallery, nothing on the lock screen, and no error anywhere.
    static func extensionSigning() -> (bundleId: String?, signedFor: String?, matches: Bool) {
        guard let appex = Bundle.main.builtInPlugInsURL?.appendingPathComponent("SomaWidgets.appex"),
              let bundle = Bundle(url: appex)
        else { return (nil, nil, false) }
        let id = bundle.bundleIdentifier
        guard let data = try? Data(contentsOf: appex.appendingPathComponent("embedded.mobileprovision")),
              let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex),
              let plist = try? PropertyListSerialization.propertyList(
                from: data.subdata(in: start.lowerBound..<end.upperBound), format: nil
              ) as? [String: Any],
              let ents = plist["Entitlements"] as? [String: Any],
              let appId = ents["application-identifier"] as? String
        else { return (id, nil, false) }
        // "TEAMID.io.github.aminoulogie.soma.widgets" — drop the team prefix.
        let signedFor = appId.split(separator: ".", maxSplits: 1).last.map(String.init) ?? appId
        let matches = id != nil && (signedFor == id || (signedFor.hasSuffix("*") && id!.hasPrefix(String(signedFor.dropLast()))))
        return (id, signedFor, matches)
    }

    static func extensionInstalled() -> Bool {
        guard let url = Bundle.main.builtInPlugInsURL?.appendingPathComponent("SomaWidgets.appex") else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    private static let notificationId = "soma.routine.step"
    private var askedForNotifications = false

    @objc func update(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Routine"
        let color = call.getString("color") ?? "#c8ff2e"
        let stepLabel = call.getString("stepLabel") ?? ""
        let nextLabel = call.getString("nextLabel")
        let stepIndex = call.getInt("stepIndex") ?? 0
        let stepCount = call.getInt("stepCount") ?? 1
        let stepStart = Date(timeIntervalSince1970: (call.getDouble("stepStart") ?? 0) / 1000)
        let stepEnd = Date(timeIntervalSince1970: (call.getDouble("stepEnd") ?? 0) / 1000)
        let paused = call.getBool("paused") ?? false
        let pausedLeft = call.getInt("pausedLeft") ?? 0
        let windowEnd = Date(timeIntervalSince1970: (call.getDouble("windowEnd") ?? 0) / 1000)

        scheduleStepAlert(stepLabel: stepLabel, nextLabel: nextLabel, at: paused ? nil : stepEnd)

        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": true, "live": false])
            return
        }
        let state = RoutineActivityAttributes.ContentState(
            stepLabel: stepLabel, nextLabel: nextLabel, stepIndex: stepIndex, stepCount: stepCount,
            stepStart: stepStart, stepEnd: stepEnd, paused: paused, pausedLeft: pausedLeft,
            windowEnd: windowEnd
        )
        Task {
            // One routine at a time: anything else still showing is from a run
            // that ended without saying so (the app was closed mid-routine).
            var current: Activity<RoutineActivityAttributes>?
            for activity in Activity<RoutineActivityAttributes>.activities {
                if current == nil && activity.attributes.name == name && activity.attributes.color == color {
                    current = activity
                } else {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            let content = ActivityContent(state: state, staleDate: nil)
            if let activity = current {
                await activity.update(content)
                call.resolve(["ok": true, "live": true])
                return
            }
            guard Self.extensionInstalled() else {
                call.resolve(["ok": true, "live": false, "reason": "The widget extension was not installed (sideloader removed it)"])
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve(["ok": true, "live": false, "reason": "Live Activities are turned off for SOMA in Settings"])
                return
            }
            do {
                _ = try Activity.request(
                    attributes: RoutineActivityAttributes(name: name, color: color),
                    content: content,
                    pushType: nil
                )
                call.resolve(["ok": true, "live": true])
            } catch {
                call.resolve(["ok": true, "live": false, "reason": error.localizedDescription])
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<RoutineActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    /// Books "time's up" for the end of the step, replacing any earlier one.
    private func scheduleStepAlert(stepLabel: String, nextLabel: String?, at date: Date?) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
        guard let date = date else { return }
        let seconds = date.timeIntervalSinceNow
        guard seconds > 1 else { return }

        let book = {
            let content = UNMutableNotificationContent()
            content.title = "Time's up: \(stepLabel)"
            if let next = nextLabel, !next.isEmpty {
                content.body = "Next: \(next)"
            } else {
                content.body = "That was the last step."
            }
            content.sound = .default
            if #available(iOS 15.0, *) {
                content.interruptionLevel = .timeSensitive
            }
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            center.add(UNNotificationRequest(identifier: Self.notificationId, content: content, trigger: trigger))
        }

        if askedForNotifications {
            book()
            return
        }
        askedForNotifications = true
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            if granted { book() }
        }
    }
}
