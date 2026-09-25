import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Camera, ChevronRight, ScanFace } from "lucide-react";
import { WidgetGrid } from "@/components/WidgetGrid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { SwipeRow } from "@/components/SwipeRow";
import { bodyKey, depthGridKey, latestByKind, meshKey, needsReanalysis, newestFirst, evennessTrend, type ScanRecord } from "@/lib/aether/scan-store";
import { trueDepthAvailable } from "@/lib/native/face-depth";
import { bodyScanAvailable, type BodyScanMode } from "@/lib/native/body-depth";
import { leftRightDiffPct, type Segment } from "@/lib/aether/body3d";
import type { AssistAudio } from "@/lib/aether/assist-audio";
import { symmetryPercent } from "@/lib/aether/harmony";
import { deleteScanImage } from "@/lib/habit-photos";
import { agoLabel } from "@/lib/last-time";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Face and posture, measured in this app.
 *
 * The capture screen and the Face File are both loaded lazily. They pull in
 * the MediaPipe runtime — megabytes of WASM from a CDN — and that is a fair
 * price for a screen you open deliberately and an unfair one for opening the
 * food diary. Nothing on this tab imports them until you tap Scan, which is
 * why the analyser can live here at all rather than in a separate app.
 *
 * What the tab refuses to do has not changed by being ported. There is no
 * single looks score, no claim that any drill moves adult bone, and no reading
 * presented without the pose it was taken at.
 */

const ScanSheet = lazy(() =>
  import("@/components/aether/ScanSheet").then((m) => ({ default: m.ScanSheet })),
);
const FaceFileSheet = lazy(() =>
  import("@/components/aether/FaceFileSheet").then((m) => ({ default: m.FaceFileSheet })),
);
const CompareSheet = lazy(() =>
  import("@/components/aether/CompareSheet").then((m) => ({ default: m.CompareSheet })),
);

const KIND_LABEL: Record<string, string> = {
  face_front_true: "Front",
  face_front_nhp: "Front (natural)",
  face_oblique: "45°",
  face_side: "Profile",
  posture_side: "Posture side",
  posture_front: "Posture front",
};

/** Gallery tiles, one per comparable slot (see scanSlot). */
const SLOTS: { slot: string; label: string }[] = [
  { slot: "face_front_true", label: "Front" },
  { slot: "face_oblique", label: "45°" },
  { slot: "face_side:right", label: "Profile R" },
  { slot: "face_side:left", label: "Profile L" },
];

function scanLabel(sc: ScanRecord): string {
  if (sc.kind === "face_side") return sc.side === "left" ? "Profile L" : "Profile R";
  return KIND_LABEL[sc.kind] ?? sc.kind;
}

