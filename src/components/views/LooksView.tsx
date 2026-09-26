import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Camera, ChevronRight, ScanFace } from "lucide-react";
import { Sized, WidgetGrid } from "@/components/WidgetGrid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { SwipeRow } from "@/components/SwipeRow";
import { bodyKey, cloudKey, cylKey, depthGridKey, latestByKind, meshKey, misfiledAs, needsReanalysis, newestFirst, evennessTrend, matchesFilter, SCAN_FILTERS, type ScanFilter, type ScanRecord } from "@/lib/aether/scan-store";
import { trueDepthAvailable } from "@/lib/native/face-depth";
import { bodyScanAvailable, type BodyScanMode } from "@/lib/native/body-depth";
import { leftRightDiffPct, type Segment } from "@/lib/aether/body3d";
import { LooksResults } from "@/components/aether/LooksResults";
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
  const refileScan = useSoma((s) => s.refileScan);

  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<ScanRecord | null>(null);
  const [comparing, setComparing] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [filter, setFilter] = useState<ScanFilter>("all");
  const [redo, setRedo] = useState<{ done: number; total: number } | null>(null);
  const addScan = useSoma((s) => s.addScan);
  // Results first once there is a full scan to show; the scan list otherwise.
  const [page, setPage] = useState<"results" | "scans">(() =>
    useSoma.getState().scans.some((x) => x.depth?.sweep) ? "results" : "scans",
  );
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
  const sweeps = useMemo(() => newestFirst(scans).filter((x) => x.depth?.sweep), [scans]);
  const latestSweep = sweeps[0]?.depth ?? null;
  const prevSweep = sweeps[1]?.depth ?? null;
  // An older quick front scan is only shown when nothing newer replaced it.
  const latestDepth = useMemo(() => {
    const quick = newestFirst(scans).find((x) => x.depth && !x.depth.sweep);
    return quick && (!sweeps[0] || quick.capturedAt > sweeps[0].capturedAt) ? quick.depth! : null;
  }, [scans, sweeps]);

  /**
   * The native TrueDepth scan. Audio is enabled here, in the tap, because iOS
   * lets sound start only inside a gesture; the scan module and its Swift side
   * are loaded only now.
   */
  const scan3d = async (mode: "still" | "sweep" | "full" = "sweep") => {
    if (depthBusy) return;
    setDepthBusy(true);
    try {
      const [{ AssistAudio }, { runTrueDepthScan }] = await Promise.all([
        import("@/lib/aether/assist-audio"),
        import("@/lib/aether/truedepth-scan"),
      ]);
      depthAudio.current ??= new AssistAudio();
      depthAudio.current.enable();
      const { record, extra } = await runTrueDepthScan(depthAudio.current, mode, scans);
      addScan(record);
      extra.forEach(addScan);
      const sym = record.depth?.sweep?.symmetry;
      toast.success(
        sym
          ? `3D sweep saved · asymmetry ${sym.rmsMm.toFixed(2)} ± ${(record.depth?.sweep?.symmetryNoiseMm ?? 0).toFixed(2)} mm`
          : record.depth?.symmetryRmsMm != null
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
  const shown = useMemo(() => rows.filter((x) => matchesFilter(x, filter)), [rows, filter]);
  const latest = useMemo(() => latestByKind(scans), [scans]);
  const trend = useMemo(() => evennessTrend(scans), [scans]);
  const front = latest.get("face_front_true");
  const stale = useMemo(() => scans.filter(needsReanalysis), [scans]);
  const refiled = stale.some((x) => x.analyzer === "refiled");

  // Turned shots the old auto-shutter filed as Front go back to their real
  // slot, then show up below for re-measuring as the pose they are.
  useEffect(() => {
    const wrong = scans.map((x) => [x, misfiledAs(x)] as const).filter(([, m]) => m);
    if (!wrong.length) return;
    for (const [x, m] of wrong) refileScan(x.id, m!.kind, m!.side);
    toast(`Moved ${wrong.length} turned ${wrong.length === 1 ? "shot" : "shots"} out of Front into 45° / profile.`);
  }, [scans, refileScan]);

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
          void deleteScanImage(cylKey(scan.id));
          void deleteScanImage(cloudKey(scan.id));
        }
        if (scan.body) void deleteScanImage(bodyKey(scan.id));
      }
    }, 8000);
  };

  const pages = (
    <div className="mb-3 flex rounded-full border border-border p-1" data-no-swipe-nav>
      {(["results", "scans"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPage(p)}
          className={cn(
            "h-8 flex-1 rounded-full text-xs font-bold capitalize",
            page === p ? "bg-accent text-accent-ink" : "text-muted",
          )}
        >
          {p === "results" ? "3D Results" : "Scans"}
        </button>
      ))}
    </div>
  );

  if (page === "results") {
    return (
      <div>
        {pages}
        <LooksResults
          scans={scans}
          scanning={depthBusy}
          onScan={() => (hasTrueDepth ? void scan3d("full") : toast.error("3D scanning needs the installed iPhone app."))}
          setupGuide={<ScanSpotGuide open />}
        />
      </div>
    );
  }

  return (
    <>
    {pages}
    <WidgetGrid tab="looks">
      <Sized key="latest" glance={{
          label: "Latest front",
          short: "Symmetry",
          color: "#64d2ff",
          value: front?.face ? String(symmetryPercent(front.face.alpha)) : null,
          unit: "%",
          sub: front?.face
            ? `${agoLabel(front.date, today)}${change != null ? ` · ${change >= 0 ? "+" : ""}${change.toFixed(1)} since first` : ""}`
            : null,
          chart: { values: trend.map((t) => symmetryPercent(1 - t.evenness / 100)) },
          empty: "No front capture yet",
          emptyShort: "Scan",
        }}>
      <Card>
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
      </Sized>

      <Button key="scan" variant="primary" className="w-full" onClick={() => setScanning(true)}>
        <Camera className="size-4" /> Scan · front, 45°, profile
      </Button>

      {/* The key goes on the element the condition produces, not on a wrapper
          around it. A wrapper renders as an empty div when the condition is
          false, and an empty div still takes the height its size asks for —
          which is a hole in the page with nothing to say what it is. With the
          key here the whole expression is simply absent and the grid skips
          the cell. */}
      {(hasTrueDepth || latestDepth || latestSweep) && (
        <Sized key="truedepth" glance={() => {
            const rms = latestDepth?.raw?.rmsMm ?? latestDepth?.symmetryRmsMm ?? null;
            return {
              label: "3D scan · TrueDepth",
              short: "3D",
              color: "#64d2ff",
              value: rms != null ? rms.toFixed(2) : null,
              unit: "mm",
              sub: rms != null ? "asymmetry, measured" : null,
              lines: latestDepth
                ? [
                    { text: "Face width", value: mm(latestDepth.faceWidthMm, 0) },
                    { text: "Eye distance", value: mm(latestDepth.ipdMm, 1) },
                  ]
                : [],
              empty: hasTrueDepth ? "Tap to scan in 3D" : "Needs the Face ID camera",
              emptyShort: "Scan",
            };
          }}>
        <Card>
          <CardTitle>3D scan · TrueDepth</CardTitle>
          {latestSweep?.sweep && <SweepMetrics d={latestSweep} prev={prevSweep} />}
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
          ) : latestSweep ? null : (
            <p className="mb-3 text-xs text-muted">
              Uses the Face ID camera&apos;s infrared depth to measure your face in real millimetres —
              no photo distortion, works in dim light. Everything stays on this phone.
            </p>
          )}
          {hasTrueDepth ? (
            <div className="space-y-2">
              <Button className="w-full" disabled={depthBusy} onClick={() => void scan3d("full")}>
                {depthBusy ? "Scanning…" : "Full 3D scan · face, sides, neck"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={depthBusy} onClick={() => void scan3d("sweep")}>
                  Face sweep
                </Button>
                <Button variant="outline" disabled={depthBusy} onClick={() => void scan3d("still")}>
                  Quick front
                </Button>
              </div>
              <ScanSpotGuide />
            </div>
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
        </Sized>
      )}

      {(bodyScan.supported || latestBody.front || latestBody.side) && (
        <Sized key="lidar-body" glance={{ label: "Body scan · LiDAR", short: "Body", empty: bodyScan.supported ? "Tap to scan front or side" : "Needs the installed iPhone app", emptyShort: "Scan" }}>
        <Card>
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
        </Sized>
      )}

      {stale.length > 0 && (
        <Sized key="reanalyse" glance={{ label: "Scans to re-measure", short: "Re-measure", value: String(stale.length), unit: "scans", empty: "" }}>
        <Card>
          <CardTitle>{refiled ? "Scans to re-measure" : "Measured before the angle fix"}</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            {refiled
              ? `${stale.length} ${stale.length === 1 ? "scan needs" : "scans need"} measuring again: some 45° and profile shots were saved as Front and scored as front faces. They are back in their own slots; re-measure them as the pose they really are.`
              : `${stale.length} ${stale.length === 1 ? "scan was" : "scans were"} measured while the app read head turns on the wrong axis, so a slightly turned head could pass and be scored. Re-measure them from the saved photos with the fixed analyser.`}
          </p>
          <Button className="w-full" disabled={!!redo} onClick={() => void reanalyseAll()}>
            {redo ? `Re-measuring ${redo.done}/${redo.total}…` : `Re-analyse ${stale.length}`}
          </Button>
        </Card>
        </Sized>
      )}

      {latest.size > 0 && (
        <Sized key="gallery" glance={() => ({
          label: "Captures",
          short: "Slots",
          lines: SLOTS.map(({ slot, label }) => {
            const sc = latest.get(slot);
            return { text: label, value: sc?.face ? `${symmetryPercent(sc.face.alpha)}%` : sc ? "photo" : "—" };
          }),
        })}>
        <div className="grid grid-cols-4 gap-2">
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
        </Sized>
      )}

      <Sized key="guide" glance={() => ({
          label: "Captures",
          short: "Scans",
          value: rows.length ? String(rows.length) : null,
          unit: rows.length === 1 ? "capture" : "captures",
          lines: rows.map((sc) => ({ text: scanLabel(sc), value: sc.date.slice(5) })),
          empty: "Nothing captured",
          emptyShort: "None",
        })}>
      <Card>
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
        {rows.length > 0 && (
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" data-no-swipe-nav>
            {SCAN_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[0.7rem] font-bold",
                  filter === f.id ? "border-transparent bg-fg text-bg" : "border-border bg-surface-2 text-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="py-2 text-center text-xs text-faint">
            Captures land here, on the calendar, and in your backup.
          </p>
        ) : shown.length === 0 ? (
          <p className="py-2 text-center text-xs text-faint">No captures in this position yet.</p>
        ) : (
          <div className="space-y-1.5">
            {shown.slice(0, 60).map((sc) => (
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
      </Sized>

      <Sized
        key="note"
        glance={{
          label: "What the mesh is",
          short: "Note",
          lines: [{ text: "Monocular depth, not TrueDepth" }, { text: "Ratios are 2D, pose-dependent" }],
        }}
      >
      <p className="px-1 text-center text-[0.7rem] leading-relaxed text-faint">
        The mesh is MediaPipe&apos;s monocular depth, not Face ID or TrueDepth. Ratios are 2D
        heuristics on the pose you took, not skeletal cephalometrics.
      </p>
      </Sized>

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
    </>
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

/**
 * The sweep's numbers, each with its ±. A change between two sweeps smaller
 * than the ± is noise, and saying so is the point.
 */
function SweepMetrics({ d, prev }: { d: NonNullable<ScanRecord["depth"]>; prev: ScanRecord["depth"] | null }) {
  const s = d.sweep!;
  const p = prev?.sweep;
  /** The change against the previous sweep — the real test of repeatability. */
  const vs = (now: number | null | undefined, before: number | null | undefined, digits = 1) =>
    now != null && before != null ? ` (${now - before >= 0 ? "+" : ""}${(now - before).toFixed(digits)} vs last)` : "";
  const pm = (v: number | null | undefined, e: number | null | undefined, digits: number) =>
    v == null ? "—" : `${v.toFixed(digits)}${e != null ? ` ± ${e.toFixed(digits)}` : ""} mm`;
  const cell = s.cellNoiseMm;
  const ch = d.changeVsFirst;
  return (
    <div className="mb-3 space-y-2">
      <div className="text-[0.6rem] font-bold uppercase tracking-wider text-accent">Latest sweep</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <Metric label="Asymmetry · 3D" value={pm(s.symmetry?.rmsMm, s.symmetryNoiseMm, 2) + vs(s.symmetry?.rmsMm, p?.symmetry?.rmsMm, 2)} />
        <Metric
          label="Fuller side (up / mid / low)"
          value={s.symmetry ? (["upper", "middle", "lower"] as const).map((k) => side(s.symmetry!.leftMinusRightMm[k])).join(" / ") : "—"}
        />
        <Metric label="Cheek width" value={pm(s.cheekWidthMm, cell, 1) + vs(s.cheekWidthMm, p?.cheekWidthMm)} />
        <Metric label="Jaw width" value={pm(s.jawWidthMm, cell, 1) + vs(s.jawWidthMm, p?.jawWidthMm)} />
        <Metric label="Chin behind nose tip" value={pm(s.chinBehindNoseMm, cell, 1) + vs(s.chinBehindNoseMm, p?.chinBehindNoseMm)} />
        <Metric label="Surface noise" value={cell == null ? "—" : `${cell.toFixed(2)} mm`} />
        <Metric label="Coverage" value={`${Math.round(s.coverage * 100)}% · ring ${Math.round(s.sweepCoverage * 100)}%`} />
        {d.refine && (
          <Metric
            label="Frames re-placed"
            value={`${d.refine.placed}/${d.refine.frames} · ${d.refine.used ? `noise ${d.refine.noiseBeforeMm?.toFixed(2)} → ${d.refine.noiseAfterMm?.toFixed(2)} mm` : "kept phone's (not better)"}`}
          />
        )}
        {s.full && <FullMetrics f={s.full} prev={p?.full ?? null} />}
        {ch && (
          <Metric
            label="Change vs first sweep"
            value={
              cell != null && ch.rmsMm < 2 * cell * Math.SQRT2
                ? `${ch.rmsMm.toFixed(2)} mm · within noise`
                : `${ch.rmsMm.toFixed(2)} mm · L ${signed(ch.byRegion.left)} R ${signed(ch.byRegion.right)}`
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * The one-time setup that makes full scans repeatable. Distances are what
 * TrueDepth is most accurate at; the stickers fix the neck's angle, which is
 * the easiest thing to change by accident between scans.
 */
function ScanSpotGuide({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-bold">Set up your scan spot (once)</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted">
        <li>Stick the phone to a mirror or wall at eye level, top camera up.</li>
        <li>Stand facing it, face about 30 cm away. Tape a line at your toes: mark 1.</li>
        <li>Turn your whole body right until side-on, head still in line with your shoulders — the
          side of your face about 30 cm from the phone. Tape at your toes: mark 2. Same to the left: mark 3.</li>
        <li>At each side mark, look level and put a small sticker where your eyes land. Look at it
          during every hold.</li>
        <li>Posture mark: from the right side mark, take one normal step straight back (the phone about
          50–60 cm from your shoulder) and tape it too. You turn on that spot for both posture holds.</li>
        <li>Hair behind the ears, no collar, shoulders relaxed, breathe normally.</li>
      </ol>
      <p className="mt-2 text-faint">
        During the scan the voice leads, in five steps: (1) look at the screen and do the four head
        moves; (2) turn left onto the side mark and hold; (3) turn right, through the front, onto the
        right mark and hold; (4) one step back to the posture mark, hold; (5) turn round to the left
        there and hold. Keep your neck still and turn with your feet.
      </p>
    </details>
  );
}

/** Side profile, neck and posture from a full scan. */
type Full = NonNullable<NonNullable<NonNullable<ScanRecord["depth"]>["sweep"]>["full"]>;

/** How one side of a full scan went, in words: so a failure says why. */
function sideLine(label: string, st: NonNullable<Full["sides"]>["right"]): string {
  const posture =
    st.postureUsed != null
      ? ` · posture ${st.postureUsed ? `${st.postureUsed} frames used` : "not used"}`
      : st.diag?.posture && st.diag.posture !== "held"
        ? ` · posture: ${st.diag.posture}`
        : "";
  return sideCore(label, st) + posture;
}

function sideCore(label: string, st: NonNullable<Full["sides"]>["right"]): string {
  if (st.holds > 0)
    return `${label}: ${st.holds} holds used · ${st.overlapMm != null ? `${st.overlapMm.toFixed(1)} mm from the front scan` : `fit ${st.fitMm?.toFixed(1) ?? "?"} mm`}${st.rejected ? ` · ${st.rejected} rejected` : ""}`;
  if (st.rejected)
    return `${label}: not used — ${st.rejected} holds ${
      st.rejectReason === "off the face"
        ? `sat ${st.rejectedOverlapMm != null ? `${st.rejectedOverlapMm.toFixed(1)} mm` : "too far"} off the front scan (limit 1.5)`
        : st.rejectReason === "no overlap"
          ? "didn't overlap the front scan"
          : "fitted too loosely"
    }. Numbers needing this side are left blank.`;
  if (st.received && !st.holds)
    return `${label}: none placed — ${st.aligned} of ${st.received} frames matched the model, ${st.lost} lost${st.diag?.outcome ? ` · ${st.diag.outcome}` : ""}`;
  const why = st.diag?.outcome ?? (st.received ? `${st.received} sent, ${st.aligned} placed` : "nothing sent");
  const dist = st.diag?.distance != null ? ` · ${(st.diag.distance * 100).toFixed(0)} cm` : "";
  return `${label} 0 · ${why}${st.diag?.depthFrames != null ? ` · ${st.diag.depthFrames} depth frames` : ""}${dist}`;
}

function FullMetrics({ f, prev }: { f: Full; prev: Full | null }) {
  const vs = (now: number | null, before: number | null | undefined, digits = 1) =>
    now != null && before != null ? ` (${now - before >= 0 ? "+" : ""}${(now - before).toFixed(digits)} vs last)` : "";
  const deg = (v: number | null, e?: number | null) =>
    v == null ? "—" : `${v.toFixed(1)}°${e != null ? ` ± ${e.toFixed(1)}` : ""}`;
  const mm0 = (v: number | null, e?: number | null) =>
    v == null ? "—" : `${v.toFixed(0)}${e != null ? ` ± ${e.toFixed(0)}` : ""} mm`;

  return (
    <>
      <div className="col-span-2 mt-1 text-[0.6rem] font-bold uppercase tracking-wider text-accent">Profile & neck</div>
      <Metric label="Chin–neck angle" value={deg(f.chinNeckDeg, f.chinNeckNoiseDeg) + vs(f.chinNeckDeg, prev?.chinNeckDeg)} />
      <Metric label="Under-chin length" value={mm0(f.underChinMm)} />
      <Metric label="Neck width" value={mm0(f.neckWidthMm, f.neckWidthNoiseMm) + vs(f.neckWidthMm, prev?.neckWidthMm, 0)} />
      <Metric label={f.neckDepthPartial ? "Neck depth (partial)" : "Neck depth"} value={mm0(f.neckDepthMm)} />
      <Metric
        label="Neck ≈ tape"
        value={
          f.neckCircumferenceMm == null
            ? "—"
            : f.neckDepthPartial
              ? "needs the back of the neck"
              : `${(f.neckCircumferenceMm / 10).toFixed(1)} cm est.`
        }
      />
      <Metric label="Neck / cheek · jaw" value={`${f.neckToCheek?.toFixed(2) ?? "—"} · ${f.neckToJaw?.toFixed(2) ?? "—"}`} />
      <div className="col-span-2 mt-1 text-[0.6rem] font-bold uppercase tracking-wider text-accent">Posture (vs gravity)</div>
      <Metric label="Neck lean forward" value={deg(f.neckLeanDeg)} />
      <Metric label="Head tipped forward" value={deg(f.headPitchDeg)} />
      <Metric label="Reached below chin" value={mm0(f.reachBelowChinMm)} />
      {f.sides && (
        <div className="col-span-2 text-[0.65rem] leading-snug text-faint">
          {sideLine("Right", f.sides.right)}
          <br />
          {sideLine("Left", f.sides.left)}
        </div>
      )}
    </>
  );
}

function signed(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
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
