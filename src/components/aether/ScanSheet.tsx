import { useEffect, useMemo, useRef, useState } from "react";
import { SwitchCamera, X, Zap, ZapOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FaceAnalysis } from "@/lib/aether/analyzeFace";
import {
  SESSION, faceBox, framingFromLandmarks, proxyPose, sampleLighting, scoreCapture,
  type Quality,
} from "@/lib/aether/captureQuality";
import { ANALYZER_VERSION, FACE } from "@/lib/aether/landmarks";
import type { measureHarmony } from "@/lib/aether/harmony";
import type { analyseSkin } from "@/lib/aether/skin";
import {
  detectFaceTolerant, eulerFromMatrix4, landmarksToPts, loadVision, smileFromBlendshapes,
} from "@/lib/aether/mediapipe";
import { canvasFromDataUrl, measureCanvas, measurePosture } from "@/lib/aether/measure";
import {
  cropForView, distanceCue, faceSquare, guide, irisSize, laplacianVariance, mergeSymmetry, rankFrames,
  screenCue, smoothSquare, turnedSide, type FaceSquare, type Guidance,
} from "@/lib/aether/assist";
import { AssistAudio } from "@/lib/aether/assist-audio";
import { autoPlacement, type Placement } from "@/lib/aether/align";
import { ALIGN_H, ALIGN_W, AlignSheet } from "@/components/aether/AlignSheet";
import { FaceRing } from "@/components/aether/FaceRing";
import { baselineIris, scanSlot, type ScanRecord } from "@/lib/aether/scan-store";
import { loadScanImage, saveScanImage } from "@/lib/habit-photos";
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

/**
 * Frames per capture. Eight at 80ms is about 0.6s — long enough to include a
 * sharp, level frame, short enough that nobody drifts out of pose.
 */
const BURST = 8;

type Facing = "user" | "environment";
type Zoom = 1 | 2 | 3;

interface AssistSettings {
  facing: Facing;
  zoom: Zoom;
  flash: boolean;
  sound: boolean;
  voice: boolean;
  /** Hold every scan to the distance of the first like-for-like one. */
  lock: boolean;
  /** Show the last scan of this pose faintly over the preview, to line up with. */
  ghost: boolean;
}

const SETTINGS_KEY = "soma-scan-assist";
const DEFAULT_SETTINGS: AssistSettings = { facing: "user", zoom: 2, flash: false, sound: true, voice: true, lock: true, ghost: true };

function loadSettings(): AssistSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AssistSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Warm white: truer skin than blue-white LCD light, and less of a glare. */
const FLASH_COLOR = "#fff1dc";
/** Exposure needs a moment to adapt to the screen flash before frames count. */
const FLASH_SETTLE_MS = 260;

