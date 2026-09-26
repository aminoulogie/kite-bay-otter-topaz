import ARKit
import Capacitor
import UIKit

/**
 * LiDAR body scan, for the web app.
 *
 * Runs ARKit body tracking on the back camera — the phone on a wall mount, the
 * person 1.5–4.5 m away — and returns two versions of the skeleton, averaged
 * over a steady burst:
 *
 * - `skeleton`: ARKit's fitted 3D skeleton (91 joints, metres). Smooth and
 *   repeatable, but a MODEL: its bone lengths may be a template scaled to the
 *   body rather than this body's own.
 * - `measured`: the joints ARKit finds in the camera image, placed in 3D by
 *   reading the LiDAR depth at each one. Noisier, but real distances. Both are
 *   expressed in the body's own space so a little sway between frames does not
 *   smear them.
 *
 * Modes: "front" (facing the phone, for knees and proportions) and "side"
 * (turned 90°, for posture). JS: BodyDepth.isSupported(), BodyDepth.scan({mode}),
 * BodyDepth.cancel(), and a "bodyFrame" event (~8/s) for the audio coach.
 */
@objc(BodyDepthPlugin)
public class BodyDepthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BodyDepthPlugin"
    public let jsName = "BodyDepth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    // UIViewController, not BodyScanViewController: the app still targets
    // iOS 13 and a stored property cannot carry an iOS 14 type.
    private var scanner: UIViewController?

    @objc func isSupported(_ call: CAPPluginCall) {
        guard #available(iOS 14.0, *) else {
            call.resolve(["supported": false, "lidar": false])
            return
        }
        call.resolve([
            "supported": ARBodyTrackingConfiguration.isSupported,
            "lidar": ARBodyTrackingConfiguration.supportsFrameSemantics(.sceneDepth),
        ])
    }

    @objc func scan(_ call: CAPPluginCall) {
        guard #available(iOS 14.0, *), ARBodyTrackingConfiguration.isSupported else {
            call.reject("Body tracking is not available on this device.")
            return
        }
        let mode = call.getString("mode") == "side" ? "side" : "front"
        let frames = max(10, min(120, call.getInt("frames") ?? 30))
        DispatchQueue.main.async {
            let vc = BodyScanViewController(mode: mode, frames: frames)
            vc.onFrame = { [weak self] info in self?.notifyListeners("bodyFrame", data: info) }
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
            if #available(iOS 14.0, *) { (self.scanner as? BodyScanViewController)?.cancel() }
            call.resolve()
        }
    }
}

@available(iOS 14.0, *)
final class BodyScanViewController: UIViewController, ARSessionDelegate {
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

    private static let timeout: TimeInterval = 90
    private static let minDistance: Float = 1.5
    private static let maxDistance: Float = 4.5
    /// Root movement between frames beyond this is not "holding still".
    private static let maxSway: Float = 0.012

    let mode: String
    let targetFrames: Int
    var onFrame: (([String: Any]) -> Void)?
    var onFinish: ((Result<[String: Any], Error>) -> Void)?

    private let sceneView = ARSCNView(frame: .zero)
    private let overlay = CAShapeLayer()
    private let label = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private var finished = false
    private var startedAt = Date()
    private var lastNotify: TimeInterval = 0
    private var lastRoot: SIMD3<Float>?
    private var collected = 0
    private var scaleSum: Float = 0
    private var anchorScaleSum: Float = 0
    private var distanceSum: Float = 0

    // Fitted skeleton, model space (relative to the hip root), summed per joint.
    private var skeletonNames: [String] = []
    private var skeletonSum: [SIMD3<Float>] = []
    // LiDAR-measured 2D joints, body space, summed per joint with counts.
    private var measuredNames: [String] = []
    private var measuredSum: [SIMD3<Float>] = []
    private var measuredCount: [Int] = []

