import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeFaceLandmarks, type FaceAnalysis } from "@/lib/aether/analyzeFace";
import {
  SESSION, faceBox, framingFromLandmarks, proxyPose, sampleLighting, scoreCapture,
  type Quality,
} from "@/lib/aether/captureQuality";
import { FACE } from "@/lib/aether/landmarks";
import { measureHarmony } from "@/lib/aether/harmony";
import { analyseSkin, puffinessRatio } from "@/lib/aether/skin";
import {
  detectFace, eulerFromMatrix4, landmarksToPts, loadVision, smileFromBlendshapes,
} from "@/lib/aether/mediapipe";
import { saveScanImage } from "@/lib/habit-photos";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Guided capture: front, then 45°, then profile.
 *
 * This whole module is loaded lazily. It pulls in the MediaPipe runtime, which
 * is megabytes of WASM fetched from a CDN — acceptable for something opened
 * deliberately, unacceptable as a tax on opening the food diary. Nothing here
 * is imported by the app shell; the Looks tab reaches it through React.lazy.
 *
 * The gates are the point of the screen. A turned, tilted or smiling frame
 * produces an asymmetry figure that looks exactly as authoritative as a good
 * one, so the coach line and the ALIGN/LIGHT/FRAME chips exist to make the
 * next photograph comparable to the last one rather than merely to exist.
 */

const BURST = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Consecutive good frames before the shutter fires itself.
 *
 * The live loop runs about eight times a second, so six frames is roughly
 * three quarters of a second of holding still. Long enough that a frame
 * flickering green as you move past the right angle does not trigger it, short
 * enough that you are not asked to hold a pose while hunting for a button.
 *
 * Reaching for the shutter is the thing that ruins the shot — it tilts the
 * phone and moves the head at the exact moment the frame was good.
 */
const HOLD_FRAMES = 6;

interface Grab {
  analysis: FaceAnalysis;
  skin: ReturnType<typeof analyseSkin>;
  puffiness: number | null;
  harmony: ReturnType<typeof measureHarmony>;
  dataUrl: string;
}

