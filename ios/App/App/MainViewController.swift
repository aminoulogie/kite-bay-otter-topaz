import AVFoundation
import Capacitor
import UIKit

/**
 * The app's root view controller. Exists only to register plugins that live
 * inside this project rather than in an npm package — FaceDepthPlugin,
 * BodyDepthPlugin, TorchPlugin, WidgetBridgePlugin and VaultFolderPlugin — since
 * Capacitor discovers packaged plugins automatically but local ones must be
 * handed to the bridge here.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FaceDepthPlugin())
        bridge?.registerPluginInstance(BodyDepthPlugin())
        bridge?.registerPluginInstance(TorchPlugin())
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(VaultFolderPlugin())
        bridge?.registerPluginInstance(RoutineActivityPlugin())
        bridge?.registerPluginInstance(TickPlugin())
    }
}

/**
 * The detent tick of a picker wheel, for the page strip under a book.
 *
 * Its own plugin rather than the packaged haptics one: that one builds a new
 * feedback generator for every call and fires it cold, and a generator that
 * has not been prepared can take long enough to spin the Taptic Engine up
 * that a quick run of ticks comes out as nothing at all. This keeps one
 * generator, prepared, and fires it straight away on the main thread.
 * JS: Tick.tick({ style }) with style "selection" | "light" | "medium".
 */
@objc(TickPlugin)
public class TickPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TickPlugin"
    public let jsName = "Tick"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "tick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
    ]

    private lazy var light = UIImpactFeedbackGenerator(style: .light)
    private lazy var medium = UIImpactFeedbackGenerator(style: .medium)
    private lazy var selection = UISelectionFeedbackGenerator()

    @objc func prepare(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.light.prepare()
            self.selection.prepare()
        }
        call.resolve()
    }

    @objc func tick(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "light"
        DispatchQueue.main.async {
            switch style {
            case "selection":
                self.selection.selectionChanged()
                self.selection.prepare()
            case "medium":
                self.medium.impactOccurred()
                self.medium.prepare()
            default:
                self.light.impactOccurred(intensity: 0.9)
                self.light.prepare()
            }
        }
        call.resolve()
    }
}

/**
 * The back camera's LED. The web view's camera stream does not offer the
 * `torch` constraint on iOS, so the page asks for it here instead.
 * JS: Torch.set({ on }) → { ok, on }.
 */
@objc(TorchPlugin)
public class TorchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TorchPlugin"
    public let jsName = "Torch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    ]

    @objc func set(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                  device.hasTorch else {
                call.resolve(["ok": false, "on": false])
                return
            }
            do {
                try device.lockForConfiguration()
                if on {
                    try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
                } else {
                    device.torchMode = .off
                }
                device.unlockForConfiguration()
                call.resolve(["ok": true, "on": device.torchMode == .on])
            } catch {
                call.resolve(["ok": false, "on": false, "error": error.localizedDescription])
            }
        }
    }
}