/** Focus score for a frame, measured on a small copy so it stays cheap. */
function sharpnessOf(source: HTMLCanvasElement): number {
  try {
    const w = 256;
    const h = Math.max(3, Math.round((w * source.height) / Math.max(1, source.width)));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(source, 0, 0, w, h);
    return laplacianVariance(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return 0;
  }
}
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

/**
 * How long a dropped frame is forgiven for.
 *
 * At the edge of what the landmark model can see — which is exactly where the
 * profile shot lives — detection succeeds on most frames and misses the odd
 * one. Treating each miss as "no face" flashed the gates to zero and reset the
 * hold streak, so the counter never reached six and the shutter never fired,
 * even though the pose was fine. The streak now tolerates a gap; it still
 * takes six genuinely good frames to fire, they just no longer have to be
 * consecutive to the millisecond.
 */
const FACE_GRACE_MS = 700;

interface Measured {
  photoOnly?: false;
  analysis: FaceAnalysis;
  skin: ReturnType<typeof analyseSkin>;
  puffiness: number | null;
  harmony: ReturnType<typeof measureHarmony>;
  dataUrl: string;
  sharpness: number;
  iris: number | null;
}

/**
 * A frame the landmark model could not read.
 *
 * The profile step is the reason this exists. BlazeFace is trained on frontal
 * faces and at a hard yaw it simply proposes no face — no confidence threshold
 * rescues that, which is why lowering it did not fix the step. But a side
 * photograph is most of what anyone wants from a profile shot: it is the thing
 * you put next to last month's to see whether your jawline changed.
 *
 * So the photo is kept and NOTHING is claimed about it. No symmetry, no
 * ratios, no pose — a scan with no `face` on it, which Compare and the Face
 * File already handle because gated captures have always been possible.
 * Inventing measurements from landmarks that were never found would be far
 * worse than an honest photograph.
 */
interface PhotoOnly {
  photoOnly: true;
  dataUrl: string;
}

type Grab = Measured | PhotoOnly;

/** Neck carriage from the KEPT profile photo — see measurePosture. */
async function postureOf(dataUrl: string) {
  try {
    return await measurePosture(await canvasFromDataUrl(dataUrl));
  } catch {
    return undefined;
  }
}

/** A frame's analysis with the burst's median symmetry in place of its own. */
function withMerged(
  a: FaceAnalysis,
  merged: ReturnType<typeof mergeSymmetry>,
  total: number,
): FaceAnalysis {
  if (!merged || merged.used < 2) return a;
  return {
    ...a,
    alpha: merged.alpha,
    regional: merged.regional as FaceAnalysis["regional"],
    notes: [...a.notes, `Symmetry is the median of ${merged.used} frames from a ${total}-frame burst.`],
  };
}

interface LastBurst {
  id: string;
  kind: string;
  side?: "left" | "right";
  frames: Measured[];
  merged: ReturnType<typeof mergeSymmetry>;
  total: number;
  chosen: number;
}

export function ScanSheet({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smallRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const held = useRef(0);
  /** When the model last actually saw a face, for FACE_GRACE_MS. */
  const lastFaceAt = useRef(0);

  const addScan = useSoma((s) => s.addScan);
  const updateScan = useSoma((s) => s.updateScan);
  const [lastBurst, setLastBurst] = useState<LastBurst | null>(null);
  const [aligning, setAligning] = useState<{ img: HTMLImageElement; auto: Placement | null } | null>(null);
  const scans = useSoma((s) => s.scans);

  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [burstPct, setBurstPct] = useState(0);
  const [hud, setHud] = useState<Quality | null>(null);
  const [square, setSquare] = useState<FaceSquare | null>(null);
  const [status, setStatus] = useState("Open the camera. Front → 45° → profile.");
  const [pose, setPose] = useState<{ yaw: number; roll: number; pitch: number } | null>(null);
  const [autoFire, setAutoFire] = useState(true);
  const [holding, setHolding] = useState(0);
  const [settings, setSettings] = useState<AssistSettings>(loadSettings);
  /** True when the camera itself zooms (a lens or track zoom) — no crop needed. */
  const [hwZoom, setHwZoom] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [dist, setDist] = useState<ReturnType<typeof distanceCue>>(null);
  const audioRef = useRef<AssistAudio | null>(null);
  /** The latest render's capture, for the auto-shutter in the frame loop. */
  const captureRef = useRef<() => Promise<void>>(async () => {});
  audioRef.current ??= new AssistAudio();
  const audio = audioRef.current;
  audio.sound = settings.sound;
  audio.voice = settings.voice;

  // Read inside the animation loop, which is attached once and would otherwise
  // close over the first render's values for the life of the screen.
  const liveRefs = useRef({
    autoFire, busy: false, step: 0, zoom: 2 as number, mirror: true,
    baseline: null as number | null,
  });

  const s = SESSION[step]!;
  const kind = s.kind;
  liveRefs.current.autoFire = autoFire;
  liveRefs.current.step = step;
  // The crop the frames are taken with: none when the camera zooms itself.
  liveRefs.current.zoom = hwZoom ? 1 : settings.zoom;
  // Only the front camera behaves like a mirror.
  liveRefs.current.mirror = settings.facing === "user";
  // The iris size to match, or null (lock off, or nothing like-for-like yet).
  const baseline = settings.lock
    ? baselineIris(scans, scanSlot({ kind: s.kind, side: s.side }), settings.facing, settings.zoom)
    : null;
  liveRefs.current.baseline = baseline;

  // The last scan of this pose, preferring one taken the same way, shown
  // faintly over the preview so the same pose can be matched by eye.
  const slot = scanSlot({ kind: s.kind, side: s.side });
  const ghostId = useMemo(() => {
    const same = scans.filter((x) => scanSlot(x) === slot);
    const alike = same.filter((x) => x.capture?.facing === settings.facing && x.capture?.zoom === settings.zoom);
    const pool = alike.length ? alike : same;
    return pool.reduce<ScanRecord | null>((a, b) => (!a || b.capturedAt > a.capturedAt ? b : a), null)?.id ?? null;
  }, [scans, slot, settings.facing, settings.zoom]);
  const [ghostUrl, setGhostUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setGhostUrl(null);
    if (settings.ghost && ghostId) {
      void loadScanImage(ghostId).then((url) => {
        if (!cancelled) setGhostUrl(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [ghostId, settings.ghost]);

  /** Swap the kept photo for another frame from the same burst. */
  async function pickFrame(i: number) {
    const b = lastBurst;
    const f = b?.frames[i];
    if (!b || !f || i === b.chosen) return;
    await saveScanImage(b.id, f.dataUrl);
    const posture = b.kind === "face_side" ? await postureOf(f.dataUrl) : undefined;
    updateScan(b.id, {
      face: withMerged(f.analysis, b.merged, b.total),
      skin: f.skin,
      puffiness: f.puffiness,
      harmony: f.harmony,
      capture: { facing: settings.facing, zoom: settings.zoom, iris: f.iris },
      ...(posture ? { posture } : {}),
    });
    setLastBurst({ ...b, chosen: i });
    toast.success("Swapped in that frame");
  }

  const patchSettings = (patch: Partial<AssistSettings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* private mode: settings last for this visit */
      }
      return next;
    });
  };
  // Done-ness is per slot, so taking the right profile does not tick the left.
  const done = new Set(scans.map(scanSlot));
  const slotOf = (x: (typeof SESSION)[number]) => scanSlot({ kind: x.kind, side: x.side });
  const ready = hud?.ready ?? false;
  // Hold fills the first half of the ring, the burst the second.
  const ringProgress = busy ? 0.5 + burstPct / 200 : (holding / HOLD_FRAMES) * 0.5;
  const frontGlow = settings.flash && settings.facing === "user" && live;

  // The camera and the animation frame both have to stop when this closes, or
  // the light stays on and the loop keeps running behind the diary.
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.dispose();
    },
    [],
  );

  // A new step is a new pose to hold; carrying a streak across would fire the
  // shutter the instant you switched tabs.
  useEffect(() => {
    held.current = 0;
    setHolding(0);
    // Spoken, because on the profile step the screen is out of sight.
    if (live) audioRef.current?.announce(SESSION[step]!.coach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /**
   * Zoom inside the camera track where the browser allows it (Chrome on
   * Android). Returns false where it does not — iOS Safari — and the frames
   * are cropped instead.
   */
  function applyTrackZoom(stream: MediaStream, zoom: number): boolean {
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number } }) | undefined;
      if (!track || !caps?.zoom) return false;
      const z = Math.max(caps.zoom.min, Math.min(caps.zoom.max, zoom));
      void track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The back camera's LED, where the browser exposes it (the `torch`
   * constraint). Returns false where it does not, so the caller can say so.
   */
  async function setTorch(on: boolean): Promise<boolean> {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      if (!track || !caps?.torch) return false;
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  }

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
  async function startCam(override?: Partial<AssistSettings>) {
    const want = { ...settings, ...override };
    // Inside the tap: the only moment iOS lets sound and speech start.
    audio.enable();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser has no camera access. It needs a secure (https) page.");
      return;
    }

    // Started before any await, so the tap is still what is asking.
    // 3x on the back camera asks for the telephoto LENS by name, which only
    // resolves once a camera permission exists (labels are blank before).
    // Real optics beat a crop: same framing from further back, full detail.
    //
    // Looked up ONLY for that case: it is an await, and every other path must
    // reach getUserMedia with no await in between (see above). enumerateDevices
    // is fast, and a tap on "3x" is itself the gesture, but the common path
    // stays exactly as it was.
    const tele =
      want.facing === "environment" && want.zoom === 3
        ? (await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[])).find(
            (d) => d.kind === "videoinput" && /telephoto/i.test(d.label),
          )
        : undefined;
    const pending = navigator.mediaDevices.getUserMedia({
      video: tele
        ? { deviceId: { exact: tele.deviceId }, width: { ideal: 1920 }, height: { ideal: 2560 } }
        : { facingMode: want.facing, width: { ideal: 1920 }, height: { ideal: 2560 } },
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
    setHwZoom(!!tele || applyTrackZoom(stream, want.zoom));

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
      // The same centre crop the preview shows and the capture keeps, so the
      // landmarks, the guides and the saved photo all describe one frame.
      const c = cropForView(video.videoWidth, video.videoHeight, liveRefs.current.zoom);
      small.width = 320;
      small.height = Math.round(320 * (c.sh / Math.max(1, c.sw)));
      const ctx = small.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, small.width, small.height);
      try {
        const res = await detectFaceTolerant(small);
        const lms = res.landmarks;
        if (!lms) {
          // Inside the grace window this is a blink in the model, not a face
          // that has left. Leave the HUD and the hold streak where they are.
          if (Date.now() - lastFaceAt.current < FACE_GRACE_MS) return;
          setHud(
            scoreCapture({
              kind, yawDeg: 0, rollDeg: 0, pitchDeg: 0,
              lighting: { grade: "unknown", mean: 0, contrast: 0, leftRightDelta: 0, highlightPct: 0, shadowPct: 0, notes: [] },
              framing: { faceHeightFrac: 0, eyesY: 0.4, centerX: 0.5, notes: [] },
              smile: 0, hasFace: false,
            }),
          );
          setSquare(null);
          held.current = 0;
          setHolding(0);
          const lost = guide({
            kind: SESSION[liveRefs.current.step]!.kind, hasFace: false, yawDeg: 0, pitchDeg: 0, rollDeg: 0,
            turned: null, quality: { ready: false, lighting: 0, reasons: [] }, faceHeightFrac: 0, smile: 0,
            targetSide: SESSION[liveRefs.current.step]!.side,
          });
          if (!liveRefs.current.busy) audioRef.current?.update(lost);
          setGuidance(lost);
          return;
        }
        lastFaceAt.current = Date.now();
        const pts = landmarksToPts(lms);
        const eu = eulerFromMatrix4(res.matrix);
        const proxy = proxyPose(pts);
        const yawDeg = eu?.yawDeg ?? proxy.yawDeg;
        const rollDeg = eu?.rollDeg ?? proxy.rollDeg;
        const pitchDeg = eu?.pitchDeg ?? proxy.pitchDeg;
        const framing = framingFromLandmarks(pts);
        const smile = smileFromBlendshapes(res.blendshapes as never);
        const stepKind = SESSION[liveRefs.current.step]!.kind;
        const q = scoreCapture({
          kind: stepKind,
          yawDeg, rollDeg, pitchDeg,
          lighting: sampleLighting(small, faceBox(pts)),
          framing,
          smile,
          hasFace: true,
        });
        // Distance against the first like-for-like scan: part of "green", so
        // the shutter never fires from a different spot than last time.
        const cue = distanceCue(irisSize(pts, small.width, small.height), liveRefs.current.baseline);
        const readyHere = q.ready && (!cue || cue.cue === "ok");
        setHud({ ...q, ready: readyHere });
        setDist(cue);
        // One instruction per frame, played as sound: rate for distance to
        // target, left/right ear for which way to turn, pitch for up/down.
        const g = guide({
          kind: stepKind, hasFace: true, yawDeg, pitchDeg, rollDeg,
          turned: turnedSide(pts[FACE.noseTip]?.x, pts[FACE.leftOuter]?.x, pts[FACE.rightOuter]?.x),
          quality: { ...q, ready: readyHere }, faceHeightFrac: framing.faceHeightFrac, smile,
          distance: cue?.cue ?? null,
          targetSide: SESSION[liveRefs.current.step]!.side,
        });
        if (!liveRefs.current.busy) audioRef.current?.update(g);
        setGuidance(g);
        // Shown so the gates can be checked rather than trusted. A coach line
        // saying "turn more" is not falsifiable; a yaw of 41° is.
        setPose({ yaw: yawDeg, roll: rollDeg, pitch: pitchDeg });

        // Held green long enough, and nothing else in flight: take it.
        if (readyHere && liveRefs.current.autoFire && !liveRefs.current.busy) {
          held.current += 1;
          setHolding(held.current);
          if (held.current >= HOLD_FRAMES) {
            held.current = 0;
            setHolding(0);
            // Through the ref: this loop was built when the camera opened, and a
            // direct call would run THAT render's capture — the step, kind and
            // flash setting of that moment, so a 45° or profile shot was
            // measured and saved as a front scan.
            void captureRef.current();
          }
        } else if (held.current !== 0) {
          held.current = 0;
          setHolding(0);
        }
        // Mirrored for display only. The preview is flipped so it behaves like
        // a mirror; the ANALYSIS runs on unmirrored pixels, or left and right
        // would swap between the coach and the Face File.
        const sq = faceSquare(pts, liveRefs.current.mirror);
        if (sq) setSquare((prev) => smoothSquare(prev, sq));
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
    const c = cropForView(video.videoWidth || 1080, video.videoHeight || 1440, liveRefs.current.zoom);
    canvas.width = c.sw;
    canvas.height = c.sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, c.sw, c.sh);
    const m = await measureCanvas(canvas, kind);
    if (!m) {
      // No landmarks anywhere in this frame. The PHOTO is still worth keeping —
      // see the note on photoOnly below — so it comes back without an analysis
      // rather than as nothing at all.
      return { photoOnly: true, dataUrl: canvas.toDataURL("image/jpeg", 0.82) };
    }
    return { ...m, dataUrl: canvas.toDataURL("image/jpeg", 0.82), sharpness: sharpnessOf(canvas) };
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
    audio.update(null);
    audio.cue("capture");
    // Front: the screen is the flash. Back: the LED torch, for the burst only.
    const flash = settings.flash && settings.facing === "user";
    const torch = settings.flash && settings.facing === "environment" ? await setTorch(true) : false;
    if (settings.flash && settings.facing === "environment" && !torch) {
      toast("This browser can't switch on the camera light — shooting without it.");
    }
    if (flash) {
      setFlashing(true);
      await sleep(FLASH_SETTLE_MS);
    }
    // The LED takes longer than the screen for exposure to settle on.
    if (torch) await sleep(FLASH_SETTLE_MS * 2);
    try {
      const frames: Grab[] = [];
      for (let i = 0; i < BURST; i++) {
        const g = await grab();
        if (g) frames.push(g);
        setBurstPct(((i + 1) / BURST) * 100);
        if (i < BURST - 1) await sleep(80);
      }
      setFlashing(false);
      if (torch) void setTorch(false);
      if (!frames.length) {
        setStatus("Nothing came back from the camera. Try again.");
        return;
      }

      const measured = frames.filter((f): f is Measured => !f.photoOnly);
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

      // Nothing in the burst was trackable. Keep the photograph and claim
      // nothing about it — see PhotoOnly. A side shot you can put next to last
      // month's is most of what a profile is for, and an invented measurement
      // would be far worse than an honest picture.
      if (!measured.length) {
        const photo = frames[frames.length - 1]!.dataUrl;
        await saveScanImage(id, photo);
        const posture = kind === "face_side" ? await postureOf(photo) : undefined;
        addScan({
          analyzer: ANALYZER_VERSION,
          id,
          date: getLocalDateKey(new Date()),
          capturedAt: new Date().toISOString(),
          kind,
          ...(s.side ? { side: s.side } : {}),
          ...(posture ? { posture } : {}),
        });
        setStatus(
          posture?.cvaEst != null
            ? `Photo kept. No face metrics at this angle, but neck angle ≈ ${posture.cvaEst.toFixed(1)}°.`
            : "Photo kept, no measurements — the landmark model cannot read a head turned this far.",
        );
        audio.cue("done");
        audio.announce(`${s.short} photo saved.`);
        toast.success(`${s.short} photo saved`);
        if (step < SESSION.length - 1) setStep(step + 1);
        return;
      }

      // Best frame by pose/light quality, sharpness breaking ties — then the
      // symmetry reading is the median of every frame that passed its gates,
      // so the kept number does not hinge on one instant.
      const ranked = rankFrames(
        measured.map((f) => ({ f, overall: f.analysis.quality?.overall ?? 0, sharpness: f.sharpness })),
      );
      const best = ranked[0]!.f;
      const merged = mergeSymmetry(
        measured.map((f) => ({ alpha: f.analysis.alpha, regional: f.analysis.regional, gatesOk: f.analysis.gates.ok })),
      );
      const keep = withMerged(best.analysis, merged, measured.length);
      await saveScanImage(id, best.dataUrl);
      const posture = kind === "face_side" ? await postureOf(best.dataUrl) : undefined;
      addScan({
        analyzer: ANALYZER_VERSION,
        id,
        date: getLocalDateKey(new Date()),
        capturedAt: keep.capturedAt,
        kind,
        ...(s.side ? { side: s.side } : {}),
        face: keep,
        skin: best.skin,
        puffiness: best.puffiness,
        harmony: best.harmony,
        capture: { facing: settings.facing, zoom: settings.zoom, iris: best.iris },
        ...(posture ? { posture } : {}),
      });
      const q = keep.quality;
      setStatus(
        q?.ready
          ? `Kept ${s.short}. Light ${keep.lighting?.grade ?? "?"}.`
          : `Kept the best of ${measured.length}. ${q?.coach ?? keep.gates.reasons[0] ?? ""}`,
      );
      audio.cue("done");
      audio.announce(`${s.short} captured.`);
      toast.success(`${s.short} captured · evenness ${(100 - keep.alpha * 100).toFixed(1)}`);
      // Keep the runners-up, so a better-looking frame can be swapped in.
      setLastBurst({
        id, kind, side: s.side, frames: ranked.slice(0, 4).map((r) => r.f), merged, total: measured.length, chosen: 0,
      });
      if (q && q.overall >= 0.55 && step < SESSION.length - 1) setStep(step + 1);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Capture failed.");
    } finally {
      setFlashing(false);
      if (torch) void setTorch(false);
      setBusy(false);
      // A short cooldown, or the frame right after a capture is still green and
      // fires again immediately.
      setTimeout(() => {
        liveRefs.current.busy = false;
      }, 1200);
      setTimeout(() => setBurstPct(0), 400);
    }
  }

  captureRef.current = capture;

  /**
   * A still from the library: find the face, open the aligner already lined
   * up on it, and measure only once it sits on the guides.
   */
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
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const found = await detectFaceTolerant(canvas).catch(() => null);
      let auto: Placement | null = null;
      if (found?.landmarks) {
        const px = (i: number) => {
          const q = found.landmarks![i];
          return q ? { x: q.x * img.naturalWidth, y: q.y * img.naturalHeight } : null;
        };
        const l = px(FACE.leftIris), r = px(FACE.rightIris), brow = px(FACE.glabella), chin = px(FACE.chin);
        if (l && r && brow && chin) auto = autoPlacement(l, r, brow, chin, ALIGN_W, ALIGN_H);
      }
      setAligning({ img, auto });
      setStatus(auto ? "Lined up on your face — adjust if needed." : "No face found automatically. Place it by hand.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  /** Measure an aligned import, through exactly the capture pipeline. */
  async function saveImported(canvas: HTMLCanvasElement) {
    setAligning(null);
    setBusy(true);
    try {
      const m = await measureCanvas(canvas, kind);
      const posture = kind === "face_side" ? await measurePosture(canvas) : undefined;
      if (!m && !posture) {
        setStatus("No face found in that image.");
        return;
      }
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await saveScanImage(id, canvas.toDataURL("image/jpeg", 0.82));
      addScan({
        analyzer: ANALYZER_VERSION,
        id,
        date: getLocalDateKey(new Date()),
        capturedAt: m?.analysis.capturedAt ?? new Date().toISOString(),
        kind,
        ...(s.side ? { side: s.side } : {}),
        ...(m ? { face: m.analysis, skin: m.skin, puffiness: m.puffiness, harmony: m.harmony } : {}),
        ...(posture ? { posture } : {}),
      });
      setStatus(
        m
          ? `Imported as ${s.short}. Evenness ${(100 - m.analysis.alpha * 100).toFixed(1)}.`
          : `Imported as ${s.short}. Neck angle ≈ ${posture!.cvaEst?.toFixed(1) ?? "?"}°.`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      {aligning && (
        <AlignSheet
          img={aligning.img}
          auto={aligning.auto}
          front={kind === "face_front_true"}
          onCancel={() => setAligning(null)}
          onUse={(c) => void saveImported(c)}
        />
      )}
      {flashing && (
        // The whole screen becomes the light. Warm, not blue-white: truer skin
        // tone and less squinting, which also keeps the eyes measurable.
        <div aria-hidden className="fixed inset-0 z-[80]" style={{ background: FLASH_COLOR }} />
      )}
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
              key={slotOf(x)}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "h-9 flex-1 rounded-full text-xs font-bold transition-colors",
                step === i
                  ? "bg-accent text-accent-ink"
                  : done.has(slotOf(x))
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-surface-2 text-muted",
              )}
            >
              {x.short}
              {done.has(slotOf(x)) ? " ✓" : ""}
            </button>
          ))}
        </div>

        {/* One fixed 3:4 window, whatever shape the camera delivers: the frame
            is centre-cropped to 3:4 for the preview, the analysis and the
            saved photo alike, so what you see is exactly what is measured. */}
        <div
          className="relative mx-auto aspect-[3/4] w-full max-w-[calc(64svh*0.75)] overflow-hidden rounded-2xl border border-border bg-black transition-shadow"
          style={
            frontGlow
              ? // A ring light while you frame: the screen round the window lights your face.
                { boxShadow: `0 0 0 10px ${FLASH_COLOR}, 0 0 36px 16px ${FLASH_COLOR}` }
              : undefined
          }
        >
          {/* Mirrored for the front camera only, and scaled by the digital zoom
              so the preview shows exactly the centre crop that is analysed. */}
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover"
            style={{
              transform: `scale(${(settings.facing === "user" ? -1 : 1) * (hwZoom ? 1 : settings.zoom)}, ${hwZoom ? 1 : settings.zoom})`,
            }}
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          <canvas ref={smallRef} className="hidden" />
          {!live && (
            <div className="absolute inset-0 grid place-items-center text-xs font-bold text-white/50">
              Tap Camera to start
            </div>
          )}
          {ghostUrl && live && (
            // Saved photos are un-mirrored frames; mirror them like the preview.
            <img
              src={ghostUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full object-cover opacity-30"
              style={{ transform: settings.facing === "user" ? "scaleX(-1)" : undefined }}
            />
          )}

          {live && (
            <FaceRing
              square={square}
              ready={ready}
              progress={ringProgress}
              cue={screenCue(guidance, settings.facing === "user")}
            />
          )}

          {/* Camera controls on the picture, where a phone camera has them. */}
          <div className="absolute right-2 top-2 flex flex-col gap-2" data-no-swipe-nav>
            <button
              type="button"
              aria-label={settings.flash ? "Flash on" : "Flash off"}
              aria-pressed={settings.flash}
              onClick={() => patchSettings({ flash: !settings.flash })}
              className={cn(
                "grid size-9 place-items-center rounded-full backdrop-blur",
                settings.flash ? "bg-[#ffd60a] text-black" : "bg-black/50 text-white",
              )}
            >
              {settings.flash ? <Zap className="size-4" /> : <ZapOff className="size-4" />}
            </button>
            <button
              type="button"
              aria-label="Switch camera"
              onClick={() => {
                const f = settings.facing === "user" ? "environment" : "user";
                patchSettings({ facing: f });
                if (live) void startCam({ facing: f });
              }}
              className="grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
            >
              <SwitchCamera className="size-4" />
            </button>
          </div>

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
              {dist && (
                // Shown as the ratio to the first scan, so "how far off" is a number.
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.55rem] font-extrabold tabular-nums",
                    dist.cue === "ok" ? "bg-emerald-500/25 text-emerald-300" : "bg-danger/25 text-red-300",
                  )}
                >
                  DIST {dist.cue === "ok" ? "✓" : dist.cue === "back" ? "↓ back" : "↑ closer"}
                </span>
              )}
            </div>
          )}

          {pose && (
            // The raw angles, so the coach line can be checked rather than
            // taken on faith. "Turn more" is not falsifiable; 41° is.
            <div className="absolute bottom-10 right-2 rounded-lg bg-black/55 px-2 py-1 text-right text-[0.55rem] font-bold tabular text-white/75">
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
              : (guidance?.phrase ?? hud?.coach ?? s.coach)}
          </div>

          {burstPct > 0 && (
            <div className="absolute inset-x-0 top-0 h-1 bg-white/10">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${burstPct}%` }} />
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-muted">{status}</p>

        {!live && (
          <div className="mt-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs">
            <div className="mb-1 font-bold">Before you scan</div>
            {/* The things that change a reading more than your face does. */}
            <ul className="space-y-0.5 text-muted">
              <li>• Hair off the forehead, glasses off</li>
              <li>• Jaw relaxed, teeth apart, no smile</li>
              <li>• Same light and time of day as last time</li>
              <li>• Phone at eye level, stand where you stood before</li>
            </ul>
          </div>
        )}

        {lastBurst && lastBurst.frames.length > 1 && (
          <div className="mt-2">
            <div className="mb-1 text-[0.62rem] font-bold uppercase tracking-wider text-faint">
              Kept the best of the burst — tap another to use it instead
            </div>
            <div className="flex gap-1.5">
              {lastBurst.frames.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void pickFrame(i)}
                  className={cn(
                    "overflow-hidden rounded-lg border-2",
                    i === lastBurst.chosen ? "border-accent" : "border-transparent opacity-70",
                  )}
                >
                  <img src={f.dataUrl} alt={`Frame ${i + 1}`} className="h-16 w-12 object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {hud && hud.lighting < 0.5 && !settings.flash && (
          <button
            type="button"
            onClick={() => patchSettings({ flash: true })}
            className="mt-2 w-full rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-left text-xs font-bold text-amber-200"
          >
            Too dark for a reliable reading — tap to turn on the flash
          </button>
        )}

        <div className="mt-3 space-y-2" data-no-swipe-nav>
          <ChipRow label="Camera">
            {(["user", "environment"] as const).map((f) => (
              <Chip
                key={f}
                on={settings.facing === f}
                onClick={() => {
                  if (settings.facing === f) return;
                  patchSettings({ facing: f });
                  if (live) void startCam({ facing: f });
                }}
              >
                {f === "user" ? "Front" : "Back"}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Zoom">
            {([1, 2, 3] as const).map((z) => (
              <Chip
                key={z}
                on={settings.zoom === z}
                onClick={() => {
                  if (settings.zoom === z) return;
                  patchSettings({ zoom: z });
                  // A lens change (3x telephoto) needs a new stream; a crop does not,
                  // but restarting keeps the two paths identical.
                  if (live) void startCam({ zoom: z });
                }}
              >
                {z}×
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Assist">
            <Chip on={settings.flash} onClick={() => patchSettings({ flash: !settings.flash })}>
              Flash
            </Chip>
            <Chip on={settings.sound} onClick={() => patchSettings({ sound: !settings.sound })}>
              Beeps
            </Chip>
            <Chip on={settings.voice} onClick={() => patchSettings({ voice: !settings.voice })}>
              Voice
            </Chip>
            <Chip on={settings.lock} onClick={() => patchSettings({ lock: !settings.lock })}>
              Match
            </Chip>
            <Chip on={settings.ghost} onClick={() => patchSettings({ ghost: !settings.ghost })}>
              Ghost
            </Chip>
          </ChipRow>
          <p className="text-[0.62rem] leading-snug text-faint">
            Beeps speed up as you get closer to the pose and come from the side to turn
            toward — best in AirPods. A steady tone means hold still. Sound follows your
            silent switch. Match holds every scan to your first scan's distance; Ghost shows your last one faintly to line up with. {hwZoom ? "Zoom uses the camera lens." : "Zoom crops the frame: stand further back to fill it, which is what removes selfie distortion."}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => void startCam()}>{live ? "Restart camera" : "Camera"}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void capture()}>
            {busy
              ? "Burst…"
              : ready
                ? "Capture · green"
                // No face at all: say what tapping will actually get you,
                // rather than promising a capture that cannot be measured.
                : hud && hud.overall === 0
                  ? "Keep the photo"
                  : "Capture anyway"}
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
          Import from camera roll
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

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[0.6rem] font-bold uppercase tracking-wider text-faint">{label}</span>
      <div className="flex flex-1 gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  on, disabled, onClick, children,
}: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-8 flex-1 rounded-full text-xs font-bold transition-colors disabled:opacity-40",
        on ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
      )}
    >
      {children}
    </button>
  );
}
