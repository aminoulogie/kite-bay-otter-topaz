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
    ]

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
