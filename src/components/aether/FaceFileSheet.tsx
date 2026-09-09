import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { loadScanImage } from "@/lib/habit-photos";
import { evennessOf, type ScanRecord } from "@/lib/aether/scan-store";
import { harmonySummary, regionPercent, symmetryPercent } from "@/lib/aether/harmony";
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
              <CardTitle>Symmetry</CardTitle>
              <div className="flex items-end gap-3">
                <div className="font-display text-6xl font-extrabold tabular leading-none">
                  {symmetryPercent(face.alpha)}
                  <span className="text-2xl">%</span>
                </div>
                <div className="pb-1.5 text-xs text-muted">
                  under this pose
                  <div className="text-[0.65rem] text-faint">
                    α {face.alpha.toFixed(4)} · evenness {evenness}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(Object.entries(face.regional) as [string, number][]).map(([region, v]) => (
                  <div key={region} className="rounded-xl border border-border bg-surface-2 p-2">
                    <div className="text-[0.55rem] font-bold uppercase tracking-wider text-faint">
                      {region}
                    </div>
                    <div className="tabular font-display text-xl font-extrabold">
                      {regionPercent(v)}%
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[0.68rem] leading-snug text-faint">
                Procrustes shape asymmetry in this photograph, scaled so an ordinary face
                lands in the nineties — everyone is asymmetric, and a scale reporting everyone
                near 100 would measure nothing. Not fluctuating asymmetry: that needs repeated
                measurements and cannot come from one frame.
              </p>
            </Card>

            {scan.skin && (
              <Card>
                <CardTitle>Skin and soft tissue</CardTitle>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["Under-eye", scan.skin.underEyeIndex, "% darker than cheek"],
                    ["Puffiness", scan.puffiness ?? null, "cheek ÷ eye span"],
                    ["Redness", scan.skin.erythemaIndex, "cheek vs forehead a*"],
                    ["Unevenness", scan.skin.unevenness, "% tone spread"],
                    ["Shine", scan.skin.shine, "% specular"],
                  ] as const).map(([label, value, unit]) => (
                    <div key={label} className="rounded-xl border border-border bg-surface-2 p-2.5">
                      <div className="text-[0.55rem] font-bold uppercase tracking-wider text-faint">
                        {label}
                      </div>
                      <div className="tabular font-display text-2xl font-extrabold">
                        {value == null ? "—" : value}
                      </div>
                      <div className="text-[0.55rem] leading-tight text-faint">{unit}</div>
                    </div>
                  ))}
                </div>
                {scan.skin.underEyeL != null && scan.skin.underEyeR != null && (
                  <p className="mt-2 text-[0.7rem] text-muted">
                    Under-eye left {scan.skin.underEyeL} · right {scan.skin.underEyeR}
                  </p>
                )}
                <p className="mt-2 text-[0.68rem] leading-snug text-faint">
                  Each figure is measured against another patch of your own face, so a
                  different bulb does not move it. Compare these only between captures that
                  both passed their lighting gate.
                </p>
              </Card>
            )}

            {scan.harmony && scan.harmony.length > 0 && (
              <Card>
                <CardTitle>
                  <span>Against published norms</span>
                  <span className="text-xs font-bold text-muted">
                    {harmonySummary(scan.harmony).typical}/{harmonySummary(scan.harmony).measured} typical
                  </span>
                </CardTitle>
                <div className="space-y-2">
                  {scan.harmony
                    .filter((r) => r.value != null)
                    .map((r) => (
                      <div key={r.norm.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-bold">{r.norm.label}</span>
                          <span className="shrink-0 tabular text-sm font-extrabold">
                            {r.value}
                            {r.norm.unit === "deg" ? "°" : ""}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 text-[0.62rem]">
                          <span className="truncate text-faint">{r.norm.formula}</span>
                          <span
                            className={cn(
                              "shrink-0 tabular font-bold",
                              r.typical ? "text-muted" : "text-warn",
                            )}
                          >
                            norm {r.norm.norm}
                            {r.norm.unit === "deg" ? "°" : ""} · {r.pct! >= 0 ? "+" : ""}
                            {r.pct}
                            {r.norm.unit === "deg" ? "°" : "%"}
                          </span>
                        </div>
                        {/* Where this sits within the natural spread. Centre is
                            the norm; the band is one standard deviation either
                            side, which is what "typical" means here. */}
                        <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <span className="absolute inset-y-0 left-1/3 w-1/3 bg-accent/15" />
                          <span
                            className={cn(
                              "absolute top-0 h-full w-0.5",
                              r.typical ? "bg-accent" : "bg-warn",
                            )}
                            style={{
                              left: `${Math.max(1, Math.min(99, 50 + (r.z ?? 0) * 16.67))}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
                <p className="mt-2 text-[0.66rem] leading-snug text-faint">
                  The shaded band is one standard deviation either side of the published
                  figure. Farkas&apos;s own large-sample work found these canons are often NOT
                  met in faces everyone agrees are attractive, and that they differ by
                  ancestry — so a deviation here describes you, it does not mark you down.
                  There is no blended score because there is nothing true to calibrate one
                  against.
                </p>
              </Card>
            )}

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
