import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import {
  axisForGesture, isFullyZoomedOut, panDomain, pinchDistance, pixelToValue,
  zoomDomain, type Domain,
} from "@/lib/chart-zoom";
import { cn } from "@/lib/utils";

/**
 * Pinch to zoom, drag to pan, double-tap to reset.
 *
 * Wraps a chart rather than being one, so the same gestures work for the
 * exercise chart, the micro-muscle chart and the nutrition chart without three
 * implementations that drift apart.
 *
 * touchAction is "none" on the plot, because the browser will otherwise claim
 * a two-finger gesture for page zoom before the handlers ever see it. That
 * means this element is responsible for its own scrolling — which is fine, as
 * a chart has nothing to scroll.
 */

export interface ZoomState {
  x: Domain;
  y: Domain;
}

export function useChartZoom(fullX: Domain, fullY: Domain) {
  const [state, setState] = useState<ZoomState>({ x: fullX, y: fullY });

  // Re-anchor when the underlying data changes — switching exercise or range
  // otherwise leaves the view framed on a window that no longer exists.
  useEffect(() => {
    setState({ x: fullX, y: fullY });
  }, [fullX.min, fullX.max, fullY.min, fullY.max]);

  const reset = useCallback(() => setState({ x: fullX, y: fullY }), [fullX, fullY]);
  const zoomed = !isFullyZoomedOut(state.x, fullX) || !isFullyZoomedOut(state.y, fullY);

  return { state, setState, reset, zoomed };
}

export function ZoomableChart({
  children,
  fullX,
  fullY,
  state,
  setState,
  reset,
  zoomed,
  className,
}: {
  children: React.ReactNode;
  fullX: Domain;
  fullY: Domain;
  state: ZoomState;
  setState: (s: ZoomState) => void;
  reset: () => void;
  zoomed: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ dist: number; axis: "x" | "y" | "both"; ax: number; ay: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  const rect = () => box.current?.getBoundingClientRect();

  const onTouchStart = (e: React.TouchEvent) => {
    const r = rect();
    if (!r) return;

    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const axis = axisForGesture(b.clientX - a.clientX, b.clientY - a.clientY);
      pinch.current = {
        dist: pinchDistance(a, b),
        axis,
        // Anchor at the midpoint between the fingers, in data units.
        ax: pixelToValue((a.clientX + b.clientX) / 2, r.left, r.width, state.x),
        ay: pixelToValue((a.clientY + b.clientY) / 2, r.top, r.height, state.y, true),
      };
      drag.current = null;
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      drag.current = { x: t.clientX, y: t.clientY };

      // Double-tap resets. Cheaper than a visible control that would sit on
      // top of the data it is meant to reveal.
      const now = Date.now();
      if (now - lastTap.current < 280) {
        reset();
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const r = rect();
    if (!r) return;

    if (e.touches.length === 2 && pinch.current) {
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const dist = pinchDistance(a, b);
      if (dist <= 0 || pinch.current.dist <= 0) return;
      // Spreading fingers increases distance, which must SHRINK the span.
      const factor = pinch.current.dist / dist;
      const { axis, ax, ay } = pinch.current;

      setState({
        x: axis === "y" ? state.x : zoomDomain(state.x, fullX, factor, ax),
        y: axis === "x" ? state.y : zoomDomain(state.y, fullY, factor, ay),
      });
      pinch.current = { ...pinch.current, dist };
      return;
    }

    if (e.touches.length === 1 && drag.current) {
      const t = e.touches[0]!;
      const dxPx = t.clientX - drag.current.x;
      const dyPx = t.clientY - drag.current.y;
      drag.current = { x: t.clientX, y: t.clientY };

      // Dragging right should reveal EARLIER data, so the content follows the
      // finger rather than running away from it.
      const dxData = (-dxPx / r.width) * (state.x.max - state.x.min);
      const dyData = (dyPx / r.height) * (state.y.max - state.y.min);

      setState({
        x: panDomain(state.x, fullX, dxData),
        y: panDomain(state.y, fullY, dyData),
      });
    }
  };

  const onTouchEnd = () => {
    pinch.current = null;
    drag.current = null;
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={box}
        // The browser claims two-finger gestures for page zoom unless this is
        // set, and the handlers would never fire.
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="size-full"
      >
        {children}
      </div>

      {zoomed && (
        <button
          type="button"
          onClick={reset}
          aria-label="Reset chart zoom"
          className="soma-pop absolute right-1 top-1 flex items-center gap-1 rounded-lg border border-border bg-surface-2/90 px-2 py-1 text-[0.6rem] font-bold text-muted backdrop-blur"
        >
          <Maximize2 className="size-3" />
          Reset
        </button>
      )}
    </div>
  );
}