    init(mode: String, frames: Int) {
        self.mode = mode
        self.targetFrames = frames
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        sceneView.translatesAutoresizingMaskIntoConstraints = false
        sceneView.session.delegate = self
        view.addSubview(sceneView)

        overlay.strokeColor = UIColor(red: 0.04, green: 0.52, blue: 1, alpha: 0.95).cgColor
        overlay.fillColor = UIColor(red: 0.04, green: 0.52, blue: 1, alpha: 0.95).cgColor
        overlay.lineWidth = 3
        view.layer.addSublayer(overlay)

        label.translatesAutoresizingMaskIntoConstraints = false
        label.textColor = .white
        label.font = .boldSystemFont(ofSize: 20)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        label.text = mode == "side" ? "Stand sideways to the phone." : "Face the phone, knees gently together, arms a little out."
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

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        overlay.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let config = ARBodyTrackingConfiguration()
        config.automaticSkeletonScaleEstimationEnabled = true
        if ARBodyTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }
        startedAt = Date()
        sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    @objc private func cancelTapped() { cancel() }
    func cancel() { finish(.failure(ScanError.cancelled)) }

    func session(_ session: ARSession, didFailWithError error: Error) {
        finish(.failure(ScanError.failed("Body tracking stopped: \(error.localizedDescription)")))
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard !finished else { return }
        if Date().timeIntervalSince(startedAt) > Self.timeout {
            finish(.failure(ScanError.failed("Could not hold a steady, fully visible pose in time.")))
            return
        }
        drawSkeleton(frame)

        guard let body = frame.anchors.compactMap({ $0 as? ARBodyAnchor }).first, body.isTracked else {
            show("Step into view — whole body, head to feet.", code: "find", distance: nil)
            return
        }
        let root = SIMD3(body.transform.columns.3.x, body.transform.columns.3.y, body.transform.columns.3.z)
        let cam = SIMD3(frame.camera.transform.columns.3.x, frame.camera.transform.columns.3.y, frame.camera.transform.columns.3.z)
        let distance = simd_length(root - cam)

        // `code` is what the web app's audio coach keys on; `message` is shown here.
        var message = "Hold still…"
        var code = "hold"
        if !wholeBodyVisible(frame) {
            message = "Step back until your head and feet are both in view."; code = "frame"
        } else if distance < Self.minDistance {
            message = "Step back a little."; code = "back"
        } else if distance > Self.maxDistance {
            message = "Come a little closer."; code = "closer"
        } else if let facing = facingCosine(body, camera: cam), mode == "front" && facing > 0.35 {
            message = "Turn to face the phone squarely."; code = "face"
        } else if let facing = facingCosine(body, camera: cam), mode == "side" && facing < 0.85 {
            message = "Turn fully sideways to the phone."; code = "side"
        } else if let last = lastRoot, simd_length(root - last) > Self.maxSway {
            message = "Hold still."; code = "still"
        }
        lastRoot = root

        if code == "hold" {
            accumulate(body, frame: frame, distance: distance)
            if collected >= targetFrames { complete(frame: frame, body: body) }
        }
        show(message, code: code, distance: distance)
    }

    /// |cos| of the angle between the shoulder line and the direction to the
    /// camera, both flattened to the floor: ~0 when facing the phone (or with
    /// your back to it), ~1 when side-on.
    private func facingCosine(_ body: ARBodyAnchor, camera: SIMD3<Float>) -> Float? {
        guard let l = body.skeleton.modelTransform(for: ARSkeleton.JointName(rawValue: "left_arm_joint")),
              let r = body.skeleton.modelTransform(for: ARSkeleton.JointName(rawValue: "right_arm_joint")) else { return nil }
        let lw = body.transform * l.columns.3
        let rw = body.transform * r.columns.3
        var lateral = SIMD3(rw.x - lw.x, 0, rw.z - lw.z)
        let root = body.transform.columns.3
        var toCam = SIMD3(camera.x - root.x, 0, camera.z - root.z)
        guard simd_length(lateral) > 0.05, simd_length(toCam) > 0.1 else { return nil }
        lateral = simd_normalize(lateral)
        toCam = simd_normalize(toCam)
        return abs(simd_dot(lateral, toCam))
    }

