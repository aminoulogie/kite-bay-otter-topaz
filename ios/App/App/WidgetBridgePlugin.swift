import Capacitor
import Foundation
import WidgetKit

/**
 * Hands today's rings to the home-screen widget.
 *
 * JS: WidgetBridge.setRings(snapshot) → { ok, shared }. `shared` is false when
 * there is no App Group container to write into — the install was signed
 * without the group — and the widget then says to open the app.
 *
 * The snapshot is written as it arrives: the web side already computed every
 * number the app shows, and working them out a second time in Swift would be
 * a second place for the two to disagree.
 */
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setRings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeFocus", returnType: CAPPluginReturnPromise),
    ]

    /// Finished Focus sessions and a gym arrival, handed over once.
    @objc func takeFocus(_ call: CAPPluginCall) {
        var s = FocusStore.read()
        var out: [String: Any] = [
            "sessions": s.sessions.map { ["start": $0.start, "end": $0.end] },
        ]
        if let since = s.activeSince { out["activeSince"] = since }
        if let at = s.gymArrivedAt { out["gymArrivedAt"] = at }
        s.sessions = []
        s.gymArrivedAt = nil
        FocusStore.write(s)
        call.resolve(out)
    }

    /// The sleep widget's taps since the app last looked, and its state.
    /// The taps are cleared as they are handed over, so each is logged once.
    @objc func takeSleep(_ call: CAPPluginCall) {
        var s = SleepStore.read()
        let events = s.events.map { ["kind": $0.kind, "at": $0.at] as [String: Any] }
        s.events = []
        SleepStore.write(s)
        var out: [String: Any] = ["events": events]
        if let since = s.asleepSince { out["asleepSince"] = since }
        call.resolve(out)
    }

    /// The app pressed the button itself: tell the widget, so both agree.
    @objc func setSleep(_ call: CAPPluginCall) {
        var s = SleepStore.read()
        s.asleepSince = call.getDouble("asleepSince")
        SleepStore.write(s)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "SomaSleep")
        }
        call.resolve(["ok": true])
    }

    /// Whether the widget can be reached at all, and through which group —
    /// shown in Setup → About, so a failed install says so plainly.
    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["shared": RingsStore.available, "group": RingsStore.groupID ?? ""])
    }

    @objc func setRings(_ call: CAPPluginCall) {
        guard let options = call.options,
              JSONSerialization.isValidJSONObject(options),
              let data = try? JSONSerialization.data(withJSONObject: options)
        else {
            call.resolve(["ok": false, "shared": false])
            return
        }
        // Checked by decoding, so a malformed snapshot never reaches the widget.
        guard (try? JSONDecoder().decode(RingsSnapshot.self, from: data)) != nil else {
            call.resolve(["ok": false, "shared": RingsStore.available])
            return
        }
        let ok = RingsStore.write(data)
        if ok, #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "SomaRings")
        }
        call.resolve(["ok": ok, "shared": RingsStore.available])
    }
}
