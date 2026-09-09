import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { loadScanImage } from "@/lib/habit-photos";
import { evennessOf, type ScanRecord } from "@/lib/aether/scan-store";
import { cn } from "@/lib/utils";

/**
 * The Face File: what one capture actually measured, and under what conditions.
 *
 * Everything on this screen is qualified by the pose it was taken at, because
 * that is the honest reading. Alpha is total shape asymmetry UNDER THIS POSE —
 * not fluctuating asymmetry, which needs repeated measurements of the same
 * landmark and cannot come from one photograph. The gates that failed are
 * listed rather than hidden, because a gated capture is still worth keeping
 * and worth not trusting.
 *
 * Evenness is shown as a percentage because a raw Procrustes distance means
 * nothing to a person, but the raw figure is shown beside it so the number is
 * checkable rather than a black box.
 */
export function FaceFileSheet({ scan, onClose }: { scan: ScanRecord; onClose: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const face = scan.face;

  useEffect(() => {
    let alive = true;
    void loadScanImage(scan.id).then((url) => {
      if (alive) setImage(url);
    });
    return () => {
      alive = false;
    };
  }, [scan.id]);

  const evenness = evennessOf(face);
  const p = face?.proportions;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between border-b border-border px-4 pb-3">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-extrabold">Face File</div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-faint">
            {scan.date} · {scan.kind.replace("face_", "").replace("_", " ")}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="soma-scroll flex-1 space-y-3 overflow-y-auto px-4 pb-8 pt-3">
        {image && (
          <img src={image} alt="" className="w-full rounded-2xl border border-border" />
        )}

        {!face ? (
          <Card>
            <p className="text-xs text-faint">This capture has no face analysis.</p>
          </Card>
        ) : (
          <>
            <Card>
              <CardTitle>Evenness</CardTitle>
              <div className="flex items-end gap-3">
                <div className="font-display text-5xl font-extrabold tabular">{evenness}</div>
                <div className="pb-1.5 text-xs text-muted">
                  under this pose
                  <div className="text-[0.65rem] text-faint">α {face.alpha.toFixed(4)}</div>
                </div>
              </div>
              <p className="mt-2 text-[0.68rem] leading-snug text-faint">
                Total shape asymmetry in this photograph. Not a rating, and not fluctuating
                asymmetry — that needs repeated measurements and cannot come from one frame.
              </p>
            </Card>

            <Card>
              <CardTitle>How it was taken</CardTitle>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([
                  ["Yaw", `${face.yawDeg.toFixed(0)}°`],
                  ["Pitch", `${face.pitchDeg.toFixed(0)}°`],
                  ["Roll", `${face.rollDeg.toFixed(1)}°`],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-surface-2 p-2">
                    <div className="text-[0.55rem] font-bold uppercase tracking-wider text-faint">{label}</div>
                    <div className="tabular font-display text-sm font-extrabold">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[0.62rem] font-bold">
                <span className="rounded-full bg-surface-2 px-2 py-1 text-muted">
                  pose from {face.poseSource === "matrix" ? "transform matrix" : "landmark proxy"}
                </span>
                <span className="rounded-full bg-surface-2 px-2 py-1 text-muted">
                  confidence {Math.round(face.confidence * 100)}%
                </span>
                {face.lighting && (
                  <span className="rounded-full bg-surface-2 px-2 py-1 text-muted">
                    light {face.lighting.grade}
                  </span>
                )}
              </div>
              {!face.gates.ok && (
                <div className="mt-2 rounded-xl border border-warn/30 bg-warn/10 p-2.5">
                  <div className="mb-1 text-[0.62rem] font-bold uppercase tracking-wider text-warn">
                    Gates not met
                  </div>
                  <ul className="space-y-0.5 text-[0.7rem] leading-snug text-warn">
                    {face.gates.reasons.map((r) => (
                      <li key={r}>· {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card>
              <CardTitle>By region</CardTitle>
              <div className="space-y-1.5">
                {(Object.entries(face.regional) as [string, number][]).map(([region, v]) => (
                  <div key={region}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="capitalize text-muted">{region}</span>
                      <span className="tabular text-faint">{v.toFixed(3)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      {/* Scaled so an ordinary reading uses most of the bar; a
                          raw fraction of 1 would leave every bar looking empty. */}
                      <div
                        className={cn("h-full rounded-full", v > 0.08 ? "bg-warn" : "bg-accent")}
                        style={{ width: `${Math.min(100, v * 700)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardTitle>Paired measurements</CardTitle>
              <p className="mb-2 text-[0.68rem] leading-snug text-faint">
                Longer side over shorter, so every figure is at or above 1. Roughly 0.95–1.05
                is near-even on a phone photograph.
              </p>
              <div className="space-y-1">
                {face.edma.map((e) => (
                  <div key={e.name} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate text-muted">{e.name}</span>
                    <span
                      className={cn(
                        "shrink-0 tabular font-bold",
                        e.ratio > 1.05 ? "text-danger" : "text-fg",
                      )}
                    >
                      {e.ratio.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {p && (
              <Card>
                <CardTitle>Proportions</CardTitle>
                <div className="space-y-1 text-xs">
                  {([
                    ["Canthal tilt L / R", `${p.canthalTiltL.toFixed(1)}° / ${p.canthalTiltR.toFixed(1)}°`],
                    ["Canthal tilt difference", `${p.canthalTiltAsym.toFixed(1)}°`],
                    ["Intercanthal ÷ palpebral", p.intercanthalOverPalpebral.toFixed(2)],
                    ["Midface ÷ lower third", p.midfaceOverLower.toFixed(2)],
                    ["Mouth ÷ intercanthal", p.mouthOverIntercanthal.toFixed(2)],
                    ["Nose ÷ mouth width", p.noseOverMouth.toFixed(2)],
                    ["Jaw ÷ cheek width", p.jawOverBizygomatic.toFixed(2)],
                    ["Facial index (H÷W)", p.facialIndex.toFixed(2)],
                    ["Convexity at nose tip", p.convexityDeg == null ? "no depth" : `${p.convexityDeg.toFixed(1)}°`],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-muted">{label}</span>
                      <span className="shrink-0 tabular font-bold">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[0.68rem] text-faint">
                  Shape heuristic: {face.faceShape.label}.
                </p>
              </Card>
            )}

            <Card>
              <CardTitle>What this is not</CardTitle>
              <ul className="space-y-1 text-[0.7rem] leading-snug text-faint">
                {face.notes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
              <p className="mt-2 text-[0.62rem] text-faint">Analyser {face.analyzerVersion}</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
