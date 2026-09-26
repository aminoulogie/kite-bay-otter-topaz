import { useEffect, useId, useRef, useState } from "react";

/**
 * Concentric progress rings, drawn the way the watch draws them.
 *
 * - Each ring is a gradient, dimmed to a faint track where it is still owed.
 * - The leading end is a rounded cap with a soft shadow, so a ring that has
 *   gone past its goal visibly laps over itself instead of stopping flat.
 * - On first appearance the rings fill from empty, outer ring first, each a
 *   beat after the last — opening the app on a finished day shows it being
 *   finished. Reduced-motion settings skip straight to the end.
 */
export interface RingSpec {
  /** Share of the goal, 0 upwards; 1.4 is a full ring and 40% again. */
  f: number;
  from: string;
  to: string;
}

const DURATION = 1150;
const STAGGER = 110;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function reducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/** Grows 0 → 1 over the animation, per ring; 1 at once when animation is off. */
function useFill(count: number, animate: boolean, delay: number): number[] {
  const [t, setT] = useState(() => (animate && !reducedMotion() ? 0 : Infinity));
  const raf = useRef(0);
  useEffect(() => {
    if (!animate || reducedMotion()) {
      setT(Infinity);
      return;
    }
    const start = performance.now() + delay;
    const step = (now: number) => {
      const el = now - start;
      setT(el);
      if (el < DURATION + STAGGER * count) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // Once per mount: the fill is the arrival, not a reaction to every update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return Array.from({ length: count }, (_, i) => {
    if (!Number.isFinite(t)) return 1;
    return ease(Math.max(0, Math.min(1, (t - i * STAGGER) / DURATION)));
  });
}

export function RingSet({
  rings,
  px,
  animate = true,
  delay = 0,
  arrows = px >= 110,
  shadow = px >= 48,
  className,
}: {
  rings: RingSpec[];
  px: number;
  animate?: boolean;
  delay?: number;
  /** The small arrows at the start of each ring, as on the watch. */
  arrows?: boolean;
  shadow?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const fill = useFill(rings.length, animate, delay);
  const n = rings.length;
  // Stroke width and gap scale with the box so every size reads alike.
  const w = px / (n * 2 + 1.2 + (n - 1) * 0.28);
  const gap = w * 0.14;
  const c0 = px / 2;

  return (
    <svg
      viewBox={`0 0 ${px} ${px}`}
      width={px}
      height={px}
      className={className}
      aria-hidden
      style={{ overflow: "visible" }}
    >
      <defs>
        {rings.map((r, i) => (
          <linearGradient key={i} id={`${id}g${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={r.from} />
            <stop offset="100%" stopColor={r.to} />
          </linearGradient>
        ))}
        <filter id={`${id}s`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation={Math.max(0.6, w * 0.18)} floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
      {rings.map((r, i) => {
        const radius = c0 - w / 2 - i * (w + gap);
        if (radius <= w / 2) return null;
        const C = 2 * Math.PI * radius;
        const f = Math.max(0, r.f) * fill[i]!;
        const lap = Math.floor(f);
        const rest = f - lap;
        const grad = `url(#${id}g${i})`;
        // The end of the ring, for its cap and shadow.
        const a = (f % 1 === 0 && f > 0 ? 1 : f % 1) * 2 * Math.PI - Math.PI / 2;
        const ex = c0 + radius * Math.cos(a);
        const ey = c0 + radius * Math.sin(a);
        return (
          <g key={i}>
            {/* The track: the ring's own colour, faint. */}
            <circle cx={c0} cy={c0} r={radius} fill="none" stroke={r.from} strokeOpacity={0.2} strokeWidth={w} />
            {lap >= 1 && <circle cx={c0} cy={c0} r={radius} fill="none" stroke={grad} strokeWidth={w} />}
            {f > 0 && (rest > 0.0005 || lap === 0) && (
              <circle
                cx={c0}
                cy={c0}
                r={radius}
                fill="none"
                stroke={grad}
                strokeWidth={w}
                strokeLinecap="round"
                strokeDasharray={`${C * (lap >= 1 ? rest : f)} ${C}`}
                transform={`rotate(-90 ${c0} ${c0})`}
              />
            )}
            {/* The leading cap, lifted by a shadow so a lap reads as a lap. */}
            {shadow && f > 0.04 && (
              <circle cx={ex} cy={ey} r={w / 2} fill={r.to} filter={`url(#${id}s)`} />
            )}
            {arrows && <Arrow i={i} x={c0} y={c0 - radius} size={w * 0.62} />}
          </g>
        );
      })}
    </svg>
  );
}

/** →, », ↑ and a plus, at the top of each ring, in the dark of the ring's own colour. */
function Arrow({ i, x, y, size }: { i: number; x: number; y: number; size: number }) {
  const s = size / 2;
  const common = {
    fill: "none",
    stroke: "#000",
    strokeOpacity: 0.78,
    strokeWidth: Math.max(1.2, size * 0.16),
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (i === 0)
    return <path d={`M${x - s} ${y} H${x + s} M${x + s * 0.3} ${y - s * 0.7} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.7}`} {...common} />;
  if (i === 1)
    return (
      <path
        d={`M${x - s} ${y} H${x + s * 0.2} M${x - s * 0.3} ${y - s * 0.7} L${x + s * 0.4} ${y} L${x - s * 0.3} ${y + s * 0.7} M${x + s * 0.2} ${y - s * 0.7} L${x + s} ${y} L${x + s * 0.2} ${y + s * 0.7}`}
        {...common}
      />
    );
  if (i === 2)
    return <path d={`M${x} ${y + s} V${y - s} M${x - s * 0.7} ${y - s * 0.3} L${x} ${y - s} L${x + s * 0.7} ${y - s * 0.3}`} {...common} />;
  return <path d={`M${x - s * 0.8} ${y} H${x + s * 0.8} M${x} ${y - s * 0.8} V${y + s * 0.8}`} {...common} />;
}