    private func wholeBodyVisible(_ frame: ARFrame) -> Bool {
        guard let body2D = frame.detectedBody else { return false }
        let names = body2D.skeleton.definition.jointNames
        let points = body2D.skeleton.jointLandmarks
        var sawHead = false
        var feet = 0
        for (i, name) in names.enumerated() where i < points.count {
            let p = points[i]
            guard !p.x.isNaN, !p.y.isNaN, p.x > 0.01, p.x < 0.99, p.y > 0.01, p.y < 0.99 else { continue }
            if name.contains("head") { sawHead = true }
            if name.contains("foot") { feet += 1 }
        }
        return sawHead && feet >= 2
    }

    /// The anchor's pose with any scale taken out, so "body space" is in metres.
    private static func rigid(_ m: simd_float4x4) -> simd_float4x4 {
        func unit(_ c: SIMD4<Float>) -> SIMD4<Float> {
            let v = simd_normalize(SIMD3(c.x, c.y, c.z))
            return SIMD4(v.x, v.y, v.z, 0)
        }
        return simd_float4x4(unit(m.columns.0), unit(m.columns.1), unit(m.columns.2), m.columns.3)
    }

    private func accumulate(_ body: ARBodyAnchor, frame: ARFrame, distance: Float) {
        // Model space → world (applies whatever scale ARKit put on the anchor)
        // → back into a metre-scaled body frame, so both skeletons are in metres.
        let bodyFrame = Self.rigid(body.transform)
        let toBody = bodyFrame.inverse
        let modelToBody = toBody * body.transform

        // Fitted skeleton.
        let names = body.skeleton.definition.jointNames
        let transforms = body.skeleton.jointModelTransforms
        if skeletonSum.isEmpty {
            skeletonNames = names
            skeletonSum = Array(repeating: SIMD3<Float>(repeating: 0), count: names.count)
        }
        if transforms.count == skeletonSum.count {
            for i in 0..<transforms.count {
                let c = modelToBody * transforms[i].columns.3
                skeletonSum[i] += SIMD3(c.x, c.y, c.z)
            }
        }

        // LiDAR-measured joints: the 2D joint, placed at the depth read there.
        if let body2D = frame.detectedBody, let depth = frame.sceneDepth?.depthMap {
            let names2D = body2D.skeleton.definition.jointNames
            if measuredNames.isEmpty {
                measuredNames = names2D
                measuredSum = Array(repeating: SIMD3<Float>(repeating: 0), count: names2D.count)
                measuredCount = Array(repeating: 0, count: names2D.count)
            }
            let cameraToBody = toBody * frame.camera.transform
            CVPixelBufferLockBaseAddress(depth, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(depth, .readOnly) }
            if let base = CVPixelBufferGetBaseAddress(depth) {
                let w = CVPixelBufferGetWidth(depth)
                let h = CVPixelBufferGetHeight(depth)
                let rowBytes = CVPixelBufferGetBytesPerRow(depth)
                let k = frame.camera.intrinsics
                let res = frame.camera.imageResolution
                let sx = Float(w) / Float(res.width), sy = Float(h) / Float(res.height)
                let fx = k.columns.0.x * sx, fy = k.columns.1.y * sy
                let cx = k.columns.2.x * sx, cy = k.columns.2.y * sy
                let points = body2D.skeleton.jointLandmarks
                for i in 0..<min(points.count, measuredSum.count) {
                    let p = points[i]
                    guard !p.x.isNaN, !p.y.isNaN else { continue }
                    let u = Int(p.x * Float(w)), v = Int(p.y * Float(h))
                    // Median of a 5×5 patch: one pixel on a limb edge can read the wall behind it.
                    var samples: [Float] = []
                    for dv in -2...2 {
                        for du in -2...2 {
                            let uu = u + du, vv = v + dv
                            guard uu >= 0, uu < w, vv >= 0, vv < h else { continue }
                            let row = base.advanced(by: vv * rowBytes).assumingMemoryBound(to: Float32.self)
                            let z = row[uu]
                            if z.isFinite && z > 0.3 && z < 6 { samples.append(z) }
                        }
                    }
                    guard samples.count >= 5 else { continue }
                    samples.sort()
                    let z = samples[samples.count / 2]
                    let pc = SIMD4<Float>((Float(u) - cx) / fx * z, -(Float(v) - cy) / fy * z, -z, 1)
                    let pb = cameraToBody * pc
                    measuredSum[i] += SIMD3(pb.x, pb.y, pb.z)
                    measuredCount[i] += 1
                }
            }
        }

        scaleSum += Float(body.estimatedScaleFactor)
        anchorScaleSum += simd_length(SIMD3(body.transform.columns.0.x, body.transform.columns.0.y, body.transform.columns.0.z))
        distanceSum += distance
        collected += 1
    }

