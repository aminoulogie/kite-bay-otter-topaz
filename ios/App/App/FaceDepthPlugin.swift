import ARKit
import Capacitor
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

        DispatchQueue.main.async {
            let vc = FaceScanViewController(frames: frames, minDistance: minDistance, maxDistance: maxDistance)
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

    init(frames: Int, minDistance: Float, maxDistance: Float) {
        self.targetFrames = frames
        self.minDistance = minDistance
        self.maxDistance = maxDistance
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
        if Date().timeIntervalSince(startedAt) > Self.timeout {
            finish(.failure(ScanError.failed("Could not hold a steady, neutral pose in time. Try again with even light.")))
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

        if ok {
            accumulate(face, pose: pose, distance: distance)
            accumulateDepth(frame, face: face)
        }
        show(message, ok: ok, pose: pose, distance: distance, face: face)

        // Enough mesh frames AND enough depth frames — or, if this device never
        // delivers depth, give up waiting for it after four times as long.
        if collected >= targetFrames && (depthFrames >= Self.minDepthFrames || collected >= targetFrames * 4) {
            complete(frame: frame, face: face)
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
        if let photo = Self.portraitJPEG(frame.capturedImage) { result["image"] = photo }

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
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let r = min(bounds.width, bounds.height) * 0.33
        let c = CGPoint(x: bounds.midX, y: bounds.height * 0.40)
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
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        paint()
    }

    private func paint() {
        cover.fillColor = UIColor.systemBackground.cgColor
        let filled = Int((progress * Float(Self.count)).rounded())
        let idle = tracking ? UIColor.systemGray2 : UIColor.systemGray4
        for (i, t) in ticks.enumerated() {
            t.strokeColor = (i < filled ? UIColor.systemGreen : idle).resolvedColor(with: traitCollection).cgColor
        }
    }
}
