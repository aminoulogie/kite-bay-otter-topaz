import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { loadScanImage } from "@/lib/habit-photos";
import { comparability, compareScans, defaultPair, verdict } from "@/lib/aether/compare";
import type { ScanRecord } from "@/lib/aether/scan-store";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  face_front_true: "Front",
  face_front_nhp: "Front (natural)",
  face_oblique: "45°",
  face_side: "Profile",
  posture_side: "Posture side",
  posture_front: "Posture front",
};

/**
 * Two captures, side by side.
 *
 * The tab could tell you what you are today and never what changed, which is
 * the only question anyone opens it with. The reason it was hard is the reason
 * this screen leads with comparability rather than numbers: two captures at
 * different head angles produce a confident difference that is entirely the
 * angle, and a "+2% symmetry" nobody can spot as false is worse than no
 * feature at all.
 *
 * So the photographs are always shown — looking at two pictures is always
 * legitimate — and the figures appear only when the pair passes. When it does
 * not, the reasons are printed where the numbers would have been.
 */
export function CompareSheet({
  scans, onClose,
}: {
  scans: ScanRecord[];
  onClose: () => void;
}) {
  const initial = useMemo(() => defaultPair(scans), [scans]);
  const [left, setLeft] = useState<ScanRecord | null>(initial?.[0] ?? null);
  const [right, setRight] = useState<ScanRecord | null>(initial?.[1] ?? null);
  const [picking, setPicking] = useState<"left" | "right" | null>(null);

  const check = left && right ? comparability(left, right) : null;
  const deltas = left && right && check?.ok ? compareScans(left, right) : [];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between border-b border-border px-4 pb-3">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-extrabold">Compare</div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-faint">
            {left && right ? `${left.date} → ${right.date}` : "Pick two captures"}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-2">
          <Side scan={left} label="Before" onPick={() => setPicking("left")} />
          <Side scan={right} label="After" onPick={() => setPicking("right")} />
        </div>

        {left && right && (
          <button
            type="button"
            onClick={() => {
              setLeft(right);
              setRight(left);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2 text-xs font-bold"
          >
            <ArrowLeftRight className="size-3.5" /> Swap
          </button>
        )}

        {!left || !right ? (
          <Card>
            <p className="text-xs leading-snug text-faint">
              {scans.length < 2
                ? "Two captures of the same pose are needed before anything can be compared."
                : "Tap a panel to choose which two captures to put side by side."}
            </p>
          </Card>
        ) : !check?.ok ? (
          <Card>
            <CardTitle>Not comparable</CardTitle>
            <ul className="space-y-1.5">
              {check!.reasons.map((r) => (
                <li key={r} className="text-xs leading-snug text-muted">
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.68rem] leading-snug text-faint">
              The photographs are still worth looking at. The numbers are not — a
              difference measured across two poses is a measurement of the pose.
            </p>
          </Card>
        ) : deltas.length === 0 ? (
          <Card>
            <p className="text-xs leading-snug text-faint">
              These two share no measurement. Captures taken before the skin readings
              existed carry only symmetry.
            </p>
          </Card>
        ) : (
          <Card>
            <CardTitle>What moved</CardTitle>
            <div className="space-y-2">
              {deltas.map((d) => {
                const v = verdict(d);
                return (
                  <div key={d.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-bold">{d.label}</span>
                    <span className="flex shrink-0 items-baseline gap-2 tabular">
                      <span className="text-[0.68rem] text-faint">
                        {d.from}
                        {d.unit} → {d.to}
                        {d.unit}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-extrabold",
                          d.noise
                            ? "text-faint"
                            : v === "better"
                              ? "text-accent-text"
                              : v === "worse"
                                ? "text-danger"
                                : "text-muted",
                        )}
                      >
                        {d.noise
                          ? "—"
                          : `${d.delta > 0 ? "+" : ""}${d.delta}${d.unit}`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[0.65rem] leading-snug text-faint">
              A dash means the change is inside the measurement's noise floor. Metrics
              with no arrow — cheek width, shine — moved, but there is no evidence
              saying which direction is better.
            </p>
            {check.yawDelta != null && (
              <p className="mt-1.5 text-[0.65rem] leading-snug text-faint">
                Head angle differed by {check.yawDelta.toFixed(1)}° yaw
                {check.pitchDelta != null ? `, ${check.pitchDelta.toFixed(1)}° pitch` : ""}.
              </p>
            )}
          </Card>
        )}

        {picking && (
          <Card>
            <CardTitle>Choose the {picking === "left" ? "before" : "after"}</CardTitle>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {scans.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    if (picking === "left") setLeft(sc);
                    else setRight(sc);
                    setPicking(null);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
                >
                  <span className="text-sm font-bold">{KIND_LABEL[sc.kind] ?? sc.kind}</span>
                  <span className="text-[0.7rem] text-faint">{sc.date}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Side({
  scan, label, onPick,
}: {
  scan: ScanRecord | null;
  label: string;
  onPick: () => void;
}) {
  const [image, setImage] = useState<string | null>(null);

  const id = scan?.id;
  useEffect(() => {
    let alive = true;
    setImage(null);
    if (!id) return;
    void loadScanImage(id).then((url) => {
      if (alive) setImage(url);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <button
      type="button"
      onClick={onPick}
      className="overflow-hidden rounded-2xl border border-border bg-surface text-left"
    >
      <div className="aspect-[3/4] w-full bg-surface-2">
        {image ? (
          <img src={image} alt={`${label} capture`} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-[0.65rem] text-faint">
            {scan ? "Loading…" : "Tap to pick"}
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="text-[0.58rem] font-bold uppercase tracking-wider text-faint">{label}</div>
        <div className="truncate text-xs font-bold">
          {scan ? `${KIND_LABEL[scan.kind] ?? scan.kind} · ${scan.date}` : "—"}
        </div>
      </div>
    </button>
  );
}
