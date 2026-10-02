import AudioToolbox
import AVFoundation
import Capacitor
import CoreHaptics
import UIKit
import WebKit

/**
 * The app's root view controller. Exists only to register plugins that live
 * inside this project rather than in an npm package — FaceDepthPlugin,
 * BodyDepthPlugin, TorchPlugin, WidgetBridgePlugin and VaultFolderPlugin — since
 * Capacitor discovers packaged plugins automatically but local ones must be
 * handed to the bridge here.
 */
class MainViewController: CAPBridgeViewController {
    /**
     * Page animations at the screen's own rate.
     *
     * The app is allowed 120Hz (CADisableMinimumFrameDurationOnPhone in
     * Info.plist), but WebKit still paces requestAnimationFrame at 60 unless
     * its "prefer page rendering near 60fps" setting is off — so the page
     * curl, the page strip and every hand-run animation in the app ran at
     * half the phone's rate. That setting has no public switch; it is turned
     * off here through WebKit's own feature list when this iOS has it, and
     * left alone when it does not.
     */
    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        Self.unlockFrameRate(config.preferences)
        return config
    }

    static func unlockFrameRate(_ prefs: WKPreferences) {
        let direct = NSSelectorFromString("_setPreferPageRenderingUpdatesNear60FPSEnabled:")
        if prefs.responds(to: direct) {
            prefs.perform(direct, with: nil) // nil is NO
        }
        let list = NSSelectorFromString("_features")
        let set = NSSelectorFromString("_setEnabled:forFeature:")
        guard WKPreferences.responds(to: list), prefs.responds(to: set),
              let features = WKPreferences.perform(list)?.takeUnretainedValue() as? [NSObject]
        else { return }
        for feature in features {
            guard let key = feature.value(forKey: "key") as? String,
                  key == "PreferPageRenderingUpdatesNear60FPSEnabled"
            else { continue }
            prefs.perform(set, with: nil, with: feature) // nil is NO
        }
    }

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
        CAPPluginMethod(name: "diagnose", returnType: CAPPluginReturnPromise),
    ]

    /**
     * Core Haptics: the engine games use, a different road to the Taptic
     * Engine from UIFeedbackGenerator. Kept and restarted rather than built
     * per tap, which is what makes a quick run of ticks come out at all.
     */
    private var engine: CHHapticEngine?
    private var engineError = ""

    private func coreTap(_ intensity: Float, _ sharpness: Float) throws {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            throw NSError(domain: "Tick", code: 1, userInfo: [NSLocalizedDescriptionKey: "This iPhone reports no haptics hardware"])
        }
        if engine == nil {
            let e = try CHHapticEngine()
            e.playsHapticsOnly = true
            e.isAutoShutdownEnabled = true
            e.resetHandler = { [weak self] in
                _ = try? self?.engine?.start()
            }
            e.stoppedHandler = { [weak self] reason in
                self?.engineError = "stopped (\(reason.rawValue))"
            }
            engine = e
        }
        try engine?.start()
        let event = CHHapticEvent(
            eventType: .hapticTransient,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
            ],
            relativeTime: 0
        )
        let pattern = try CHHapticPattern(events: [event], parameters: [])
        try engine?.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
    }

    /** What this phone says about haptics, for the Settings diagnosis. */
    @objc func diagnose(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            call.resolve([
                "supportsHaptics": CHHapticEngine.capabilitiesForHardware().supportsHaptics,
                "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled,
                "category": session.category.rawValue,
                "otherAudio": session.isOtherAudioPlaying,
                "hapticsDuringRecording": session.allowHapticsAndSystemSoundsDuringRecording,
                "engineError": self.engineError,
                "ios": UIDevice.current.systemVersion,
            ])
        }
    }

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
        let intensity = Float(call.getDouble("intensity") ?? 0.7)
        if style == "core" {
            DispatchQueue.main.async {
                do {
                    try self.coreTap(intensity, 0.55)
                    call.resolve()
                } catch {
                    self.engineError = error.localizedDescription
                    call.reject(error.localizedDescription)
                }
            }
            return
        }
        DispatchQueue.main.async {
            switch style {
            case "vibrate":
                // The full, old-style vibration. Not a tap — about half a
                // second — so it is kept for alarms and confirmations. It
                // goes through the ring/silent vibration settings rather than
                // System Haptics.
                AudioServicesPlayAlertSound(SystemSoundID(kSystemSoundID_Vibrate))
            case "system-strong":
                AudioServicesPlaySystemSound(1520)
            case "selection":
                self.selection.selectionChanged()
                self.selection.prepare()
            case "medium":
                self.medium.impactOccurred()
                self.medium.prepare()
            case "system":
                // The Peek tap, played as a system sound. It goes straight to
                // the Taptic Engine without UIFeedbackGenerator, which iOS
                // mutes when System Haptics is off.
                AudioServicesPlaySystemSound(1519)
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
