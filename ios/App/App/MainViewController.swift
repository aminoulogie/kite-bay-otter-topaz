import AVFoundation
import Capacitor
import UIKit

/**
 * The app's root view controller. Exists only to register plugins that live
 * inside this project rather than in an npm package — FaceDepthPlugin,
 * BodyDepthPlugin and TorchPlugin — since
 * Capacitor discovers packaged plugins automatically but local ones must be
 * handed to the bridge here.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FaceDepthPlugin())
        bridge?.registerPluginInstance(BodyDepthPlugin())
        bridge?.registerPluginInstance(TorchPlugin())
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
