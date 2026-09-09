import { Suspense, lazy, useMemo, useState } from "react";
import { Camera, ChevronRight, ScanFace } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { SwipeRow } from "@/components/SwipeRow";
import { latestByKind, newestFirst, evennessTrend, type ScanRecord } from "@/lib/aether/scan-store";
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

const KIND_LABEL: Record<string, string> = {
  face_front_true: "Front",
  face_front_nhp: "Front (natural)",
  face_oblique: "45°",
  face_side: "Profile",
  posture_side: "Posture side",
  posture_front: "Posture front",
};

export function LooksView() {
  const scans = useSoma((s) => s.scans);
  const removeScan = useSoma((s) => s.removeScan);
  const restoreScan = useSoma((s) => s.restoreScan);

  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<ScanRecord | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);

  const today = getLocalDateKey(new Date());
  const rows = useMemo(() => newestFirst(scans), [scans]);
  const latest = useMemo(() => latestByKind(scans), [scans]);
  const trend = useMemo(() => evennessTrend(scans), [scans]);
  const front = latest.get("face_front_true");

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
      if (!useSoma.getState().scans.some((x) => x.id === scan.id)) void deleteScanImage(scan.id);
    }, 8000);
  };

  return (
    <div className="space-y-3 pb-4">
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

      <Button variant="primary" className="w-full" onClick={() => setScanning(true)}>
        <Camera className="size-4" /> Scan · front, 45°, profile
      </Button>

      {latest.size > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {["face_front_true", "face_oblique", "face_side"].map((k) => {
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
                  {KIND_LABEL[k]}
                </div>
                <div className="tabular font-display text-lg font-extrabold">
                  {sc?.face ? `${symmetryPercent(sc.face.alpha)}%` : "—"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <CardTitle>{rows.length ? `${rows.length} captures` : "Nothing captured"}</CardTitle>
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
                onDelete={() => del(sc)}
              >
                <button
                  type="button"
                  onClick={() => setOpen(sc)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">
                      {KIND_LABEL[sc.kind] ?? sc.kind}
                      {sc.face && !sc.face.gates.ok ? (
                        <span className="ml-1.5 text-[0.6rem] font-bold text-warn">gated</span>
                      ) : null}
                    </div>
                    <div className="text-[0.7rem] text-faint">
                      {sc.date}
                      {sc.face ? ` · ${symmetryPercent(sc.face.alpha)}% symmetry` : ""}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </button>
              </SwipeRow>
            ))}
          </div>
        )}
      </Card>

      <p className="px-1 text-center text-[0.7rem] leading-relaxed text-faint">
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
          <FaceFileSheet scan={open} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </div>
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