    private func complete(frame: ARFrame, body: ARBodyAnchor) {
        let n = Float(collected)
        var skeleton: [Double] = []
        for v in skeletonSum {
            let a = v / n
            skeleton.append(Double(a.x)); skeleton.append(Double(a.y)); skeleton.append(Double(a.z))
        }
        var measured: [Double] = []
        var measuredN: [Int] = []
        for (i, v) in measuredSum.enumerated() {
            let c = measuredCount[i]
            let a = c > 0 ? v / Float(c) : SIMD3<Float>(repeating: .nan)
            measured.append(Double(a.x)); measured.append(Double(a.y)); measured.append(Double(a.z))
            measuredN.append(c)
        }
        var result: [String: Any] = [
            "mode": mode,
            "frames": collected,
            "estimatedScale": Double(scaleSum / n),
            "anchorScale": Double(anchorScaleSum / n),
            "distance": Double(distanceSum / n),
            "skeletonNames": skeletonNames,
            "skeleton": skeleton,
            "measuredNames": measuredNames,
            "measured": measured.map { $0.isNaN ? NSNull() as Any : $0 as Any },
            "measuredCounts": measuredN,
            "lidar": ARBodyTrackingConfiguration.supportsFrameSemantics(.sceneDepth),
        ]
        let image = CIImage(cvPixelBuffer: frame.capturedImage).oriented(.right)
        if let cg = CIContext().createCGImage(image, from: image.extent),
           let data = UIImage(cgImage: cg).jpegData(compressionQuality: 0.8) {
            result["image"] = "data:image/jpeg;base64," + data.base64EncodedString()
        }
        finish(.success(result))
    }

    private func show(_ text: String, code: String, distance: Float?) {
        let ok = code == "hold"
        label.text = text
        label.textColor = ok ? UIColor(red: 0.2, green: 0.85, blue: 0.4, alpha: 1) : .white
        progress.progress = Float(collected) / Float(targetFrames)
        let now = Date().timeIntervalSince1970
        guard now - lastNotify > 0.12 else { return }
        lastNotify = now
        var info: [String: Any] = ["ok": ok, "code": code, "message": text, "collected": collected, "target": targetFrames]
        if let distance = distance { info["distance"] = Double(distance) }
        onFrame?(info)
    }

    /// The 2D skeleton over the live picture, so it is obvious what is tracked.
    private func drawSkeleton(_ frame: ARFrame) {
        guard let body2D = frame.detectedBody else { overlay.path = nil; return }
        let size = view.bounds.size
        let toView = frame.displayTransform(for: .portrait, viewportSize: size)
        let path = UIBezierPath()
        for p in body2D.skeleton.jointLandmarks where !p.x.isNaN && !p.y.isNaN {
            let n = CGPoint(x: CGFloat(p.x), y: CGFloat(p.y)).applying(toView)
            let v = CGPoint(x: n.x * size.width, y: n.y * size.height)
            path.append(UIBezierPath(arcCenter: v, radius: 5, startAngle: 0, endAngle: .pi * 2, clockwise: true))
        }
        overlay.path = path.cgPath
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        guard !finished else { return }
        finished = true
        sceneView.session.pause()
        let done = onFinish
        dismiss(animated: true) { done?(result) }
    }
}
