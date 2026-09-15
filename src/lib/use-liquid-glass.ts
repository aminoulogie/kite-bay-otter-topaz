import { useEffect } from "react";

// ==========================================================================
// Liquid Glass tilt parallax.
//
// Publishes two eased numbers, --glass-tx and --glass-ty (each -1..1), on the
// root element. glass.css samples them for the ambient backdrop and its light
// spots, so the whole parallax is two composited translate3d moves per frame
// and nothing else. On a pointer device the source is the cursor position;
// on a phone it is the device orientation, so the glass shifts as the hand
// tilts the phone — the effect Apple's Liquid Glass gets from its gyro.
//
// Everything runs on one requestAnimationFrame loop that only spins while a
// target is moving toward: the loop lerps the current value toward the target
// (9% of the remaining distance per frame), which is what makes the movement
// read as glass settling rather than a cursor being tracked 1:1. When the
// values settle the loop parks, so a stationary phone costs zero frames.
//
// Deliberately absent: any DOM reads inside the loop. The targets come from
// event objects; the writes are two style properties on the root. A loop that
// reads layout would put the main thread on the 120fps critical path, which
// is exactly what this file exists to avoid.
//
// Reduced motion: the whole hook is inert, and glass.css zeroes the vars so
// every consumer degrades to a static frame.
// ==========================================================================

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

type OrientableDeviceOrientationEvent = DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function useLiquidGlass() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let running = false;

    const frame = () => {
      // Lerp toward the target. 0.09 per frame is ~1/4 of the way gone after
      // three frames, fully settled after roughly thirty — a soft float with
      // no overshoot, which is what glass should do.
      x += (targetX - x) * 0.09;
      y += (targetY - y) * 0.09;
      const settled = Math.abs(targetX - x) < 0.001 && Math.abs(targetY - y) < 0.001;
      root.style.setProperty("--glass-tx", (settled ? targetX : x).toFixed(3));
      root.style.setProperty("--glass-ty", (settled ? targetY : y).toFixed(3));
      if (settled) {
        running = false;
      } else {
        raf = requestAnimationFrame(frame);
      }
    };

    const aim = (nx: number, ny: number) => {
      targetX = clamp(nx, -1, 1);
      targetY = clamp(ny, -1, 1);
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    const release = () => aim(0, 0);

    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const onPointerMove = (e: PointerEvent) => {
      aim(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
      );
    };
    // A pointer that leaves the window (not just one element) settles the
    // glass back to level rather than freezing it at the last edge.
    const onPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) release();
    };

    // Gamma is left/right tilt (about ±45°) and beta is front/back (about
    // ±60° with the phone roughly upright). The divisors map a comfortable
    // holding range onto the full -1..1 so the glass moves without the user
    // having to wave the phone around.
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      aim(clamp(e.gamma / 22.5, -1, 1), clamp((e.beta - 45) / 30, -1, 1));
    };

    const attachOrientation = () => {
      const Oriented = window.DeviceOrientationEvent as
        | (typeof DeviceOrientationEvent & {
            requestPermission?: OrientableDeviceOrientationEvent["requestPermission"];
          })
        | undefined;
      if (!Oriented) return;
      if (typeof Oriented.requestPermission === "function") {
        // iOS only grants orientation after a user gesture, so the first tap
        // on the app is what asks. Declined? The glass simply stays still —
        // it is a garnish, not a feature someone should be nagged about.
        const ask = () => {
          window.removeEventListener("pointerdown", ask);
          Oriented.requestPermission?.()
            .then((state) => {
              if (state === "granted") {
                window.addEventListener("deviceorientation", onOrientation);
              }
            })
            .catch(() => {
              /* permission declined — static glass */
            });
        };
        window.addEventListener("pointerdown", ask, { passive: true });
      } else {
        window.addEventListener("deviceorientation", onOrientation);
      }
    };

    if (finePointer) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerout", onPointerOut, { passive: true });
    } else {
      attachOrientation();
    }

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("deviceorientation", onOrientation);
      cancelAnimationFrame(raf);
      root.style.removeProperty("--glass-tx");
      root.style.removeProperty("--glass-ty");
    };
  }, []);
}
