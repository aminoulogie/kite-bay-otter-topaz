import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { loadScanImage } from "@/lib/habit-photos";
import { evennessOf, storyOf, type ScanRecord } from "@/lib/aether/scan-store";
import {
  distinctiveness, distinctivenessLabel, harmonySummary, regionPercent, symmetryPercent,
} from "@/lib/aether/harmony";
import { finding } from "@/lib/aether/evidence";
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
export function FaceFileSheet({
  scan, onClose, siblings = [], onGo,
}: {
  scan: ScanRecord;
  onClose: () => void;
  /** Every capture of the SAME pose, so stepping compares like with like. */
  siblings?: ScanRecord[];
  onGo?: (scan: ScanRecord) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const face = scan.face;

  /**
   * Stepping stays within one exact position — front, 45°, left or right
   * profile, 3D apart from 2D — and goes capture by capture, oldest to
   * newest, like stories. A front shot and a profile are not two frames of
   * the same sequence.
   */
  const story = useMemo(() => storyOf(siblings ?? [], scan), [siblings, scan]);
  const { prev, next } = story;
  const at = { index: story.index < 0 ? null : story.index, total: story.list.length };

  const go = useCallback(
    (target: ScanRecord | null) => {
      if (target && onGo) onGo(target);
    },
    [onGo],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { go(prev); e.preventDefault(); }
      else if (e.key === "ArrowRight") { go(next); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prev, next]);

  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    // The previous photo stays up until this one has loaded, so stepping
    // does not flash an empty frame.
    void loadScanImage(scan.id).then((url) => {
      if (alive && url) setImage(url);
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
            {scan.date} · {positionLabel(scan)}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="soma-scroll flex-1 space-y-3 overflow-y-auto px-4 pb-8 pt-3">
        {image && (
          <div
            className="relative select-none"
            data-no-swipe-nav
            onTouchStart={(e) => {
              const t = e.touches[0];
              touch.current = t ? { x: t.clientX, y: t.clientY } : null;
            }}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              const t = e.changedTouches[0];
              if (!start || !t) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
              go(dx < 0 ? next : prev);
            }}
          >
            <img
              src={image}
              alt=""
              draggable={false}
              className="w-full rounded-2xl border border-border"
            />
            {at.total > 1 && (
              <>
                {/* Stories: one bar per capture of this position, filled up
                    to this one. Left third taps back, the rest forward. */}
                <div className="pointer-events-none absolute inset-x-2 top-2 flex gap-1">
                  {story.list.map((x, i) => (
                    <span
                      key={x.id}
                      className={cn(
                        "h-[3px] flex-1 rounded-full",
                        i <= (at.index ?? -1) ? "bg-white" : "bg-white/35",
                      )}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={prev ? `Earlier capture, ${prev.date}` : "No earlier capture"}
                  disabled={!prev}
                  onClick={() => go(prev)}
                  className="absolute inset-y-0 left-0 w-1/3 disabled:pointer-events-none"
                />
                <button
                  type="button"
                  aria-label={next ? `Later capture, ${next.date}` : "No later capture"}
                  disabled={!next}
                  onClick={() => go(next)}
                  className="absolute inset-y-0 right-0 w-2/3 disabled:pointer-events-none"
                />
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.6rem] font-bold tabular text-white">
                  {scan.date} {scan.capturedAt.slice(11, 16)}
                </span>
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.6rem] font-bold tabular text-white">
                  {(at.index ?? 0) + 1}/{at.total}
                </span>
              </>
            )}
          </div>
        )}

        <StoryNumbers scan={scan} prev={prev} />

        {!face ? (
          !scan.posture && (
            <Card>
              <p className="text-xs text-faint">This capture has no face analysis.</p>
            </Card>
          )
        ) : (
          <>
            {scan.harmony && distinctiveness(scan.harmony) && (
              <Card>
                <CardTitle>Distinctiveness</CardTitle>
                <div className="flex items-end gap-3">
                  <div className="font-display text-6xl font-extrabold tabular leading-none">
                    {distinctiveness(scan.harmony)!.rms}
                  </div>
                  <div className="pb-1.5 text-xs text-muted">
                    SD from average
                    <div className="text-[0.65rem] text-faint">
                      over {distinctiveness(scan.harmony)!.measured} proportions
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-sm font-bold">
                  {distinctivenessLabel(distinctiveness(scan.harmony)!.rms)}
                </p>
                <p className="mt-2 text-[0.68rem] leading-snug text-faint">
                  The best-supported shape number here, and it is not symmetry. Recent work
                  finds attractiveness predicted by closeness to the average and by
                  femininity, and NOT by symmetry once averageness is accounted for. Lower is
                  more average. It is not a beauty score — plenty of striking faces are
                  distinctive, and the effect is much smaller on real photographs than on the
                  morphed faces the famous studies used.
                </p>
              </Card>
            )}

            <Card>
              <CardTitle>
                <span>Symmetry</span>
                <span className="text-[0.6rem] font-bold text-faint">
                  r ≈ {finding("symmetry")?.r} at most
                </span>
              </CardTitle>
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
                <br />
                <br />
                Worth less than the internet thinks. Meta-analysis puts symmetry&apos;s
                association with attractiveness at about r = 0.2, recent equivalence tests find
                it smaller still, and the 2025 shape work found it did not predict
                attractiveness at all once averageness was accounted for.
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
                {scan.skin.circleType && scan.skin.circleType !== "none" && (
                  <div className="mt-2 rounded-xl border border-border bg-surface-2 p-2.5">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
                        Under-eye type
                      </span>
                      <span className="text-[0.62rem] tabular text-faint">
                        ΔL* {scan.skin.deltaL} · Δa* {scan.skin.deltaA} · ΔITA {scan.skin.deltaITA}°
                      </span>
                    </div>
                    <div className="text-sm font-bold capitalize">{scan.skin.circleType}</div>
                    <p className="mt-0.5 text-[0.68rem] leading-snug text-muted">
                      {scan.skin.circleType === "pigmented"
                        ? "Lightness dominates the difference, which points at pigment. That responds to sun protection and topical actives, over months — not to sleep."
                        : scan.skin.circleType === "vascular"
                          ? "The red-green axis dominates, which points at vessels or shadow rather than pigment. That responds to sleep, fluid and allergy, within days — and topical brighteners will do nothing for it."
                          : "Neither axis dominates clearly enough to call it. Rescan in even, flat light before treating it as either."}
                    </p>
                  </div>
                )}
                <p className="mt-2 text-[0.68rem] leading-snug text-faint">
                  Each figure is measured against another patch of your own face, so a
                  different bulb does not move it. Compare these only between captures that
                  both passed their lighting gate.
                  <br />
                  <br />
                  This card is first on purpose. Skin tone evenness correlates with perceived
                  age at about r = −0.62 — several times the effect size of facial symmetry,
                  and the one thing on this screen that a habit can move within weeks.
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
                          <span className="truncate text-faint">
                            {r.norm.formula}
                            {r.norm.metByPct != null ? ` · met by ${r.norm.metByPct}%` : ""}
                          </span>
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
                  figure, and &quot;met by&quot; is the share of young adults who actually
                  satisfy that canon — 9.3% for the vertical thirds, 30.6% for the orbital
                  one, about 40% for the best of them. A canon almost nobody meets describes a
                  statue, not a target, and validity falls further outside European-descent
                  samples: several of these fit Southern Chinese and Tibetan faces essentially
                  never.
                  <br />
                  <br />
                  So a deviation here describes you; it does not mark you down. There is no
                  blended score because there is nothing true to calibrate one against.
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

function positionLabel(scan: ScanRecord): string {
  const base =
    scan.kind === "face_side"
      ? scan.side === "left" ? "Side L" : "Side R"
      : scan.kind === "face_oblique" ? "45°" : scan.kind === "face_front_true" ? "Front" : scan.kind.replace("_", " ");
  return scan.depth ? `${base} · 3D` : base;
}

/**
 * The headline numbers of this capture, and how each moved since the capture
 * before it in the same position — so stepping through the story shows the
 * change, not just the picture.
 */
function StoryNumbers({ scan, prev }: { scan: ScanRecord; prev: ScanRecord | null }) {
  const rows: { label: string; now: number; before: number | null; unit: string; digits: number }[] = [];
  const add = (label: string, get: (s: ScanRecord) => number | null | undefined, unit: string, digits: number) => {
    const now = get(scan);
    if (now == null || !Number.isFinite(now)) return;
    const b = prev ? get(prev) : null;
    rows.push({ label, now, before: b == null || !Number.isFinite(b) ? null : b, unit, digits });
  };
  add("Neck angle", (s) => s.posture?.cvaEst, "°", 1);
  add("Symmetry", (s) => (s.face ? symmetryPercent(s.face.alpha) : null), "%", 0);
  add("3D asymmetry", (s) => s.depth?.raw?.rmsMm ?? s.depth?.symmetryRmsMm, " mm", 2);
  add("Face width", (s) => s.depth?.faceWidthMm, " mm", 1);
  if (!rows.length) return null;
  return (
    <Card>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map((r) => {
          const d = r.before == null ? null : r.now - r.before;
          return (
            <div key={r.label}>
              <div className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">{r.label}</div>
              <div className="tabular font-display text-lg font-extrabold">
                {r.now.toFixed(r.digits)}
                {r.unit}
                {d != null && (
                  <span className="ml-1.5 text-[0.7rem] font-bold text-faint">
                    {d >= 0 ? "+" : "−"}
                    {Math.abs(d).toFixed(r.digits)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {prev && <p className="mt-2 text-[0.65rem] text-faint">Change since {prev.date}.</p>}
    </Card>
  );
}
