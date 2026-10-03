import AppIntents
import AudioToolbox
import AVFoundation
import CoreLocation
import UserNotifications
import Capacitor
import CoreHaptics
import HealthKit
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
        bridge?.registerPluginInstance(HealthPlugin())
        bridge?.registerPluginInstance(GymPlugin())
        bridge?.registerPluginInstance(NativeChromePlugin())
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

/**
 * Apple Health, read-only: steps, active energy, sleep and weight for a day.
 *
 * Nothing is written to Health. iOS never says whether reading was refused —
 * a refused read just comes back empty — so "connected" means the permission
 * sheet was shown, and empty values mean either nothing logged or no access.
 * JS: Health.available() / Health.connect() / Health.day({ date: "YYYY-MM-DD" })
 */
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "day", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWeight", returnType: CAPPluginReturnPromise),
    ]

    /** What SOMA writes: the workout, its energy, the night, the weigh-in. */
    private var writeTypes: Set<HKSampleType> {
        var types = Set<HKSampleType>([HKObjectType.workoutType()])
        if let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { types.insert(t) }
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(t) }
        return types
    }

    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let t = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { types.insert(t) }
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { types.insert(t) }
        types.insert(HKObjectType.workoutType())
        if let t = HKObjectType.categoryType(forIdentifier: .mindfulSession) { types.insert(t) }
        return types
    }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["ok": false, "error": "Health data is not available on this device"])
            return
        }
        store.requestAuthorization(toShare: writeTypes, read: readTypes) { ok, error in
            call.resolve(["ok": ok, "error": error?.localizedDescription ?? ""])
        }
    }

    @objc func day(_ call: CAPPluginCall) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        guard let dateString = call.getString("date"), let start = formatter.date(from: dateString) else {
            call.reject("A date like 2026-10-02 is needed")
            return
        }
        let calendar = Calendar.current
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start
        let group = DispatchGroup()
        let lock = NSLock()
        var out: [String: Any] = [:]
        var errors: [String] = []
        func put(_ key: String, _ value: Any?) {
            lock.lock()
            if let value = value { out[key] = value }
            lock.unlock()
        }
        func fail(_ error: Error?) {
            guard let error = error else { return }
            lock.lock()
            errors.append(error.localizedDescription)
            lock.unlock()
        }

        let dayRange = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ key: String) {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
            group.enter()
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: dayRange, options: .cumulativeSum) { _, stats, error in
                fail(error)
                put(key, stats?.sumQuantity()?.doubleValue(for: unit))
                group.leave()
            }
            store.execute(query)
        }
        sum(.stepCount, HKUnit.count(), "steps")
        sum(.activeEnergyBurned, HKUnit.kilocalorie(), "activeKcal")

        // The latest weigh-in on or before the day.
        if let mass = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            group.enter()
            let upTo = HKQuery.predicateForSamples(withStart: nil, end: end, options: [])
            let newest = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: mass, predicate: upTo, limit: 1, sortDescriptors: [newest]) { _, samples, error in
                fail(error)
                if let sample = samples?.first as? HKQuantitySample {
                    put("weightKg", sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo)))
                    put("weightDate", formatter.string(from: sample.endDate))
                }
                group.leave()
            }
            store.execute(query)
        }

        // Mindful minutes: every session that started today.
        if let mindful = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
            group.enter()
            let query = HKSampleQuery(sampleType: mindful, predicate: dayRange, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                fail(error)
                let seconds = (samples ?? []).reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                if seconds > 0 { put("mindfulMin", seconds / 60) }
                group.leave()
            }
            store.execute(query)
        }

        // Resting heart rate: the day's latest reading.
        if let rhr = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) {
            group.enter()
            let newest = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: rhr, predicate: dayRange, limit: 1, sortDescriptors: [newest]) { _, samples, error in
                fail(error)
                if let sample = samples?.first as? HKQuantitySample {
                    put("restingHR", sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())))
                }
                group.leave()
            }
            store.execute(query)
        }

        // Last night: asleep time between 6pm the evening before and noon.
        // Watch and phone often both record the same night, so the asleep
        // intervals are merged rather than added.
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let from = calendar.date(byAdding: .hour, value: -6, to: start) ?? start
            let to = calendar.date(byAdding: .hour, value: 12, to: start) ?? end
            let night = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
            let query = HKSampleQuery(sampleType: sleep, predicate: night, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                fail(error)
                // 1 asleep, 3 core, 4 deep, 5 REM; 0 in bed and 2 awake are not sleep.
                let asleep: Set<Int> = [1, 3, 4, 5]
                let spans = (samples as? [HKCategorySample] ?? [])
                    .filter { asleep.contains($0.value) }
                    .map { (max($0.startDate, from), min($0.endDate, to)) }
                    .filter { $0.0 < $0.1 }
                    .sorted { $0.0 < $1.0 }
                var total: TimeInterval = 0
                var current: (Date, Date)?
                for span in spans {
                    if let c = current, span.0 <= c.1 {
                        current = (c.0, max(c.1, span.1))
                    } else {
                        if let c = current { total += c.1.timeIntervalSince(c.0) }
                        current = span
                    }
                }
                if let c = current { total += c.1.timeIntervalSince(c.0) }
                if total > 0 { put("sleepHours", total / 3600) }
                group.leave()
            }
            store.execute(query)
        }

        group.notify(queue: .main) {
            lock.lock()
            var result = out
            if !errors.isEmpty { result["errors"] = errors }
            lock.unlock()
            call.resolve(result)
        }
    }

    /** Which of SOMA's write permissions were granted (sharing status is not private). */
    @objc func canWrite(_ call: CAPPluginCall) {
        func ok(_ t: HKObjectType?) -> Bool {
            guard let t = t else { return false }
            return store.authorizationStatus(for: t) == .sharingAuthorized
        }
        call.resolve([
            "workouts": ok(HKObjectType.workoutType()),
            "energy": ok(HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)),
            "sleep": ok(HKObjectType.categoryType(forIdentifier: .sleepAnalysis)),
            "weight": ok(HKObjectType.quantityType(forIdentifier: .bodyMass)),
        ])
    }

    /**
     * Save `samples`, first deleting whatever SOMA saved before under the same
     * id — so editing a session or a night replaces it in Health instead of
     * adding a second copy.
     */
    private func replace(_ type: HKSampleType, id: String, with samples: [HKSample], then: @escaping (Bool, Error?) -> Void) {
        let mine = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [id])
        store.deleteObjects(of: type, predicate: mine) { _, _, _ in
            if samples.isEmpty {
                then(true, nil)
                return
            }
            self.store.save(samples) { ok, error in then(ok, error) }
        }
    }

    private func date(_ call: CAPPluginCall, _ key: String) -> Date? {
        guard let ms = call.getDouble(key) else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    /** A strength session, as a workout Fitness lists, with its calories. */
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let start = date(call, "start"), let end = date(call, "end"), end > start else {
            call.reject("id, start and end are needed")
            return
        }
        let kcal = call.getDouble("kcal") ?? 0
        let title = call.getString("title") ?? "Strength"
        let energy = kcal > 0 ? HKQuantity(unit: .kilocalorie(), doubleValue: kcal) : nil
        let workout = HKWorkout(
            activityType: .traditionalStrengthTraining,
            start: start,
            end: end,
            duration: end.timeIntervalSince(start),
            totalEnergyBurned: energy,
            totalDistance: nil,
            metadata: [HKMetadataKeyExternalUUID: id, HKMetadataKeyWorkoutBrandName: title]
        )
        replace(HKObjectType.workoutType(), id: id, with: [workout]) { ok, error in
            guard ok, let energy = energy,
                  let type = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) else {
                call.resolve(["ok": ok, "error": error?.localizedDescription ?? ""])
                return
            }
            // The energy as its own sample, tied to the workout, which is what
            // the Move ring and Fitness's calorie totals count.
            let sample = HKQuantitySample(type: type, quantity: energy, start: start, end: end,
                                          metadata: [HKMetadataKeyExternalUUID: id + "-kcal"])
            self.replace(type, id: id + "-kcal", with: []) { _, _ in
                self.store.add([sample], to: workout) { ok2, error2 in
                    call.resolve(["ok": ok2, "error": error2?.localizedDescription ?? ""])
                }
            }
        }
    }

    /** One night asleep, from start to end. */
    @objc func saveSleep(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let start = date(call, "start"), let end = date(call, "end"), end > start,
              let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.reject("id, start and end are needed")
            return
        }
        // 1 is "asleep" (unspecified stage) — SOMA knows the hours, not the stages.
        let sample = HKCategorySample(type: type, value: 1, start: start, end: end,
                                      metadata: [HKMetadataKeyExternalUUID: id])
        replace(type, id: id, with: [sample]) { ok, error in
            call.resolve(["ok": ok, "error": error?.localizedDescription ?? ""])
        }
    }

    @objc func saveWeight(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let at = date(call, "at"), let kg = call.getDouble("kg"), kg > 0,
              let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            call.reject("id, at and kg are needed")
            return
        }
        let sample = HKQuantitySample(type: type, quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
                                      start: at, end: at, metadata: [HKMetadataKeyExternalUUID: id])
        replace(type, id: id, with: [sample]) { ok, error in
            call.resolve(["ok": ok, "error": error?.localizedDescription ?? ""])
        }
    }
}


