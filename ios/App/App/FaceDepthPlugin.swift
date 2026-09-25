import ARKit
import Capacitor
import AVFoundation
import CoreImage
import UIKit

/**
 * TrueDepth face scan, for the web app.
 *
 * ARKit's face tracking runs on the front TrueDepth camera (infrared dot
 * projector + IR camera) and fits a 1,220-point face mesh in real metres, 60
 * times a second. This plugin opens a full-screen live view, waits for a
 * steady, neutral, square-on face at a usable distance, averages the mesh
 * over N such frames, and resolves with everything the JavaScript side needs
 * to measure it.
 *
 * What the mesh IS: a deformable model fitted to the depth data, with the
 * same topology for every face. That makes it very repeatable between scans,
 * which is what progress tracking needs — but it is regularised toward an
 * average face, so fine individual detail is smoothed. It is not a raw scan.
 *
 * Nothing leaves the device: the result goes to the web view and is stored
 * locally by the app.
 *
 * JS: FaceDepth.isSupported(), FaceDepth.scan({ frames }), FaceDepth.cancel(),
 * and a "faceFrame" event (~8/s) with pose and distance so the app can drive
 * its audio coach while this screen is up.
 */
@objc(FaceDepthPlugin)
public class FaceDepthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FaceDepthPlugin"
    public let jsName = "FaceDepth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    private var scanner: FaceScanViewController?

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": ARFaceTrackingConfiguration.isSupported])
    }

    @objc func scan(_ call: CAPPluginCall) {
        guard ARFaceTrackingConfiguration.isSupported else {
            call.reject("TrueDepth face tracking is not available on this device.")
            return
        }
        let frames = max(5, min(120, call.getInt("frames") ?? 30))
        let minDistance = Float(call.getDouble("minDistance") ?? 0.25)
        let maxDistance = Float(call.getDouble("maxDistance") ?? 0.50)
        let sweep = call.getString("mode") == "sweep"
        let sides = sweep && (call.getBool("sides") ?? false)

        DispatchQueue.main.async {
            let vc = FaceScanViewController(frames: frames, minDistance: minDistance, maxDistance: maxDistance,
                                            sweep: sweep, sides: sides)
            vc.onFrame = { [weak self] info in
                self?.notifyListeners("faceFrame", data: info)
            }
            vc.onFinish = { [weak self] result in
                self?.scanner = nil
                switch result {
                case .success(let data): call.resolve(data)
                case .failure(let error): call.reject(error.localizedDescription)
                }
            }
            vc.modalPresentationStyle = .fullScreen
            self.scanner = vc
            self.bridge?.viewController?.present(vc, animated: true)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.scanner?.cancel()
            call.resolve()
        }
    }
}

// MARK: - Scan screen