export function ScanSheet({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smallRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const held = useRef(0);

  const addScan = useSoma((s) => s.addScan);
  const scans = useSoma((s) => s.scans);

  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [burstPct, setBurstPct] = useState(0);
  const [hud, setHud] = useState<Quality | null>(null);
  const [eyes, setEyes] = useState<{ lx: number; ly: number; rx: number; ry: number; mx: number } | null>(null);
  const [status, setStatus] = useState("Open the camera. Front → 45° → profile.");
  const [pose, setPose] = useState<{ yaw: number; roll: number; pitch: number } | null>(null);
  const [autoFire, setAutoFire] = useState(true);
  const [holding, setHolding] = useState(0);

  // Read inside the animation loop, which is attached once and would otherwise
  // close over the first render's values for the life of the screen.
  const liveRefs = useRef({ autoFire, busy: false, step: 0 });

  const s = SESSION[step]!;
  const kind = s.kind;
  liveRefs.current.autoFire = autoFire;
  liveRefs.current.step = step;
  const done = new Set(scans.map((x) => x.kind));
  const ready = hud?.ready ?? false;

  // The camera and the animation frame both have to stop when this closes, or
  // the light stays on and the loop keeps running behind the diary.
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // A new step is a new pose to hold; carrying a streak across would fire the
  // shutter the instant you switched tabs.
  useEffect(() => {
    held.current = 0;
    setHolding(0);
  }, [step]);

  /**
   * Ask for the camera FIRST, before anything that awaits.
   *
   * This order is not a style choice. Safari grants getUserMedia only inside a
   * user gesture, and a gesture does not survive a long await — loading the
   * vision model fetches eleven megabytes, so by the time it resolved the tap
   * had expired and the permission prompt never appeared AT ALL. Not a denial,
   * not an error: silence. The camera simply never opened and the only clue
   * was a status line saying it could not.
   *
   * So the request goes out synchronously with the tap, and the model loads
   * behind the preview afterwards. That also happens to be the better screen:
   * the picture appears immediately instead of after a blank ten seconds.
   */
  async function startCam() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser has no camera access. It needs a secure (https) page.");
      return;
    }

    // Started before any await, so the tap is still what is asking.
    const pending = navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 2560 } },
      audio: false,
    });
    setStatus("Allow the camera when asked…");

    let stream: MediaStream;
    try {
      stream = await pending;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setStatus(
        name === "NotAllowedError"
          ? "Camera permission was refused. Allow it in your browser's site settings, then tap Camera again."
          : name === "NotFoundError"
            ? "No camera found on this device."
            : err instanceof Error
              ? err.message
              : "Could not open the camera.",
      );
      return;
    }

    // Only now is it safe to drop the previous stream — doing it before the
    // new one arrives would leave a black preview if the request failed.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = stream;
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try {
      await videoRef.current.play();
    } catch {
      // Autoplay refusal on a muted inline video is rare and not fatal.
    }
    setLive(true);

    // The model loads behind a live preview rather than in front of a blank one.
    setStatus("Camera on. Loading the face model…");
    try {
      await loadVision();
      setStatus(s.coach);
      loop();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load the face model.");
    }
  }

  function loop() {
    cancelAnimationFrame(rafRef.current);
    let lastTick = 0;
    const tick = async (t: number) => {
      rafRef.current = requestAnimationFrame(tick);
      // Eight times a second, not sixty: the model is the cost, and the coach
      // line does not need to update faster than a person can react to it.
      if (t - lastTick < 120) return;
      lastTick = t;
      const video = videoRef.current;
      const small = smallRef.current;
      if (!video || !small || video.readyState < 2) return;
      small.width = 320;
      small.height = Math.round(320 * (video.videoHeight / Math.max(1, video.videoWidth)));
      const ctx = small.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, small.width, small.height);
      try {
        const res = await detectFace(small);
        const lms = res.faceLandmarks?.[0];
        if (!lms) {
          setHud(
            scoreCapture({
              kind, yawDeg: 0, rollDeg: 0, pitchDeg: 0,
              lighting: { grade: "unknown", mean: 0, contrast: 0, leftRightDelta: 0, highlightPct: 0, shadowPct: 0, notes: [] },
              framing: { faceHeightFrac: 0, eyesY: 0.4, centerX: 0.5, notes: [] },
              smile: 0, hasFace: false,
            }),
          );
          setEyes(null);
          return;
        }
        const pts = landmarksToPts(lms);
        const eu = eulerFromMatrix4(res.facialTransformationMatrixes?.[0]?.data as number[] | undefined);
        const proxy = proxyPose(pts);
        const yawDeg = eu?.yawDeg ?? proxy.yawDeg;
        const rollDeg = eu?.rollDeg ?? proxy.rollDeg;
        const pitchDeg = eu?.pitchDeg ?? proxy.pitchDeg;
        const q = scoreCapture({
          kind: SESSION[liveRefs.current.step]!.kind,
          yawDeg, rollDeg, pitchDeg,
          lighting: sampleLighting(small, faceBox(pts)),
          framing: framingFromLandmarks(pts),
          smile: smileFromBlendshapes(res.faceBlendshapes?.[0] as never),
          hasFace: true,
        });
        setHud(q);
        // Shown so the gates can be checked rather than trusted. A coach line
        // saying "turn more" is not falsifiable; a yaw of 41° is.
        setPose({ yaw: yawDeg, roll: rollDeg, pitch: pitchDeg });

        // Held green long enough, and nothing else in flight: take it.
        if (q.ready && liveRefs.current.autoFire && !liveRefs.current.busy) {
          held.current += 1;
          setHolding(held.current);
          if (held.current >= HOLD_FRAMES) {
            held.current = 0;
            setHolding(0);
            void capture();
          }
        } else if (held.current !== 0) {
          held.current = 0;
          setHolding(0);
        }
        const li = pts[FACE.leftInner];
        const ri = pts[FACE.rightInner];
        // Mirrored for display only. The preview is flipped so it behaves like
        // a mirror; the ANALYSIS runs on unmirrored pixels, or left and right
        // would swap between the coach and the Face File.
        if (li && ri) setEyes({ lx: 1 - li.x, ly: li.y, rx: 1 - ri.x, ry: ri.y, mx: 1 - (li.x + ri.x) / 2 });
      } catch {
        // A dropped frame during live detection is not worth a message.
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function grab(): Promise<Grab | null> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1440;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const res = await detectFace(canvas);
    const lms = res.faceLandmarks?.[0];
    if (!lms) return null;
    const pts = landmarksToPts(lms);
    const eu = eulerFromMatrix4(res.facialTransformationMatrixes?.[0]?.data as number[] | undefined);
    const proxy = proxyPose(pts);
    const lighting = sampleLighting(canvas, faceBox(pts));
    const framing = framingFromLandmarks(pts);
    const smile = smileFromBlendshapes(res.faceBlendshapes?.[0] as never);
    const yawDeg = eu?.yawDeg ?? proxy.yawDeg;
    const rollDeg = eu?.rollDeg ?? proxy.rollDeg;
    const pitchDeg = eu?.pitchDeg ?? proxy.pitchDeg;
    const quality = scoreCapture({ kind, yawDeg, rollDeg, pitchDeg, lighting, framing, smile, hasFace: true });
    const analysis = analyzeFaceLandmarks(pts, {
      yawDeg, pitchDeg, rollDeg,
      poseSource: eu ? "matrix" : "proxy",
      lighting, framing, quality, smileBlend: smile,
    });
    // Pixel measurements come off the SAME canvas the landmarks were found on,
    // so a patch placed at a landmark lands on the skin it names.
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      analysis,
      skin: analyseSkin(pixels, pts),
      puffiness: puffinessRatio(pts),
      harmony: measureHarmony(pts),
      dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    };
  }

  /**
   * Keep the best of a short burst rather than whatever the shutter caught.
   *
   * A face moves. Five frames 80ms apart cost nothing and reliably include one
   * where the head is level, which is the frame the gates want.
   */
  async function capture() {
    if (!live) {
      setStatus("Open the camera first.");
      return;
    }
    // The preview can now be live while the model is still downloading, so a
    // tap during that window has to wait rather than fail.
    try {
      await loadVision();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load the face model.");
      return;
    }
    setBusy(true);
    liveRefs.current.busy = true;
    setBurstPct(0);
    try {
      const frames: Grab[] = [];
      for (let i = 0; i < BURST; i++) {
        const g = await grab();
        if (g) frames.push(g);
        setBurstPct(((i + 1) / BURST) * 100);
        if (i < BURST - 1) await sleep(80);
      }
      if (!frames.length) {
        setStatus("No face in the burst. More light, or move closer.");
        return;
      }
      frames.sort((a, b) => (b.analysis.quality?.overall ?? 0) - (a.analysis.quality?.overall ?? 0));
      const best = frames[0]!;
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await saveScanImage(id, best.dataUrl);
      addScan({
        id,
        date: getLocalDateKey(new Date()),
        capturedAt: best.analysis.capturedAt,
        kind,
        face: best.analysis,
        skin: best.skin,
        puffiness: best.puffiness,
        harmony: best.harmony,
      });
      const q = best.analysis.quality;
      setStatus(
        q?.ready
          ? `Kept ${s.short}. Light ${best.analysis.lighting?.grade ?? "?"}.`
          : `Kept the best of ${frames.length}. ${q?.coach ?? best.analysis.gates.reasons[0] ?? ""}`,
      );
      toast.success(`${s.short} captured · evenness ${(100 - best.analysis.alpha * 100).toFixed(1)}`);
      if (q && q.overall >= 0.55 && step < SESSION.length - 1) setStep(step + 1);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Capture failed.");
    } finally {
      setBusy(false);
      // A short cooldown, or the frame right after a capture is still green and
      // fires again immediately.
      setTimeout(() => {
        liveRefs.current.busy = false;
      }, 1200);
      setTimeout(() => setBurstPct(0), 400);
    }
  }

  /** A still from the library, through exactly the same pipeline. */
  async function fromFile(file: File) {
    setBusy(true);
    try {
      await loadVision();
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Could not read that image."));
        i.src = URL.createObjectURL(file);
      });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const res = await detectFace(canvas);
      const lms = res.faceLandmarks?.[0];
      if (!lms) {
        setStatus("No face found in that image.");
        return;
      }
      const pts = landmarksToPts(lms);
      const eu = eulerFromMatrix4(res.facialTransformationMatrixes?.[0]?.data as number[] | undefined);
      const proxy = proxyPose(pts);
      const analysis = analyzeFaceLandmarks(pts, {
        yawDeg: eu?.yawDeg ?? proxy.yawDeg,
        pitchDeg: eu?.pitchDeg ?? proxy.pitchDeg,
        rollDeg: eu?.rollDeg ?? proxy.rollDeg,
        poseSource: eu ? "matrix" : "proxy",
        lighting: sampleLighting(canvas, faceBox(pts)),
        framing: framingFromLandmarks(pts),
      });
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await saveScanImage(id, canvas.toDataURL("image/jpeg", 0.82));
      addScan({
        id, date: getLocalDateKey(new Date()), capturedAt: analysis.capturedAt, kind,
        face: analysis,
        skin: analyseSkin(pixels, pts),
        puffiness: puffinessRatio(pts),
        harmony: measureHarmony(pts),
      });
      setStatus(`Imported as ${s.short}. Evenness ${(100 - analysis.alpha * 100).toFixed(1)}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between border-b border-border px-4 pb-3">
        <div>
          <div className="font-display text-sm font-extrabold">Scan</div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-faint">
            Guided capture
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="soma-scroll flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <div className="mb-2 flex gap-1.5" data-no-swipe-nav>
          {SESSION.map((x, i) => (
            <button
              key={x.kind}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "h-9 flex-1 rounded-full text-xs font-bold transition-colors",
                step === i
                  ? "bg-accent text-accent-ink"
                  : done.has(x.kind)
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-surface-2 text-muted",
              )}
            >
              {x.short}
              {done.has(x.kind) ? " ✓" : ""}
            </button>
          ))}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
          {/* Mirrored preview so it behaves like a mirror. The analysis reads
              the unmirrored canvas below, so left and right never swap. */}
          <video ref={videoRef} className="w-full -scale-x-100" playsInline muted />
          <canvas ref={canvasRef} className={cn("w-full", live && "hidden")} />
          <canvas ref={smallRef} className="hidden" />

          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <line x1="33" y1="8" x2="33" y2="92" stroke="rgba(255,255,255,.12)" strokeWidth="0.2" />
            <line x1="66" y1="8" x2="66" y2="92" stroke="rgba(255,255,255,.12)" strokeWidth="0.2" />
            <line x1="8" y1="33" x2="92" y2="33" stroke="rgba(255,255,255,.12)" strokeWidth="0.2" />
            <line x1="8" y1="66" x2="92" y2="66" stroke="rgba(255,255,255,.12)" strokeWidth="0.2" />
            <line
              x1="50" y1="6" x2="50" y2="94"
              stroke={ready ? "rgba(48,209,88,.75)" : "rgba(255,255,255,.4)"}
              strokeWidth="0.3"
            />
            <line x1="12" y1="40" x2="88" y2="40" stroke="rgba(255,255,255,.35)" strokeWidth="0.22" />
            <ellipse cx="38" cy="40" rx="9" ry="6" fill="none" stroke="rgba(10,132,255,.85)" strokeWidth="0.4" />
            <ellipse cx="62" cy="40" rx="9" ry="6" fill="none" stroke="rgba(10,132,255,.85)" strokeWidth="0.4" />
            {kind === "face_front_true" && (
              <ellipse cx="50" cy="48" rx="28" ry="36" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="0.3" />
            )}
            {kind === "face_oblique" && (
              <path d="M58 16 C78 28 82 70 62 88" fill="none" stroke="rgba(10,132,255,.55)" strokeWidth="0.45" />
            )}
            {kind === "face_side" && (
              <path d="M68 14 C88 30 90 72 70 90" fill="none" stroke="rgba(10,132,255,.55)" strokeWidth="0.45" />
            )}
            {eyes && (
              <>
                <circle cx={eyes.lx * 100} cy={eyes.ly * 100} r="1.1" fill="#0a84ff" />
                <circle cx={eyes.rx * 100} cy={eyes.ry * 100} r="1.1" fill="#0a84ff" />
                <line x1={eyes.mx * 100} y1="8" x2={eyes.mx * 100} y2="92" stroke="rgba(10,132,255,.35)" strokeWidth="0.2" />
              </>
            )}
          </svg>

          {hud && (
            <div className="absolute left-2 top-2 flex gap-1.5">
              {([
                ["ALIGN", hud.alignment],
                ["LIGHT", hud.lighting],
                ["FRAME", hud.framing],
              ] as const).map(([label, v]) => (
                <span
                  key={label}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.55rem] font-extrabold tabular-nums",
                    v >= 0.7 ? "bg-emerald-500/25 text-emerald-300" : "bg-danger/25 text-red-300",
                  )}
                >
                  {label} {Math.round(v * 100)}
                </span>
              ))}
            </div>
          )}

          {pose && (
            // The raw angles, so the coach line can be checked rather than
            // taken on faith. "Turn more" is not falsifiable; 41° is.
            <div className="absolute right-2 top-2 rounded-lg bg-black/55 px-2 py-1 text-right text-[0.55rem] font-bold tabular text-white/75">
              <div>yaw {pose.yaw.toFixed(0)}°</div>
              <div className="text-white/50">
                target {s.yawAbs[0]}–{s.yawAbs[1]}°
              </div>
              <div>roll {pose.roll.toFixed(1)}°</div>
            </div>
          )}

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 px-3 py-2 text-center text-[0.7rem] font-bold",
              ready ? "bg-emerald-500/25 text-emerald-200" : "bg-black/55 text-white/85",
            )}
          >
            {holding > 0
              ? `Hold… ${Math.max(1, HOLD_FRAMES - holding)}`
              : (hud?.coach ?? s.coach)}
          </div>

          {holding > 0 && (
            // A ring closing round the frame, so the countdown is visible
            // without looking away from your own face.
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl border-4 border-emerald-400 transition-opacity"
              style={{ opacity: holding / HOLD_FRAMES }}
            />
          )}

          {burstPct > 0 && (
            <div className="absolute inset-x-0 top-0 h-1 bg-white/10">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${burstPct}%` }} />
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-muted">{status}</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => void startCam()}>{live ? "Restart camera" : "Camera"}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void capture()}>
            {busy ? "Burst…" : ready ? "Capture · green" : "Capture anyway"}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setAutoFire((v) => !v)}
          className="mt-2 flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold">Shoot it for me</span>
            <span className="block text-[0.66rem] leading-snug text-faint">
              Fires once the frame holds green. Reaching for the button is what tilts the
              phone at the moment the pose was right.
            </span>
          </span>
          <span
            className={cn(
              "ml-3 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors",
              autoFire ? "bg-accent" : "bg-surface-3",
            )}
          >
            <span
              className={cn(
                "block size-5 rounded-full bg-white transition-transform",
                autoFire && "translate-x-5",
              )}
            />
          </span>
        </button>

        <label className="mt-2 flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface-2 text-sm font-semibold">
          Import a still instead
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void fromFile(f);
            }}
          />
        </label>

        <p className="mt-3 text-[0.68rem] leading-relaxed text-faint">
          Front, 45° and profile answer different questions and are not interchangeable.
          Green means this frame is comparable to your last one — a turned, tilted or
          smiling face produces a number that looks just as confident and means much less.
          The mesh here is MediaPipe&apos;s monocular depth, not Face ID.
        </p>
      </div>
    </div>
  );
}
