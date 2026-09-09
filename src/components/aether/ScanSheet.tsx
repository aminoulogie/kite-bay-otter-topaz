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

  const addScan = useSoma((s) => s.addScan);
  const scans = useSoma((s) => s.scans);

  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [burstPct, setBurstPct] = useState(0);
  const [hud, setHud] = useState<Quality | null>(null);
  const [eyes, setEyes] = useState<{ lx: number; ly: number; rx: number; ry: number; mx: number } | null>(null);
  const [status, setStatus] = useState("Open the camera. Front → 45° → profile.");

  const s = SESSION[step]!;
  const kind = s.kind;
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

  async function startCam() {
    try {
      setStatus("Loading the vision model…");
      await loadVision();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 2560 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setLive(true);
      setStatus(s.coach);
      loop();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not open the camera.");
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
        setHud(
          scoreCapture({
            kind,
            yawDeg: eu?.yawDeg ?? proxy.yawDeg,
            rollDeg: eu?.rollDeg ?? proxy.rollDeg,
            pitchDeg: eu?.pitchDeg ?? proxy.pitchDeg,
            lighting: sampleLighting(small, faceBox(pts)),
            framing: framingFromLandmarks(pts),
            smile: smileFromBlendshapes(res.faceBlendshapes?.[0] as never),
            hasFace: true,
          }),
        );
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
    setBusy(true);
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

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 px-3 py-2 text-center text-[0.7rem] font-bold",
              ready ? "bg-emerald-500/25 text-emerald-200" : "bg-black/55 text-white/85",
            )}
          >
            {hud?.coach ?? s.coach}
          </div>

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