final class FaceScanViewController: UIViewController, ARSCNViewDelegate, ARSessionDelegate {
    enum ScanError: LocalizedError {
        case cancelled
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: return "Scan cancelled."
            case .failed(let message): return message
            }
        }
    }

    /// Pose limits for a frame to count. Tight on purpose: averaging turned or
    /// smiling frames into a "neutral" mesh is exactly the error to avoid.
    private static let maxYaw: Float = 6
    private static let maxPitch: Float = 7
    private static let maxRoll: Float = 3
    private static let timeout: TimeInterval = 45
    private static let sweepTimeout: TimeInterval = 90

    // MARK: Sweep
    //
    // A Face ID-style scan: after a still front burst, the head circles
    // slowly and every depth pixel lands on a CYLINDER round the head's
    // vertical axis — radius r at (angle θ round the head, height y), both in
    // the face's own axes. A front-only height map cannot hold the cheeks and
    // jaw sides; a cylinder holds everything from one ear to the other.
    //
    // Each cell keeps a random sample of up to 12 readings and reports their
    // MEDIAN, so frames with a slipped pose cannot drag it. Depth frames go
    // alternately to two independent cylinders, A and B: how much they
    // disagree is this scan's own measurement noise.
    let sweep: Bool
    // ±160° and down to 25 cm below the face origin: the side views reach
    // round towards the back of the neck, and the neck and collarbone need
    // rows well below the chin.
    static let cylThetaMin: Float = -160
    static let cylThetaStep: Float = 1
    static let cylW = 321
    static let cylYMin: Float = -0.250
    static let cylYStep: Float = 0.0015
    static let cylH = 227
    /// The cylinder's axis: this far behind the face origin, roughly the middle of the head.
    static let cylZc: Float = -0.060
    static let reservoir = 12
    /// A reading this many degrees round from where the camera looks straight
    /// at the surface is too oblique for TrueDepth to be trusted.
    static let maxGrazing: Float = 60
    /// Degrees per second of head movement above which depth and pose smear.
    static let maxSpeed: Float = 40
    private var cylA = [Float](repeating: 0, count: FaceScanViewController.cylW * FaceScanViewController.cylH * FaceScanViewController.reservoir)
    private var cylB = [Float](repeating: 0, count: FaceScanViewController.cylW * FaceScanViewController.cylH * FaceScanViewController.reservoir)
    private var cntA = [UInt16](repeating: 0, count: FaceScanViewController.cylW * FaceScanViewController.cylH)
    private var cntB = [UInt16](repeating: 0, count: FaceScanViewController.cylW * FaceScanViewController.cylH)
    private var cylFrames = 0
    private var rng: UInt32 = 0x9E3779B9
    private var ticks = [Bool](repeating: false, count: 60)
    /// The sweep as four spoken moves instead of a free circle: chin up, chin
    /// down, head to the left, head to the right. Each is the ring's tick
    /// index it points at (screen: 0 top, 15 right, 30 bottom, 45 left).
    private static let looks: [(tick: Int, say: String)] = [
        (0, "Step 1 of 5: slowly tilt your chin up, then back."),
        (30, "Now slowly chin down, then back."),
        (45, "Now turn your head to your left, then back."),
        (15, "Now turn your head to your right, then back."),
    ]
    private var looksDone = [Bool](repeating: false, count: 4)
    private var sweepExtras: [String: Any] = [:]
    /// A light copy of the front and head-move depth frames (every 4th pixel,
    /// with ARKit's pose), so the web side can re-place each one by shape and
    /// fuse again — ARKit's pose wobbles about 1 mm and 1° per frame.
    private var sweepRaw: [[String: Any]] = []
    private var sweepDepthSeen = 0
    private var frontRawCount = 0
    private static let maxSweepRaw = 70
    private static let maxFrontRaw = 15
    private var lastPose: (yaw: Float, pitch: Float, t: TimeInterval)?
    private var frontPhoto: (score: Float, url: String)?
    private var obliquePhotos: [Int: (score: Float, url: String, yaw: Float)] = [:]
    private var lastEncode: TimeInterval = 0

    // MARK: Sides
    //
    // With `sides`, the ring is followed by two whole-body turns: phone fixed
    // (on a mirror), feet on floor marks, head locked to the shoulders so the
    // neck is not twisted. Past ~50° ARKit loses the face, so the frames are
    // sent raw — each a cloud of depth points in camera space — and the web
    // side places them on the face model by matching shapes (ICP). Turn
    // frames chain the tracking round; hold frames, taken standing still
    // side-on, are what gets measured.
    // After the right side hold: one step back to the posture mark, side-on,
    // so the frame takes in the neck, shoulders and upper back.
    // The order, all the close work first, then all the far: left side at
    // 30 cm, round through the front to the right side at 30 cm, one step back
    // to the posture mark, then round to the left side there.
    enum SideStage: String {
        case none, turnLeft, holdLeft, turnRight, holdRight, stepBack, holdPostureRight, turnPostureLeft, holdPostureLeft
    }
    /// A turn to the far side has to pass the front first, so standing on the
    /// side just left is not mistaken for having arrived.
    private var passedFront = false
    private static let postureFrames = 12
    let sides: Bool
    private var sideStage: SideStage = .none
    private var stageStartedAt: TimeInterval = 0
    private var sideFrames: [String: [[String: Any]]] = ["right": [], "left": []]
    private var holdCount = 0
    private var lastBody: Float?
    /// What happened on each side, for the results card: so a failed side
    /// says why instead of just "0 holds".
    private var sideDiag: [String: [String: Any]] = ["right": [:], "left": [:]]
    private var stageDepthFrames = 0
    private var stillCount = 0
    private var lastFace: ARFaceAnchor?
    private var gravitySum = SIMD3<Float>(repeating: 0)
    private var gravityN = 0
    private static let holdFrames = 20
    private static let maxTurnFrames = 90
    private static let stageTimeout: TimeInterval = 30

    let targetFrames: Int
    let minDistance: Float
    let maxDistance: Float
    var onFrame: (([String: Any]) -> Void)?
    var onFinish: ((Result<[String: Any], Error>) -> Void)?

    private let sceneView = ARSCNView(frame: .zero)
    private let ring = ScanRingView(frame: .zero)
    private let label = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private var vertexSums: [SIMD3<Float>] = []
    private var blendSums: [String: Float] = [:]
    private var leftEyeSum = SIMD3<Float>(repeating: 0)
    private var rightEyeSum = SIMD3<Float>(repeating: 0)
    private var poseSum = SIMD3<Float>(repeating: 0)
    private var distanceSum: Float = 0
    private var collected = 0
    private var finished = false
    private var lastNotify: TimeInterval = 0
    private var startedAt = Date()
    private var triangleIndices: [Int16] = []

    // Raw TrueDepth depth, averaged onto a grid in the FACE's axes: each cell
    // holds the mean z (how far forward the surface is) at that x/y. Unlike
    // the mesh this is measured, not fitted — noisier per frame, but averaged
    // over many frames it shows the face's real shape, asymmetry included.
    static let cell: Float = 0.0015
    static let gridXMin: Float = -0.090
    static let gridYMin: Float = -0.120
    static let gridW = 120  // 180 mm
    static let gridH = 134  // 201 mm
    /// Depth arrives at ~15/s against 60 video frames, so wait for this many.
    private static let minDepthFrames = 15
    private var depthSum = [Float](repeating: 0, count: FaceScanViewController.gridW * FaceScanViewController.gridH)
    private var depthCount = [UInt16](repeating: 0, count: FaceScanViewController.gridW * FaceScanViewController.gridH)
    private var depthFrames = 0

    init(frames: Int, minDistance: Float, maxDistance: Float, sweep: Bool = false, sides: Bool = false) {
        self.targetFrames = frames
        self.minDistance = minDistance
        self.maxDistance = maxDistance
        self.sweep = sweep
        self.sides = sides
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        sceneView.translatesAutoresizingMaskIntoConstraints = false
        sceneView.delegate = self
        sceneView.session.delegate = self
        sceneView.automaticallyUpdatesLighting = true
        view.addSubview(sceneView)

        // Face ID's look: a plain screen, a round window onto the camera, and
        // a ring of ticks that fills as frames are collected.
        ring.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(ring)

        label.translatesAutoresizingMaskIntoConstraints = false
        label.textColor = .label
        label.font = .systemFont(ofSize: 20, weight: .semibold)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.text = "Look straight at the screen."
        view.addSubview(label)

        // The ring shows progress; the bar is kept only as the value's home.
        progress.isHidden = true
        progress.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(progress)

        let cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = .boldSystemFont(ofSize: 17)
        cancelButton.tintColor = .label
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            sceneView.topAnchor.constraint(equalTo: view.topAnchor),
            sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ring.topAnchor.constraint(equalTo: view.topAnchor),
            ring.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            ring.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            ring.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            cancelButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            NSLayoutConstraint(item: label, attribute: .centerY, relatedBy: .equal,
                               toItem: view, attribute: .bottom, multiplier: 0.76, constant: 0),
            progress.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            progress.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            progress.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
        ])
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let config = ARFaceTrackingConfiguration()
        config.isLightEstimationEnabled = true
        startedAt = Date()
        sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    @objc private func cancelTapped() { cancel() }

    func cancel() { finish(.failure(ScanError.cancelled)) }

    // Live wireframe, so it is obvious what is being measured.
    func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
        guard anchor is ARFaceAnchor, let device = sceneView.device,
              let geometry = ARSCNFaceGeometry(device: device) else { return nil }
        geometry.firstMaterial?.fillMode = .lines
        geometry.firstMaterial?.diffuse.contents = UIColor(red: 0.04, green: 0.52, blue: 1, alpha: 0.9)
        return SCNNode(geometry: geometry)
    }

    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let face = anchor as? ARFaceAnchor, let geometry = node.geometry as? ARSCNFaceGeometry else { return }
        geometry.update(from: face.geometry)
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        finish(.failure(ScanError.failed("Face tracking stopped: \(error.localizedDescription)")))
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard !finished else { return }
        if sideStage != .none {
            handleSides(frame)
            return
        }
        let elapsed = Date().timeIntervalSince(startedAt)
        if elapsed > (sweep ? Self.sweepTimeout : Self.timeout) {
            // A sweep that covered most of the head is still worth keeping.
            if sweep, collected >= 10, cylFrames >= 20, let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first {
                complete(frame: frame, face: face)
            } else {
                finish(.failure(ScanError.failed("Could not hold a steady, neutral pose in time. Try again with even light.")))
            }
            return
        }
        guard let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked else {
            show("I can't see your face.", ok: false, pose: nil, distance: nil, face: nil)
            return
        }

        // Face pose in the portrait view's axes: x right, y up, z toward you.
        let inView = frame.camera.viewMatrix(for: .portrait) * face.transform
        let pose = Self.angles(inView)
        let distance = simd_length(SIMD3(inView.columns.3.x, inView.columns.3.y, inView.columns.3.z))

        let shapes = face.blendShapes
        func value(_ key: ARFaceAnchor.BlendShapeLocation) -> Float { shapes[key]?.floatValue ?? 0 }
        let smile = max(value(.mouthSmileLeft), value(.mouthSmileRight))
        let jawOpen = value(.jawOpen)
        let blink = max(value(.eyeBlinkLeft), value(.eyeBlinkRight))

        // One correction at a time, most important first.
        var message = "Hold still…"
        var ok = true
        if distance < minDistance { message = "Move the phone a little further away."; ok = false }
        else if distance > maxDistance { message = "Bring the phone a little closer."; ok = false }
        else if abs(pose.yaw) > Self.maxYaw { message = "Face the screen straight on."; ok = false }
        else if pose.pitch > Self.maxPitch { message = "Chin up a little."; ok = false }
        else if pose.pitch < -Self.maxPitch { message = "Chin down a little."; ok = false }
        else if abs(pose.roll) > Self.maxRoll { message = "Level your head."; ok = false }
        else if smile > 0.3 || jawOpen > 0.2 { message = "Relax your mouth, teeth apart."; ok = false }
        else if blink > 0.5 { message = "Eyes open."; ok = false }

        let frontDone = collected >= targetFrames && (depthFrames >= Self.minDepthFrames || collected >= targetFrames * 4)
        lastFace = face
        if ok && !frontDone {
            accumulate(face, pose: pose, distance: distance)
            accumulateDepth(frame, face: face)
            // Which way is down, in the face's own axes, while standing
            // naturally square-on: the reference for neck lean and head tilt.
            let down = face.transform.inverse * SIMD4<Float>(0, -1, 0, 0)
            gravitySum += SIMD3(down.x, down.y, down.z)
            gravityN += 1
            if sweep, frame.capturedDepthData != nil, frontRawCount < Self.maxFrontRaw,
               let entry = Self.rawFrame(frame, face: face, stage: "front", step: 4) {
                sweepRaw.append(entry)
                frontRawCount += 1
            }
        }
        if ok { considerFrontPhoto(frame, pose: pose, blink: blink) }

        guard sweep else {
            show(message, ok: ok, pose: pose, distance: distance, face: face)
            // Enough mesh frames AND enough depth frames — or, if this device never
            // delivers depth, give up waiting for it after four times as long.
            if frontDone { complete(frame: frame, face: face) }
            return
        }

        // Sweep: the still front burst first, then the circle.
        let now = frame.timestamp
        var speed: Float = 0
        if let last = lastPose, now > last.t {
            speed = hypot(pose.yaw - last.yaw, pose.pitch - last.pitch) / Float(now - last.t)
        }
        lastPose = (pose.yaw, pose.pitch, now)
        var sweepMessage = message
        var sweepOk = false
        if !frontDone {
            sweepMessage = ok ? "Hold still, looking straight at the screen…" : message
        } else if distance < minDistance {
            sweepMessage = "Move the phone a little further away."
        } else if distance > maxDistance {
            sweepMessage = "Bring the phone a little closer."
        } else if smile > 0.3 || jawOpen > 0.2 {
            sweepMessage = "Relax your mouth, teeth apart."
        } else if abs(pose.yaw) > 48 || abs(pose.pitch) > 32 || abs(pose.roll) > 14 {
            sweepMessage = "Not so far — keep your eyes on the screen."
        } else if speed > Self.maxSpeed {
            sweepMessage = "Slower."
        } else {
            sweepOk = true
            let next = looksDone.firstIndex(of: false) ?? 3
            sweepMessage = Self.looks[next].say
        }
        if sweepOk, frame.capturedDepthData != nil {
            accumulateCylinder(frame, face: face)
            sweepDepthSeen += 1
            if sweepDepthSeen % 3 == 0, sweepRaw.count < Self.maxSweepRaw + Self.maxFrontRaw,
               let entry = Self.rawFrame(frame, face: face, stage: "sweep", step: 4) {
                sweepRaw.append(entry)
            }
            // Face ID's ring: the ticks in the direction the head points fill.
            // The preview is a mirror: a head turned to its left (yaw > 0)
            // points to the screen's left; chin down (pitch > 0) points down.
            if hypot(pose.yaw, pose.pitch) >= 15 {
                let a = atan2(pose.pitch, -pose.yaw) * 180 / .pi
                let i = Int(((a + 90) / 6).rounded())
                for d in -1...1 { ticks[((i + d) % 60 + 60) % 60] = true }
                // A move counts when the head points within ~25° of it; its
                // whole quarter of the ring then lights, so progress is obvious.
                for (k, look) in Self.looks.enumerated() where !looksDone[k] {
                    let off = abs(((i - look.tick) % 60 + 90) % 60 - 30)
                    if off <= 4 {
                        looksDone[k] = true
                        for d in -7...7 { ticks[((look.tick + d) % 60 + 60) % 60] = true }
                    }
                }
            }
            considerObliquePhoto(frame, pose: pose, blink: blink)
        }
        let filled = ticks.filter { $0 }.count
        // Target and cursor for the ring; the same numbers go to the app's
        // audio coach so beeps quicken as the head nears the target.
        var targetError: Float = 0
        var targetDir = ""
        if frontDone, let next = looksDone.firstIndex(of: false) {
            let t = Self.looks[next].tick
            ring.target = t
            let a = (-90 + Float(t) * 6) * .pi / 180
            // Screen position of the head direction, in units of the 20° a move needs.
            let cur = SIMD2<Float>(-pose.yaw, pose.pitch) / 20
            let want = SIMD2<Float>(cos(a), sin(a))
            ring.cursor = CGPoint(x: CGFloat(cur.x), y: CGFloat(cur.y))
            targetError = simd_length(want - cur) * 20
            targetDir = t == 0 ? "up" : t == 15 ? "right" : t == 30 ? "down" : "left"
        } else {
            ring.target = nil
            ring.cursor = frontDone ? nil : CGPoint(x: CGFloat(-pose.yaw / 20), y: CGFloat(pose.pitch / 20))
        }
        sweepExtras = ["targetError": targetError, "targetDir": targetDir, "looksDone": looksDone.filter { $0 }.count]
        showSweep(sweepMessage, ok: sweepOk || (!frontDone && ok), pose: pose, distance: distance, face: face,
                  front: frontDone, filled: filled)
        if frontDone && !looksDone.contains(false) && cylFrames >= 40 {
            if sides {
                sideStage = .turnLeft
                passedFront = true
                stageStartedAt = frame.timestamp
                stillCount = 0
                ring.filled = nil
                ring.target = nil
                ring.cursor = nil
            } else {
                complete(frame: frame, face: face)
            }
        }
    }

    /// Unproject every depth pixel into 3D, move it into the face's own axes
    /// using ARKit's pose, and add it to the grid. Pixels further than 15 cm in
    /// front of or behind the face plane are background, hair or hands.
    private func accumulateDepth(_ frame: ARFrame, face: ARFaceAnchor) {
        guard let raw = frame.capturedDepthData else { return }
        let depth = raw.depthDataType == kCVPixelFormatType_DepthFloat32
            ? raw : raw.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let map = depth.depthDataMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return }
        let w = CVPixelBufferGetWidth(map)
        let h = CVPixelBufferGetHeight(map)
        let rowBytes = CVPixelBufferGetBytesPerRow(map)

        // The depth map covers the same view as the colour frame at a lower
        // resolution, so the colour camera's intrinsics scale straight down.
        let k = frame.camera.intrinsics
        let res = frame.camera.imageResolution
        let sx = Float(w) / Float(res.width)
        let sy = Float(h) / Float(res.height)
        let fx = k.columns.0.x * sx, fy = k.columns.1.y * sy
        let cx = k.columns.2.x * sx, cy = k.columns.2.y * sy

        // Camera (ARKit axes: x right, y up, z back) → world → face.
        let toFace = face.transform.inverse * frame.camera.transform
        let W = Self.gridW, H = Self.gridH, cell = Self.cell
        let x0 = Self.gridXMin, y0 = Self.gridYMin
        var used = 0
        for v in 0..<h {
            let row = base.advanced(by: v * rowBytes).assumingMemoryBound(to: Float32.self)
            for u in 0..<w {
                let z = row[u]
                guard z.isFinite, z > 0.1, z < 1.0 else { continue }
                // Pixel → camera: image y runs down and depth runs forward,
                // both opposite to ARKit's camera axes.
                let pc = SIMD4<Float>((Float(u) - cx) / fx * z, -(Float(v) - cy) / fy * z, -z, 1)
                let pf = toFace * pc
                guard abs(pf.z) < 0.15 else { continue }
                let i = Int((pf.x - x0) / cell)
                let j = Int((pf.y - y0) / cell)
                guard i >= 0, i < W, j >= 0, j < H else { continue }
                let idx = j * W + i
                depthSum[idx] += pf.z
                if depthCount[idx] < UInt16.max { depthCount[idx] += 1 }
                used += 1
            }
        }
        if used > 500 { depthFrames += 1 }
    }

    /// Where the person is in a depth frame: the nearest surfaces (10th
    /// percentile) and the median of everything within 15 cm of them. Taken
    /// over the whole image, not its centre — a whole-body turn swings the
    /// head sideways, and the centre can end up on the room behind.
    private static func bodyDepth(_ data: AVDepthData) -> (near: Float, body: Float)? {
        let depth = data.depthDataType == kCVPixelFormatType_DepthFloat32
            ? data : data.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let map = depth.depthDataMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let w = CVPixelBufferGetWidth(map), h = CVPixelBufferGetHeight(map)
        let rowBytes = CVPixelBufferGetBytesPerRow(map)
        var v: [Float] = []
        for y in stride(from: 0, to: h, by: 8) {
            let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
            for x in stride(from: 0, to: w, by: 8) {
                let z = row[x]
                if z.isFinite && z > 0.12 && z < 0.8 { v.append(z) }
            }
        }
        guard v.count > 100 else { return nil }
        v.sort()
        let near = v[v.count / 10]
        let person = v.filter { $0 < near + 0.15 }
        return (near, person[person.count / 2])
    }

    /// The depth frame as camera-space points (ARKit camera axes), in 0.1 mm
    /// Int16 triples — small enough to send a hundred frames to the web side.
    private static func cloud(_ frame: ARFrame, step: Int) -> Data? {
        guard let raw = frame.capturedDepthData else { return nil }
        let depth = raw.depthDataType == kCVPixelFormatType_DepthFloat32
            ? raw : raw.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let map = depth.depthDataMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let w = CVPixelBufferGetWidth(map), h = CVPixelBufferGetHeight(map)
        let rowBytes = CVPixelBufferGetBytesPerRow(map)
        let k = frame.camera.intrinsics
        let res = frame.camera.imageResolution
        let sx = Float(w) / Float(res.width), sy = Float(h) / Float(res.height)
        let fx = k.columns.0.x * sx, fy = k.columns.1.y * sy
        let cx = k.columns.2.x * sx, cy = k.columns.2.y * sy
        var out: [Int16] = []
        out.reserveCapacity((w / step) * (h / step) * 3)
        for v in stride(from: 0, to: h, by: step) {
            let row = base.advanced(by: v * rowBytes).assumingMemoryBound(to: Float32.self)
            for u in stride(from: 0, to: w, by: step) {
                let z = row[u]
                guard z.isFinite, z > 0.12, z < 0.85 else { continue }
                let x = (Float(u) - cx) / fx * z
                let y = -(Float(v) - cy) / fy * z
                out.append(Int16((x * 10000).rounded()))
                out.append(Int16((y * 10000).rounded()))
                out.append(Int16((-z * 10000).rounded()))
            }
        }
        guard out.count > 300 else { return nil }
        return out.withUnsafeBufferPointer { Data(buffer: $0) }
    }

    /// A depth frame as a point cloud plus ARKit's camera → face pose.
    private static func rawFrame(_ frame: ARFrame, face: ARFaceAnchor, stage: String, step: Int) -> [String: Any]? {
        guard face.isTracked, let data = cloud(frame, step: step) else { return nil }
        let m = face.transform.inverse * frame.camera.transform
        return ["stage": stage, "points": data.base64EncodedString(),
                "pose": [m.columns.0, m.columns.1, m.columns.2, m.columns.3].flatMap { [$0.x, $0.y, $0.z, $0.w] }]
    }

    private func recordSideFrame(_ frame: ARFrame, side: String, stage: String, step: Int, face: ARFaceAnchor?) {
        guard let data = Self.cloud(frame, step: step) else { return }
        var entry: [String: Any] = ["stage": stage, "points": data.base64EncodedString()]
        if let f = face, f.isTracked {
            // Camera → face, metres, column-major: the starting guess for matching.
            let m = f.transform.inverse * frame.camera.transform
            entry["pose"] = [m.columns.0, m.columns.1, m.columns.2, m.columns.3].flatMap { [$0.x, $0.y, $0.z, $0.w] }
        }
        sideFrames[side, default: []].append(entry)
    }

    private func handleSides(_ frame: ARFrame) {
        let now = frame.timestamp
        let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first
        let tracked = face?.isTracked == true
        var yaw: Float?
        if let f = face, tracked { yaw = Self.angles(frame.camera.viewMatrix(for: .portrait) * f.transform).yaw }
        if let f = face, tracked { lastFace = f }
        if tracked, let y = yaw, abs(y) < 20 { passedFront = true }

        var centre: Float?
        if let d = frame.capturedDepthData, let b = Self.bodyDepth(d) {
            stageDepthFrames += 1
            centre = b.near
            // Standing sway is a few mm; 3 mm between depth frames (~1/15 s) is still.
            if let last = lastBody, abs(b.body - last) < 0.003 { stillCount += 1 } else { stillCount = 0 }
            lastBody = b.body
        }
        let still = stillCount >= 5
        let rightStages: [SideStage] = [.turnRight, .holdRight, .stepBack, .holdPostureRight]
        let side = rightStages.contains(sideStage) ? "right" : "left"
        let posture = [.stepBack, .holdPostureRight, .turnPostureLeft, .holdPostureLeft].contains(sideStage)
        var message = ""
        var ok = false
        var progress: Float = 0

        // A stage that never settles is skipped rather than failing the scan.
        if now - stageStartedAt > Self.stageTimeout {
            if posture {
                sideDiag[side]?["posture"] = [.stepBack, .turnPostureLeft].contains(sideStage)
                    ? "never still at the posture mark" : "posture hold not finished"
            } else {
                sideDiag[side]?["outcome"] = [.turnLeft, .turnRight].contains(sideStage) ? "never still side-on" : "hold not finished"
                sideDiag[side]?["depthFrames"] = stageDepthFrames
                if let c = centre { sideDiag[side]?["distance"] = Double(c) }
            }
            advanceSide(frame, now: now)
            return
        }

        // Past where ARKit can follow the face — or clearly turned while it
        // still can — after passing the front: that is side-on.
        let turned = passedFront && (!tracked || (yaw.map { abs($0) > 60 } ?? true))
        let turnCap = Self.maxTurnFrames + Self.holdFrames + 120

        switch sideStage {
        case .turnLeft, .turnRight:
            message = sideStage == .turnLeft
                ? "Step 2 of 5: turn your whole body left, onto the side mark."
                : "Step 3 of 5: turn right, round through the front, to the right side mark."
            if frame.capturedDepthData != nil, (sideFrames[side]?.count ?? 0) < turnCap {
                recordSideFrame(frame, side: side, stage: "turn", step: 8, face: face)
            }
            if turned && still, let c = centre {
                if c < 0.22 { message = "Step back a little." }
                else if c > 0.42 { message = "Step a little closer." }
                else {
                    sideStage = sideStage == .turnLeft ? .holdLeft : .holdRight
                    stageStartedAt = now
                    holdCount = 0
                    sideDiag[side]?["turnDepthFrames"] = stageDepthFrames
                    stageDepthFrames = 0
                    message = "Eyes on the sticker. Hold still."
                    ok = true
                }
            }
        case .holdLeft, .holdRight:
            message = "Eyes on the sticker. Hold still."
            ok = still
            if still, frame.capturedDepthData != nil {
                recordSideFrame(frame, side: side, stage: "hold", step: 5, face: face)
                holdCount += 1
            }
            progress = Float(holdCount) / Float(Self.holdFrames)
            if holdCount >= Self.holdFrames {
                sideDiag[side]?["outcome"] = "held"
                sideDiag[side]?["depthFrames"] = stageDepthFrames
                if let c = centre { sideDiag[side]?["distance"] = Double(c) }
                advanceSide(frame, now: now)
                return
            }
        case .stepBack, .turnPostureLeft:
            // Frames while moving chain the tracking out to the posture mark
            // (and round to the other side), the way turn frames do.
            message = sideStage == .stepBack
                ? "Step 4 of 5: one step back to the posture mark. Stay side-on."
                : "Step 5 of 5: at the posture mark, turn round to face left side-on."
            if frame.capturedDepthData != nil, (sideFrames[side]?.count ?? 0) < turnCap + 80 {
                recordSideFrame(frame, side: side, stage: "turn", step: 8, face: face)
            }
            let arrived = sideStage == .stepBack || turned
            if arrived && still, let c = centre, c > 0.42, c < 0.75 {
                sideStage = sideStage == .stepBack ? .holdPostureRight : .holdPostureLeft
                stageStartedAt = now
                holdCount = 0
                message = "Stand tall and relaxed. Hold still."
                ok = true
            }
        case .holdPostureRight, .holdPostureLeft:
            message = "Stand tall and relaxed. Hold still."
            ok = still
            if still, frame.capturedDepthData != nil {
                recordSideFrame(frame, side: side, stage: "posture", step: 5, face: face)
                holdCount += 1
            }
            progress = Float(holdCount) / Float(Self.postureFrames)
            if holdCount >= Self.postureFrames {
                sideDiag[side]?["posture"] = "held"
                advanceSide(frame, now: now)
                return
            }
        case .none:
            return
        }

        label.text = message
        label.textColor = ok ? .systemGreen : .label
        ring.tracking = tracked
        ring.progress = progress
        let wall = Date().timeIntervalSince1970
        guard wall - lastNotify > 0.12 else { return }
        lastNotify = wall
        var info: [String: Any] = ["tracked": tracked, "ok": ok, "message": message,
                                   "collected": holdCount, "target": Self.holdFrames, "phase": sideStage.rawValue]
        if let c = centre { info["distance"] = c }
        onFrame?(info)
    }

    private func advanceSide(_ frame: ARFrame, now: TimeInterval) {
        stageStartedAt = now
        stillCount = 0
        holdCount = 0
        stageDepthFrames = 0
        switch sideStage {
        case .turnLeft, .holdLeft:
            sideStage = .turnRight
            passedFront = false
        case .turnRight, .holdRight: sideStage = .stepBack
        case .stepBack, .holdPostureRight:
            sideStage = .turnPostureLeft
            passedFront = false
        default:
            sideStage = .none
            if let f = lastFace { complete(frame: frame, face: f) } else {
                finish(.failure(ScanError.failed("Lost the face model before finishing.")))
            }
        }
    }

    /// Every depth pixel (every other one — still ~75,000 a frame) onto the
    /// cylinder, as a random sample per cell so memory stays fixed.
    private func accumulateCylinder(_ frame: ARFrame, face: ARFaceAnchor) {
        guard let raw = frame.capturedDepthData else { return }
        let depth = raw.depthDataType == kCVPixelFormatType_DepthFloat32
            ? raw : raw.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let map = depth.depthDataMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return }
        let w = CVPixelBufferGetWidth(map)
        let h = CVPixelBufferGetHeight(map)
        let rowBytes = CVPixelBufferGetBytesPerRow(map)
        let k = frame.camera.intrinsics
        let res = frame.camera.imageResolution
        let sx = Float(w) / Float(res.width)
        let sy = Float(h) / Float(res.height)
        let fx = k.columns.0.x * sx, fy = k.columns.1.y * sy
        let cx = k.columns.2.x * sx, cy = k.columns.2.y * sy

        let toFace = face.transform.inverse * frame.camera.transform
        let camera = toFace.columns.3
        let deg: Float = 180 / .pi
        let zc = Self.cylZc
        let thetaCamera = atan2(camera.x, camera.z - zc) * deg
        let W = Self.cylW, H = Self.cylH, R = Self.reservoir
        let toA = cylFrames % 2 == 0
        var used = 0
        var v = 0
        while v < h {
            let row = base.advanced(by: v * rowBytes).assumingMemoryBound(to: Float32.self)
            var u = 0
            while u < w {
                let z = row[u]
                u += 2
                guard z.isFinite, z > 0.1, z < 0.7 else { continue }
                let pc = SIMD4<Float>((Float(u - 2) - cx) / fx * z, -(Float(v) - cy) / fy * z, -z, 1)
                let pf = toFace * pc
                let dz = pf.z - zc
                let r = (pf.x * pf.x + dz * dz).squareRoot()
                guard r > 0.03, r < 0.15, pf.z > -0.14 else { continue }
                let theta = atan2(pf.x, dz) * deg
                guard abs(theta - thetaCamera) < Self.maxGrazing else { continue }
                let i = Int(((theta - Self.cylThetaMin) / Self.cylThetaStep).rounded())
                let j = Int(((pf.y - Self.cylYMin) / Self.cylYStep).rounded())
                guard i >= 0, i < W, j >= 0, j < H else { continue }
                let cell = j * W + i
                let mm = r * 1000
                // Reservoir sampling: every reading ever seen has the same
                // chance of being among the 12 kept.
                rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5
                if toA {
                    let n = Int(cntA[cell])
                    if n < R { cylA[cell * R + n] = mm } else {
                        let slot = Int(rng % UInt32(n + 1)); if slot < R { cylA[cell * R + slot] = mm }
                    }
                    if cntA[cell] < UInt16.max { cntA[cell] += 1 }
                } else {
                    let n = Int(cntB[cell])
                    if n < R { cylB[cell * R + n] = mm } else {
                        let slot = Int(rng % UInt32(n + 1)); if slot < R { cylB[cell * R + slot] = mm }
                    }
                    if cntB[cell] < UInt16.max { cntB[cell] += 1 }
                }
                used += 1
            }
            v += 2
        }
        if used > 400 { cylFrames += 1 }
    }

    /// Median of each cell's kept readings, mm; NaN with fewer than 3.
    private static func medians(_ samples: [Float], _ counts: [UInt16]) -> [Float] {
        let R = reservoir
        var out = [Float](repeating: .nan, count: counts.count)
        var buf = [Float](repeating: 0, count: R)
        for c in 0..<counts.count {
            let n = min(Int(counts[c]), R)
            guard n >= 3 else { continue }
            for k in 0..<n { buf[k] = samples[c * R + k] }
            let sorted = buf[0..<n].sorted()
            out[c] = n % 2 == 1 ? sorted[n / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        }
        return out
    }

    /// Keep the squarest, eyes-open front frame as the scan's photo. JPEG
    /// encoding is slow, so at most one every 0.4 s.
    private func considerFrontPhoto(_ frame: ARFrame, pose: (yaw: Float, pitch: Float, roll: Float), blink: Float) {
        guard blink < 0.4 else { return }
        let score = abs(pose.yaw) + abs(pose.pitch) + 2 * abs(pose.roll)
        let now = frame.timestamp
        if let best = frontPhoto, best.score <= score + 0.5 { return }
        guard now - lastEncode > 0.4, let url = Self.portraitJPEG(frame.capturedImage) else { return }
        lastEncode = now
        frontPhoto = (score, url)
    }

    /// The best 45°-ish frame on each side, for the 2D oblique analysis.
    private func considerObliquePhoto(_ frame: ARFrame, pose: (yaw: Float, pitch: Float, roll: Float), blink: Float) {
        let yaw = abs(pose.yaw)
        guard blink < 0.4, yaw >= 28, yaw <= 48, abs(pose.pitch) <= 8, abs(pose.roll) <= 6 else { return }
        let side = pose.yaw > 0 ? 1 : -1
        let score = abs(yaw - 38) + abs(pose.pitch) + abs(pose.roll)
        let now = frame.timestamp
        if let best = obliquePhotos[side], best.score <= score + 0.5 { return }
        guard now - lastEncode > 0.4, let url = Self.portraitJPEG(frame.capturedImage) else { return }
        lastEncode = now
        obliquePhotos[side] = (score, url, pose.yaw)
    }

    private func showSweep(_ text: String, ok: Bool, pose: (yaw: Float, pitch: Float, roll: Float), distance: Float,
                           face: ARFaceAnchor, front: Bool, filled: Int) {
        label.text = text
        label.textColor = ok ? .systemGreen : .label
        ring.tracking = true
        if front { ring.filled = ticks } else { ring.progress = Float(collected) / Float(targetFrames) }
        let now = Date().timeIntervalSince1970
        guard now - lastNotify > 0.12 else { return }
        lastNotify = now
        var info: [String: Any] = ["tracked": true, "ok": ok, "message": text, "collected": front ? filled : collected,
                                   "target": front ? 60 : targetFrames, "phase": front ? "sweep" : "front",
                                   "yaw": pose.yaw, "pitch": pose.pitch, "roll": pose.roll, "distance": distance]
        for (k, v) in sweepExtras { info[k] = v }
        onFrame?(info)
    }

    private func accumulate(_ face: ARFaceAnchor, pose: (yaw: Float, pitch: Float, roll: Float), distance: Float) {
        let vertices = face.geometry.vertices
        if vertexSums.isEmpty {
            vertexSums = Array(repeating: SIMD3<Float>(repeating: 0), count: vertices.count)
            triangleIndices = face.geometry.triangleIndices
        }
        guard vertices.count == vertexSums.count else { return }
        for i in 0..<vertices.count { vertexSums[i] += vertices[i] }
        for (key, number) in face.blendShapes { blendSums[key.rawValue, default: 0] += number.floatValue }
        let l = face.leftEyeTransform.columns.3
        let r = face.rightEyeTransform.columns.3
        leftEyeSum += SIMD3(l.x, l.y, l.z)
        rightEyeSum += SIMD3(r.x, r.y, r.z)
        poseSum += SIMD3(pose.yaw, pose.pitch, pose.roll)
        distanceSum += distance
        collected += 1
    }

    private func show(_ text: String, ok: Bool, pose: (yaw: Float, pitch: Float, roll: Float)?, distance: Float?, face: ARFaceAnchor?) {
        label.text = text
        label.textColor = ok ? .systemGreen : .label
        progress.progress = Float(collected) / Float(targetFrames)
        ring.progress = progress.progress
        ring.tracking = face != nil

        let now = Date().timeIntervalSince1970
        guard now - lastNotify > 0.12 else { return }
        lastNotify = now
        var info: [String: Any] = ["tracked": face != nil, "ok": ok, "message": text,
                                   "collected": collected, "target": targetFrames]
        if let pose = pose {
            info["yaw"] = pose.yaw
            info["pitch"] = pose.pitch
            info["roll"] = pose.roll
        }
        if let distance = distance { info["distance"] = distance }
        onFrame?(info)
    }

    private func complete(frame: ARFrame, face: ARFaceAnchor) {
        let n = Float(collected)
        // Millimetres, in the face's own axes (x to the viewer's right, y up,
        // z out of the face), as little-endian Float32 triples.
        var mm = [Float]()
        mm.reserveCapacity(vertexSums.count * 3)
        for v in vertexSums {
            let a = v / n * 1000
            mm.append(a.x); mm.append(a.y); mm.append(a.z)
        }
        let vertexData = mm.withUnsafeBufferPointer { Data(buffer: $0) }
        let triangleData = triangleIndices.withUnsafeBufferPointer { Data(buffer: $0) }
        var blend: [String: Float] = [:]
        for (key, sum) in blendSums { blend[key] = sum / n }
        let leftEye = leftEyeSum / n * 1000
        let rightEye = rightEyeSum / n * 1000
        let pose = poseSum / n
        let k = frame.camera.intrinsics

        var result: [String: Any] = [
            "vertexCount": vertexSums.count,
            "vertices": vertexData.base64EncodedString(),
            "triangles": triangleData.base64EncodedString(),
            "blendShapes": blend,
            "leftEye": [leftEye.x, leftEye.y, leftEye.z],
            "rightEye": [rightEye.x, rightEye.y, rightEye.z],
            "yaw": pose.x, "pitch": pose.y, "roll": pose.z,
            "distance": distanceSum / n,
            "frames": collected,
            "intrinsics": [k.columns.0.x, k.columns.0.y, k.columns.0.z,
                           k.columns.1.x, k.columns.1.y, k.columns.1.z,
                           k.columns.2.x, k.columns.2.y, k.columns.2.z],
            "imageResolution": [Double(frame.camera.imageResolution.width), Double(frame.camera.imageResolution.height)],
        ]
        if let photo = frontPhoto?.url ?? Self.portraitJPEG(frame.capturedImage) { result["image"] = photo }
        if sweep && cylFrames > 0 {
            let a = Self.medians(cylA, cntA)
            let b = Self.medians(cylB, cntB)
            result["cylA"] = a.withUnsafeBufferPointer { Data(buffer: $0) }.base64EncodedString()
            result["cylB"] = b.withUnsafeBufferPointer { Data(buffer: $0) }.base64EncodedString()
            result["cylWidth"] = Self.cylW
            result["cylHeight"] = Self.cylH
            result["cylThetaMinDeg"] = Double(Self.cylThetaMin)
            result["cylThetaStepDeg"] = Double(Self.cylThetaStep)
            result["cylYMinMm"] = Double(Self.cylYMin * 1000)
            result["cylYStepMm"] = Double(Self.cylYStep * 1000)
            result["cylAxisZMm"] = Double(Self.cylZc * 1000)
            result["cylFrames"] = cylFrames
            result["sweepCoverage"] = Double(ticks.filter { $0 }.count) / 60
            if !sweepRaw.isEmpty { result["sweepFrames"] = sweepRaw }
            var obliques: [[String: Any]] = []
            for (_, o) in obliquePhotos { obliques.append(["image": o.url, "yaw": Double(o.yaw)]) }
            result["obliques"] = obliques
            if gravityN > 0 {
                let g = simd_normalize(gravitySum / Float(gravityN))
                result["gravityFace"] = [g.x, g.y, g.z]
            }
            if sides {
                result["sides"] = ["right": sideFrames["right"] ?? [], "left": sideFrames["left"] ?? []]
                result["sideDiag"] = sideDiag
            }
        }

        // The averaged depth surface, mm, NaN where too few samples landed
        // (a single sample is too noisy to trust).
        if depthFrames > 0 {
            var grid = [Float](repeating: .nan, count: depthSum.count)
            var filled = 0
            for i in 0..<grid.count where depthCount[i] >= 3 {
                grid[i] = depthSum[i] / Float(depthCount[i]) * 1000
                filled += 1
            }
            let gridData = grid.withUnsafeBufferPointer { Data(buffer: $0) }
            result["depthGrid"] = gridData.base64EncodedString()
            result["depthGridWidth"] = Self.gridW
            result["depthGridHeight"] = Self.gridH
            result["depthCellMm"] = Double(Self.cell * 1000)
            result["depthOriginMm"] = [Double(Self.gridXMin * 1000), Double(Self.gridYMin * 1000)]
            result["depthFrames"] = depthFrames
            result["depthCoverage"] = Double(filled) / Double(grid.count)
        }
        finish(.success(result))
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        guard !finished else { return }
        finished = true
        sceneView.session.pause()
        let done = onFinish
        dismiss(animated: true) { done?(result) }
    }

    /// Head angles from a rigid transform, read as R = Ry(yaw)·Rx(pitch)·Rz(roll)
    /// — the same decomposition the web app uses (pose-angles.ts), so the two
    /// agree on what "turned" and "chin down" mean. pitch > 0 is chin down.
    static func angles(_ m: simd_float4x4) -> (yaw: Float, pitch: Float, roll: Float) {
        let r02 = m.columns.2.x, r12 = m.columns.2.y, r22 = m.columns.2.z
        let r10 = m.columns.0.y, r11 = m.columns.1.y
        let deg: Float = 180 / .pi
        let pitch = asin(max(-1, min(1, -r12))) * deg
        let yaw = atan2(r02, r22) * deg
        let roll = atan2(r10, r11) * deg
        return (yaw, pitch, roll)
    }

    /// The camera frame, upright for portrait, as a JPEG data URL. The sensor
    /// delivers landscape; `.right` turns it upright for a phone held portrait.
    static func portraitJPEG(_ buffer: CVPixelBuffer) -> String? {
        let image = CIImage(cvPixelBuffer: buffer).oriented(.right)
        let context = CIContext()
        guard let cg = context.createCGImage(image, from: image.extent),
              let data = UIImage(cgImage: cg).jpegData(compressionQuality: 0.85) else { return nil }
        return "data:image/jpeg;base64," + data.base64EncodedString()
    }
}

