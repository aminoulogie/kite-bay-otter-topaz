import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cssMatrix, fitPlacement, gesture, type Placement } from "@/lib/aether/align";

/** The frame an imported photo is laid onto — the same 3:4 a capture keeps. */
export const ALIGN_W = 1080;
export const ALIGN_H = 1440;

/**
 * Lay an imported photo onto the capture guides before it is measured.
 *
 * Opens already aligned from the landmarks when a face was found; one finger
 * drags, two fingers pinch and turn, a mouse wheel zooms. "Use this" renders
 * exactly what is shown into a capture-sized frame, so the measurement sees
 * the photo the way the guides framed it.
 */
export function AlignSheet({
  img,
  auto,
  front,
  onCancel,
  onUse,
}: {
  img: HTMLImageElement;
  auto: Placement | null;
  /** Front step: draw the two eye marks, as the capture does. */
  front: boolean;
  onCancel: () => void;
  onUse: (frame: HTMLCanvasElement) => void;
}) {
  const fit = fitPlacement(img.naturalWidth, img.naturalHeight, ALIGN_W, ALIGN_H);
  const [p, setP] = useState<Placement>(auto ?? fit);
  const boxRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.3);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setK(el.getBoundingClientRect().width / ALIGN_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const local = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onMove = (e: React.PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    if (map.size === 1) {
      setP((cur) => gesture(cur, { x: 0, y: 0 }, (now.x - prev.x) / k, (now.y - prev.y) / k));
    } else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1];
      const pd = Math.hypot(prev.x - other.x, prev.y - other.y);
      const nd = Math.hypot(now.x - other.x, now.y - other.y);
      const pa = Math.atan2(prev.y - other.y, prev.x - other.x);
      const na = Math.atan2(now.y - other.y, now.x - other.x);
      const pm = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const nm = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
      if (pd > 4) {
        setP((cur) =>
          gesture(cur, { x: pm.x / k, y: pm.y / k }, (nm.x - pm.x) / k, (nm.y - pm.y) / k, nd / pd, na - pa),
        );
      }
    }
    map.set(e.pointerId, now);
  };

  const use = () => {
    const c = document.createElement("canvas");
    c.width = ALIGN_W;
    c.height = ALIGN_H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ALIGN_W, ALIGN_H);
    ctx.setTransform(p.a, p.b, -p.b, p.a, p.tx, p.ty);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    onUse(c);
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-bg px-4 pb-4 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="mb-2 text-sm font-extrabold">Line it up</div>
      <p className="mb-2 text-xs text-muted">
        Drag to move, pinch to size and turn. Eyes on the line, face inside the oval — the same
        framing a capture uses, so this photo compares with the ones you take here.
      </p>
      <div
        ref={boxRef}
        className="relative mx-auto aspect-[3/4] w-full max-w-sm touch-none overflow-hidden rounded-2xl border border-border bg-black"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          pointers.current.set(e.pointerId, local(e));
        }}
        onPointerMove={onMove}
        onPointerUp={(e) => pointers.current.delete(e.pointerId)}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onWheel={(e) => {
          const at = local(e as unknown as React.PointerEvent);
          const ds = Math.exp(-e.deltaY * 0.0015);
          setP((cur) => gesture(cur, { x: at.x / k, y: at.y / k }, 0, 0, ds, 0));
        }}
      >
        <img
          src={img.src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
          style={{ transformOrigin: "0 0", transform: cssMatrix(p, k), width: img.naturalWidth, height: img.naturalHeight }}
        />
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(255,255,255,.35)" strokeWidth="0.25" />
          <line x1="6" y1="40" x2="94" y2="40" stroke="rgba(10,132,255,.8)" strokeWidth="0.3" />
          <ellipse cx="50" cy="48" rx="28" ry="36" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="0.3" />
          {front && (
            <>
              <ellipse cx="38" cy="40" rx="9" ry="6" fill="none" stroke="rgba(10,132,255,.85)" strokeWidth="0.4" />
              <ellipse cx="62" cy="40" rx="9" ry="6" fill="none" stroke="rgba(10,132,255,.85)" strokeWidth="0.4" />
            </>
          )}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button disabled={!auto} onClick={() => auto && setP(auto)}>
          {auto ? "Auto-align" : "No face to align on"}
        </Button>
        <Button onClick={() => setP(fit)}>Fit whole photo</Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={use}>
          Use this
        </Button>
      </div>
    </div>
  );
}