// MARK: - Deep work through a Focus

/**
 * A Focus filter: Settings › Focus › (a focus) › Add Filter › SOMA, and turn
 * "Count as deep work" on. iOS runs this when that Focus turns on — with the
 * value set — and again when it turns off, with the value back at its default
 * (off). That pair is a session, kept in the shared container until SOMA
 * takes it and counts the minutes.
 */
@available(iOS 16.0, *)
struct SomaFocusFilter: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "SOMA"
    static var description: IntentDescription? = IntentDescription("Count the time this Focus is on as deep work in SOMA.")

    @Parameter(title: "Count as deep work", default: false)
    var deepWork: Bool

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: deepWork ? "Counts as deep work" : "Not counted")
    }

    func perform() async throws -> some IntentResult {
        FocusStore.focus(on: deepWork)
        return .result()
    }
}

// MARK: - Gym arrival

/**
 * Watches one place — your gym — and, on arrival, records it and posts a
 * notification. Created at launch (AppDelegate) so that iOS, which relaunches
 * the app in the background for a region event, finds the delegate waiting.
 */
final class GymMonitor: NSObject, CLLocationManagerDelegate {
    static let shared = GymMonitor()
    static let regionId = "soma-gym"
    let manager = CLLocationManager()
    private var pending: ((CLLocation?, String?) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
    }