/**
 * Face ID-style frame: the screen's background colour everywhere except a
 * round window onto the camera, ringed by 60 ticks that turn green as the
 * scan fills up.
 */
final class ScanRingView: UIView {
    private static let count = 60
    private let cover = CAShapeLayer()
    private var ticks: [CAShapeLayer] = []

    /// 0–1.
    var progress: Float = 0 { didSet { if progress != oldValue { paint() } } }
    private let targetLayer = CAShapeLayer()
    private let cursorLayer = CAShapeLayer()
    private var centre = CGPoint.zero
    private var radius: CGFloat = 0
    /// Where to point the head next: a tick index (0 top, 15 right, 30 bottom, 45 left), or nil.
    var target: Int? { didSet { if target != oldValue { place() } } }
    /// Where the head points now, on screen: unit = the 20° a move needs.
    var cursor: CGPoint? { didSet { place() } }
    /// Sweep mode: exactly which ticks are done, Face ID style. Overrides progress.
    var filled: [Bool]? { didSet { if filled != oldValue { paint() } } }
    /// A face is in view: unfilled ticks go from faint to grey.
    var tracking = false { didSet { if tracking != oldValue { paint() } } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        cover.fillRule = .evenOdd
        layer.addSublayer(cover)
        for _ in 0..<Self.count {
            let t = CAShapeLayer()
            t.lineWidth = 4
            t.lineCap = .round
            layer.addSublayer(t)
            ticks.append(t)
        }
        targetLayer.fillColor = UIColor.systemYellow.cgColor
        targetLayer.strokeColor = UIColor.white.cgColor
        targetLayer.lineWidth = 2
        cursorLayer.fillColor = UIColor.systemBlue.cgColor
        cursorLayer.strokeColor = UIColor.white.cgColor
        cursorLayer.lineWidth = 2
        layer.addSublayer(targetLayer)
        layer.addSublayer(cursorLayer)
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 1
        pulse.toValue = 0.35
        pulse.duration = 0.6
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        targetLayer.add(pulse, forKey: "pulse")
    }

