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

        label.translatesAutoresizingMaskIntoConstraints = false
        label.textColor = .white
        label.font = .boldSystemFont(ofSize: 18)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        label.text = "Look straight at the screen."
        view.addSubview(label)

        progress.translatesAutoresizingMaskIntoConstraints = false
        progress.progressTintColor = UIColor(red: 0.83, green: 0.99, blue: 0.31, alpha: 1)
        view.addSubview(progress)

        let cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = .boldSystemFont(ofSize: 17)
        cancelButton.tintColor = .white
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            sceneView.topAnchor.constraint(equalTo: view.topAnchor),
            sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            cancelButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            label.bottomAnchor.constraint(equalTo: progress.topAnchor, constant: -8),
            label.heightAnchor.constraint(greaterThanOrEqualToConstant: 64),
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

        if ok { accumulate(face, pose: pose, distance: distance) }
        show(message, ok: ok, pose: pose, distance: distance, face: face)

        if collected >= targetFrames { complete(frame: frame, face: face) }
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
        label.textColor = ok ? UIColor(red: 0.2, green: 0.85, blue: 0.4, alpha: 1) : .white
        progress.progress = Float(collected) / Float(targetFrames)

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