    var gym: CLCircularRegion? {
        manager.monitoredRegions.first { $0.identifier == Self.regionId } as? CLCircularRegion
    }

    var always: Bool { CLLocationManager.authorizationStatus() == .authorizedAlways }

    /// Make where the phone is now the gym.
    func setHere(_ done: @escaping (CLLocation?, String?) -> Void) {
        pending = done
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        switch CLLocationManager.authorizationStatus() {
        case .notDetermined:
            manager.requestAlwaysAuthorization()
        case .denied, .restricted:
            pending = nil
            done(nil, "Location is off for SOMA — Settings › SOMA › Location › Always")
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            manager.requestLocation()
        default:
            manager.requestLocation()
        }
    }

    func clear() {
        for r in manager.monitoredRegions where r.identifier == Self.regionId {
            manager.stopMonitoring(for: r)
        }
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        guard let done = pending else { return }
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            pending = nil
            done(nil, "Location was not allowed")
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let done = pending, let here = locations.last else { return }
        pending = nil
        clear()
        let region = CLCircularRegion(center: here.coordinate, radius: 150, identifier: Self.regionId)
        region.notifyOnEntry = true
        region.notifyOnExit = false
        manager.startMonitoring(for: region)
        done(here, nil)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let done = pending else { return }
        pending = nil
        done(nil, error.localizedDescription)
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == Self.regionId else { return }
        FocusStore.arrivedAtGym()
        let content = UNMutableNotificationContent()
        content.title = "At the gym 💪"
        content.body = "Open SOMA — today's session is ready."
        content.sound = .default
        let request = UNNotificationRequest(identifier: "soma-gym-arrival", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }
}

/// JS: Gym.setHere() / Gym.clear() / Gym.status()
@objc(GymPlugin)
public class GymPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GymPlugin"
    public let jsName = "Gym"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setHere", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    @objc func setHere(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GymMonitor.shared.setHere { here, error in
                if let here = here {
                    call.resolve(["ok": true, "lat": here.coordinate.latitude, "lon": here.coordinate.longitude,
                                  "always": GymMonitor.shared.always])
                } else {
                    call.resolve(["ok": false, "error": error ?? "No location"])
                }
            }
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GymMonitor.shared.clear()
            call.resolve(["ok": true])
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let gym = GymMonitor.shared.gym
            var out: [String: Any] = ["set": gym != nil, "always": GymMonitor.shared.always]
            if let gym = gym {
                out["lat"] = gym.center.latitude
                out["lon"] = gym.center.longitude
            }
            call.resolve(out)
        }
    }
}