export function LooksView() {
  const scans = useSoma((s) => s.scans);
  const removeScan = useSoma((s) => s.removeScan);
  const restoreScan = useSoma((s) => s.restoreScan);
  const updateScan = useSoma((s) => s.updateScan);

  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<ScanRecord | null>(null);
  const [comparing, setComparing] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [redo, setRedo] = useState<{ done: number; total: number } | null>(null);
  const addScan = useSoma((s) => s.addScan);
  const [hasTrueDepth, setHasTrueDepth] = useState(false);
  const [depthBusy, setDepthBusy] = useState(false);
  const depthAudio = useRef<AssistAudio | null>(null);
  const [bodyScan, setBodyScan] = useState<{ supported: boolean; lidar: boolean }>({ supported: false, lidar: false });
  const [bodyBusy, setBodyBusy] = useState<BodyScanMode | null>(null);
  useEffect(() => {
    void trueDepthAvailable().then(setHasTrueDepth);
    void bodyScanAvailable().then(setBodyScan);
  }, []);
  const latestBody = useMemo(() => {
    const newest = newestFirst(scans);
    return {
      front: newest.find((x) => x.body?.mode === "front")?.body ?? null,
      side: newest.find((x) => x.body?.mode === "side")?.body ?? null,
    };
  }, [scans]);
  const latestDepth = useMemo(
    () => newestFirst(scans).find((x) => x.depth)?.depth ?? null,
    [scans],
  );

  /**
   * The native TrueDepth scan. Audio is enabled here, in the tap, because iOS
   * lets sound start only inside a gesture; the scan module and its Swift side
   * are loaded only now.
   */
  const scan3d = async () => {
    if (depthBusy) return;
    setDepthBusy(true);
    try {
      const [{ AssistAudio }, { runTrueDepthScan }] = await Promise.all([
        import("@/lib/aether/assist-audio"),
        import("@/lib/aether/truedepth-scan"),
      ]);
      depthAudio.current ??= new AssistAudio();
      depthAudio.current.enable();
      const record = await runTrueDepthScan(depthAudio.current);
      addScan(record);
      toast.success(
        record.depth?.symmetryRmsMm != null
          ? `3D scan saved · asymmetry ${record.depth.symmetryRmsMm.toFixed(2)} mm`
          : "3D scan saved",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "3D scan failed.";
      if (!/cancelled/i.test(msg)) toast.error(msg);
    } finally {
      setDepthBusy(false);
    }
  };

  /** The native LiDAR body scan; same gesture rule for audio as scan3d. */
  const scanBody = async (mode: BodyScanMode) => {
    if (bodyBusy) return;
    setBodyBusy(mode);
    try {
      const [{ AssistAudio }, { runBodyScan }] = await Promise.all([
        import("@/lib/aether/assist-audio"),
        import("@/lib/aether/body-scan"),
      ]);
      depthAudio.current ??= new AssistAudio();
      depthAudio.current.enable();
      addScan(await runBodyScan(mode, depthAudio.current));
      toast.success(mode === "side" ? "Side body scan saved" : "Front body scan saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Body scan failed.";
      if (!/cancelled/i.test(msg)) toast.error(msg);
    } finally {
      setBodyBusy(null);
    }
  };

  const today = getLocalDateKey(new Date());
  const rows = useMemo(() => newestFirst(scans), [scans]);
  const latest = useMemo(() => latestByKind(scans), [scans]);
  const trend = useMemo(() => evennessTrend(scans), [scans]);
  const front = latest.get("face_front_true");
  const stale = useMemo(() => scans.filter(needsReanalysis), [scans]);

  /**
   * Re-measure every scan an older analyser produced.
   *
   * Sequential, not parallel: each one is a full-resolution decode plus two
   * model passes, and a phone doing twenty at once is a phone that stops
   * responding. The analyser is imported here, on tap, for the same reason
   * the capture screen is lazy.
   */
  const reanalyseAll = async () => {
    if (redo) return;
    const todo = [...stale];
    setRedo({ done: 0, total: todo.length });
    let remeasured = 0;
    let skipped = 0;
    try {
      const [{ loadVision }, { reanalyseScan }] = await Promise.all([
        import("@/lib/aether/mediapipe"),
        import("@/lib/aether/measure"),
      ]);
      await loadVision();
      for (let i = 0; i < todo.length; i++) {
        const result = await reanalyseScan(todo[i]!).catch(() => null);
        if (result) {
          updateScan(todo[i]!.id, result.patch);
          if (result.remeasured) remeasured++;
          else skipped++;
        } else {
          skipped++;
        }
        setRedo({ done: i + 1, total: todo.length });
      }
      toast.success(
        skipped
          ? `Re-measured ${remeasured}. ${skipped} kept as they were (no photo or no face found).`
          : `Re-measured all ${remeasured} scans.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-analysis failed.");
    } finally {
      setRedo(null);
    }
  };

  // Only gated-clean front captures compare. Two readings taken at different
  // yaw are not the same measurement, and subtracting them produces a change
  // that is mostly the head turning.
  // Expressed on the same scale as the figure above it, or the card would
  // report a change in units nothing else on the screen uses.
  const change =
    trend.length >= 2
      ? symmetryPercent(1 - trend[trend.length - 1]!.evenness / 100) -
        symmetryPercent(1 - trend[0]!.evenness / 100)
      : null;

  const del = (scan: ScanRecord) => {
    const index = scans.findIndex((x) => x.id === scan.id);
    removeScan(scan.id);
    toast.success("Scan removed", {
      action: { label: "Undo", onClick: () => restoreScan(index, scan) },
    });
    // The image goes only once undo can no longer bring the record back.
    setTimeout(() => {
      if (!useSoma.getState().scans.some((x) => x.id === scan.id)) {
        void deleteScanImage(scan.id);
        if (scan.depth) {
          void deleteScanImage(meshKey(scan.id));
          void deleteScanImage(depthGridKey(scan.id));
        }
        if (scan.body) void deleteScanImage(bodyKey(scan.id));
      }
    }, 8000);
  };

  return (
    <WidgetGrid tab="looks">
      <Card key="latest">
        <CardTitle>Latest front</CardTitle>
        {front?.face ? (
          <>
            <div className="flex items-end gap-3">
              <div className="font-display text-6xl font-extrabold tabular leading-none">
                {symmetryPercent(front.face.alpha)}
                <span className="text-2xl">%</span>
              </div>
              <div className="pb-1.5 text-xs text-muted">
                symmetry
                <div className="text-[0.65rem] text-faint">{agoLabel(front.date, today)}</div>
              </div>
            </div>
            {!front.face.gates.ok && (
              <p className="mt-1 text-[0.68rem] font-bold text-warn">
                This one did not pass its gates — {front.face.gates.reasons[0]}
              </p>
            )}
            {change != null && (
              <p className="mt-1 text-[0.68rem] text-faint">
                {change >= 0 ? "+" : ""}
                {change.toFixed(1)} points across {trend.length} clean front captures. Anything
                under about a point is the photograph, not the face.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-faint">
            No front capture yet. Front, 45° and profile answer different questions, so the
            front one is what this figure comes from.
          </p>
        )}
        <p className="mt-2 text-[0.68rem] leading-snug text-faint">
          Shape is landmarks. Projection is fat, light and lens. Carriage is how the skull is
          aimed. None of them is a score, and no drill changes adult bone.
        </p>
      </Card>

      <Button key="scan" variant="primary" className="w-full" onClick={() => setScanning(true)}>
        <Camera className="size-4" /> Scan · front, 45°, profile
      </Button>

      {/* The key goes on the element the condition produces, not on a wrapper
          around it. A wrapper renders as an empty div when the condition is
          false, and an empty div still takes the height its size asks for —
          which is a hole in the page with nothing to say what it is. With the
          key here the whole expression is simply absent and the grid skips
          the cell. */}
      {(hasTrueDepth || latestDepth) && (
        <Card key="truedepth">
          <CardTitle>3D scan · TrueDepth</CardTitle>
          {latestDepth ? (
            <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {latestDepth.raw && (
                <>
                  {/* The measured surface first: this is the real shape. */}
                  <Metric label="Asymmetry · raw depth" value={mm(latestDepth.raw.rmsMm, 2)} />
                  <Metric label="Worst areas · raw" value={mm(latestDepth.raw.p95Mm, 2)} />
                  <Metric
                    label="Fuller side (up / mid / low)"
                    value={(["upper", "middle", "lower"] as const)
                      .map((k) => side(latestDepth.raw!.leftMinusRightMm[k]))
                      .join(" / ")}
                  />
                  <Metric label="Depth frames" value={`${latestDepth.raw.depthFrames}`} />
                </>
              )}
              <Metric label={latestDepth.raw ? "Asymmetry · mesh" : "Asymmetry (RMS)"} value={mm(latestDepth.symmetryRmsMm, 2)} />
              <Metric label="Worst areas (95th)" value={mm(latestDepth.symmetryP95Mm, 2)} />
              {latestDepth.symmetryByThird && (
                <Metric
                  label="By third (up / mid / low)"
                  value={`${latestDepth.symmetryByThird.upper.toFixed(1)} / ${latestDepth.symmetryByThird.middle.toFixed(1)} / ${latestDepth.symmetryByThird.lower.toFixed(1)} mm`}
                />
              )}
              <Metric label="Eye distance (IPD)" value={mm(latestDepth.ipdMm, 1)} />
              <Metric label="Face width" value={mm(latestDepth.faceWidthMm, 0)} />
              <Metric label="Lower / face width" value={latestDepth.lowerToFace?.toFixed(2) ?? "—"} />
              <Metric label="Scanned from" value={`${(latestDepth.distanceMm / 10).toFixed(0)} cm`} />
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted">
              Uses the Face ID camera&apos;s infrared depth to measure your face in real millimetres —
              no photo distortion, works in dim light. Everything stays on this phone.
            </p>
          )}
          {hasTrueDepth ? (
            <Button className="w-full" disabled={depthBusy} onClick={() => void scan3d()}>
              {depthBusy ? "Scanning…" : latestDepth ? "New 3D scan" : "Start 3D scan"}
            </Button>
          ) : (
            <p className="text-[0.7rem] text-faint">3D scanning needs the installed iPhone app.</p>
          )}
          {latestDepth && !latestDepth.raw && latestDepth.symmetryRmsMm != null && latestDepth.symmetryRmsMm < 0.3 && (
            // Honest flag: ARKit may fit faces symmetrically, in which case the
            // mesh cannot show asymmetry and this figure means nothing yet.
            <p className="mt-2 text-[0.7rem] leading-snug text-warn">
              Near-zero asymmetry usually means the fitted mesh is forcing symmetry, not that your face
              is perfectly even. This scan has no raw depth; take a new 3D scan to measure it.
            </p>
          )}
        </Card>
      )}

      {(bodyScan.supported || latestBody.front || latestBody.side) && (
        <Card key="lidar-body">
          <CardTitle>Body scan · LiDAR</CardTitle>
          {latestBody.front || latestBody.side ? (
            <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {latestBody.front && (
                <>
                  <Metric label="Shoulder width" value={seg(latestBody.front.metrics.segments.shoulderWidth)} />
                  <Metric label="Hip joints width" value={seg(latestBody.front.metrics.segments.hipWidth)} />
                  <Metric label="Knee in · L / R" value={degPair(latestBody.front.metrics.front?.kneeValgusL, latestBody.front.metrics.front?.kneeValgusR)} />
                  <Metric label="Ankle gap (centres)" value={mm(latestBody.front.metrics.front?.ankleGapMm, 0)} />
                  <Metric label="Left shoulder higher" value={mm(latestBody.front.metrics.front?.shoulderLeftHigherMm, 0)} />
                  <Metric label="Left hip higher" value={mm(latestBody.front.metrics.front?.hipLeftHigherMm, 0)} />
                  <Metric label="Arm R vs L" value={pct(latestBody.front.metrics.segments.upperArmL, latestBody.front.metrics.segments.upperArmR)} />
                  <Metric label="Thigh R vs L" value={pct(latestBody.front.metrics.segments.thighL, latestBody.front.metrics.segments.thighR)} />
                </>
              )}
              {latestBody.side?.metrics.side && (
                <>
                  <Metric label="Neck–ear angle" value={deg(latestBody.side.metrics.side.neckEarDeg)} />
                  <Metric label="Ear ahead of shoulder" value={mm(latestBody.side.metrics.side.headAheadMm, 0)} />
                  <Metric label="Shoulders ahead of hips" value={mm(latestBody.side.metrics.side.shoulderAheadMm, 0)} />
                  <Metric label="Knee locked back" value={deg(latestBody.side.metrics.side.kneeBackDeg)} />
                </>
              )}
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted">
              Phone on the wall, back camera, 1.5–4.5 m away. The LiDAR reads the real distance to each
              joint, so lengths and angles are in real millimetres. Beeps and voice guide you.
            </p>
          )}
          {bodyScan.supported ? (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!!bodyBusy} onClick={() => void scanBody("front")}>
                {bodyBusy === "front" ? "Scanning…" : "Front"}
              </Button>
              <Button disabled={!!bodyBusy} onClick={() => void scanBody("side")}>
                {bodyBusy === "side" ? "Scanning…" : "Side"}
              </Button>
            </div>
          ) : (
            <p className="text-[0.7rem] text-faint">Body scanning needs the installed iPhone app.</p>
          )}
          <p className="mt-2 text-[0.7rem] leading-snug text-faint">
            Joint centre to joint centre, so widths read narrower than a tape measure. Neck–ear angle is
            for tracking change only — not comparable with clinical norms. Pelvic tilt and back rounding
            cannot be read from joints and are not shown.
            {(latestBody.front && !latestBody.front.lidar) || (latestBody.side && !latestBody.side.lidar)
              ? " This phone gave no LiDAR depth: fitted-model numbers only."
              : ""}
          </p>
        </Card>
      )}

      {stale.length > 0 && (
        <Card key="reanalyse">
          <CardTitle>Measured before the angle fix</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            {stale.length} {stale.length === 1 ? "scan was" : "scans were"} measured while the app
            read head turns on the wrong axis, so a slightly turned head could pass and be scored.
            Re-measure them from the saved photos with the fixed analyser.
          </p>
          <Button className="w-full" disabled={!!redo} onClick={() => void reanalyseAll()}>
            {redo ? `Re-measuring ${redo.done}/${redo.total}…` : `Re-analyse ${stale.length}`}
          </Button>
        </Card>
      )}

      {latest.size > 0 && (
        <div key="gallery" className="grid grid-cols-4 gap-2">
          {SLOTS.map(({ slot: k, label }) => {
            const sc = latest.get(k);
            return (
              <button
                key={k}
                type="button"
                disabled={!sc}
                onClick={() => sc && setOpen(sc)}
                className={cn(
                  "rounded-2xl border p-2.5 text-left",
                  sc ? "border-border bg-surface" : "border-dashed border-border bg-transparent",
                )}
              >
                <div className="text-[0.55rem] font-bold uppercase tracking-wider text-faint">
                  {label}
                </div>
                <div className="tabular font-display text-lg font-extrabold">
                  {sc?.face ? `${symmetryPercent(sc.face.alpha)}%` : "—"}
                </div>
                {/* Profile shots also carry the neck angle, which is the number
                    the neck and posture work is meant to move. */}
                {sc?.posture?.cvaEst != null && (
                  <div className="tabular text-[0.65rem] font-bold text-faint">
                    neck {sc.posture.cvaEst.toFixed(1)}°
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Card key="guide">
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle className="mb-0">
            {rows.length ? `${rows.length} captures` : "Nothing captured"}
          </CardTitle>
          {/* The only question anyone opens this tab with is what changed, and
              until now the tab could only say what you are today. */}
          {rows.length >= 2 && (
            <button
              type="button"
              onClick={() => setComparing(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold"
            >
              <ArrowLeftRight className="size-3.5" /> Compare
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="py-2 text-center text-xs text-faint">
            Captures land here, on the calendar, and in your backup.
          </p>
        ) : (
          <div className="space-y-1.5">
            {rows.slice(0, 40).map((sc) => (
              <SwipeRow
                key={sc.id}
                id={sc.id}
                openId={swiped}
                setOpenId={setSwiped}
                onEdit={() => setOpen(sc)}
                editLabel="Open"
                onDelete={() => del(sc)}
              >
                <button
                  type="button"
                  onClick={() => setOpen(sc)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">
                      {scanLabel(sc)}
                      {needsReanalysis(sc) ? (
                        <span className="ml-1.5 text-[0.6rem] font-bold text-faint">pre-fix</span>
                      ) : null}
                      {sc.face && !sc.face.gates.ok ? (
                        <span className="ml-1.5 text-[0.6rem] font-bold text-warn">gated</span>
                      ) : null}
                    </div>
                    <div className="text-[0.7rem] text-faint">
                      {sc.date}
                      {sc.face ? ` · ${symmetryPercent(sc.face.alpha)}% symmetry` : ""}
                      {sc.posture?.cvaEst != null ? ` · neck ${sc.posture.cvaEst.toFixed(1)}°` : ""}
                      {sc.depth?.raw
                        ? ` · 3D ${sc.depth.raw.rmsMm.toFixed(2)} mm`
                        : sc.depth?.symmetryRmsMm != null
                          ? ` · 3D mesh ${sc.depth.symmetryRmsMm.toFixed(2)} mm`
                          : ""}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </button>
              </SwipeRow>
            ))}
          </div>
        )}
      </Card>

      <p key="note" className="px-1 text-center text-[0.7rem] leading-relaxed text-faint">
        The mesh is MediaPipe&apos;s monocular depth, not Face ID or TrueDepth. Ratios are 2D
        heuristics on the pose you took, not skeletal cephalometrics.
      </p>

      {scanning && (
        <Suspense fallback={<LoadingSheet label="Loading the vision model…" />}>
          <ScanSheet onClose={() => setScanning(false)} />
        </Suspense>
      )}
      {open && (
        <Suspense fallback={<LoadingSheet label="Opening the file…" />}>
          <FaceFileSheet
            scan={open}
            siblings={rows}
            onGo={setOpen}
            onClose={() => setOpen(null)}
          />
        </Suspense>
      )}
      {comparing && (
        <Suspense fallback={<LoadingSheet label="Opening the captures…" />}>
          <CompareSheet scans={rows} onClose={() => setComparing(false)} />
        </Suspense>
      )}
    </WidgetGrid>
  );
}

function LoadingSheet({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-bg">
      <ScanFace className="size-8 animate-pulse text-accent" />
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function mm(v: number | null | undefined, digits: number): string {
  return v == null ? "—" : `${v.toFixed(digits)} mm`;
}

function seg(s: Segment | null): string {
  return s ? `${s.mm.toFixed(0)} mm${s.src === "model" ? " ·m" : ""}` : "—";
}

function deg(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toFixed(1)}°`;
}

function degPair(l: number | null | undefined, r: number | null | undefined): string {
  return `${deg(l)} / ${deg(r)}`;
}

function pct(l: Segment | null, r: Segment | null): string {
  const d = leftRightDiffPct(l, r);
  return d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[0.6rem] font-bold uppercase tracking-wider text-faint">{label}</div>
      <div className="tabular font-bold">{value}</div>
    </div>
  );
}

/** Which side sits further forward, ignoring differences under 0.3 mm. */
function side(leftMinusRight: number): string {
  if (Math.abs(leftMinusRight) < 0.3) return "even";
  return leftMinusRight > 0 ? "L" : "R";
}