    /// The target sits just outside the ring where the head should point; the
    /// cursor moves from the middle towards the ring as the head turns, so
    /// "steer the blue dot onto the yellow one" is the whole instruction.
    private func place() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if let t = target {
            let a = -CGFloat.pi / 2 + CGFloat(t) * 2 * .pi / CGFloat(Self.count)
            let p = CGPoint(x: centre.x + cos(a) * (radius + 48), y: centre.y + sin(a) * (radius + 48))
            targetLayer.path = UIBezierPath(arcCenter: p, radius: 13, startAngle: 0, endAngle: 2 * .pi, clockwise: true).cgPath
            targetLayer.isHidden = false
        } else {
            targetLayer.isHidden = true
        }
        if let c = cursor {
            let m = min(1.25, hypot(c.x, c.y))
            let d = hypot(c.x, c.y) > 0 ? CGPoint(x: c.x / hypot(c.x, c.y), y: c.y / hypot(c.x, c.y)) : .zero
            let reach = radius + 48
            let p = CGPoint(x: centre.x + d.x * m * reach, y: centre.y + d.y * m * reach)
            cursorLayer.path = UIBezierPath(arcCenter: p, radius: 9, startAngle: 0, endAngle: 2 * .pi, clockwise: true).cgPath
            cursorLayer.isHidden = false
        } else {
            cursorLayer.isHidden = true
        }
        CATransaction.commit()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let r = min(bounds.width, bounds.height) * 0.33
        let c = CGPoint(x: bounds.midX, y: bounds.height * 0.40)
        centre = c
        radius = r
        targetLayer.frame = bounds
        cursorLayer.frame = bounds
        let path = UIBezierPath(rect: bounds)
        path.append(UIBezierPath(ovalIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)))
        cover.frame = bounds
        cover.path = path.cgPath
        for (i, t) in ticks.enumerated() {
            let a = -CGFloat.pi / 2 + CGFloat(i) * 2 * .pi / CGFloat(Self.count)
            let tick = UIBezierPath()
            tick.move(to: CGPoint(x: c.x + cos(a) * (r + 14), y: c.y + sin(a) * (r + 14)))
            tick.addLine(to: CGPoint(x: c.x + cos(a) * (r + 34), y: c.y + sin(a) * (r + 34)))
            t.frame = bounds
            t.path = tick.cgPath
        }
        paint()
        place()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        paint()
    }

    private func paint() {
        cover.fillColor = UIColor.systemBackground.cgColor
        let count = Int((progress * Float(Self.count)).rounded())
        let idle = tracking ? UIColor.systemGray2 : UIColor.systemGray4
        for (i, t) in ticks.enumerated() {
            let done = filled.map { i < $0.count && $0[i] } ?? (i < count)
            t.strokeColor = (done ? UIColor.systemGreen : idle).resolvedColor(with: traitCollection).cgColor
        }
    }
}
