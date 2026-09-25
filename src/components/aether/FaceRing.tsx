import { VIEW_ASPECT, type FaceSquare } from "@/lib/aether/assist";

const TICKS = 60;
const YELLOW = "#ffd60a";
const GREEN = "#30d158";
/** Where the tracker rests when there is no face: centre, a little high. */
const IDLE: FaceSquare = { cx: 0.5, cy: 0.44, side: 0.5 };
/** The ring's box is this much bigger than the face square. */
const RING = 1.42;

const CUE_ANGLE = { up: -90, right: 0, down: 90, left: 180 } as const;

/**
 * The capture tracker: a yellow square that follows the face, as the iPhone
 * camera draws one, inside a Face ID-style ring of ticks.
 *
 * - Ticks toward a correction light yellow: the side to turn to, or the top /
 *   bottom for chin up / down.
 * - Ticks fill green clockwise from the top as the hold and the burst run.
 * - Everything turns green once the frame is on target.
 */
export function FaceRing({
  square,
  ready,
  progress,
  cue,
}: {
  square: FaceSquare | null;
  ready: boolean;
  /** 0–1: hold, then burst. */
  progress: number;
  cue: keyof typeof CUE_ANGLE | null;
}) {
  const sq = square ?? IDLE;
  const box = sq.side * RING;
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * TICKS);
  const stroke = !square ? "rgba(255,255,255,.55)" : ready ? GREEN : YELLOW;
  // The square's half-width inside a -50..50 box.
  const half = 50 / RING;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute transition-[left,top,width,height] duration-150 ease-linear"
      style={{
        left: `${(sq.cx - box / 2) * 100}%`,
        top: `${(sq.cy - (box * VIEW_ASPECT) / 2) * 100}%`,
        width: `${box * 100}%`,
        height: `${box * VIEW_ASPECT * 100}%`,
      }}
    >
      <svg viewBox="-50 -50 100 100" className="size-full overflow-visible">
        {Array.from({ length: TICKS }, (_, i) => {
          const deg = -90 + (i * 360) / TICKS;
          const a = (deg * Math.PI) / 180;
          let color = "rgba(255,255,255,.32)";
          if (i < filled || ready) color = GREEN;
          else if (cue) {
            const d = Math.abs(((deg - CUE_ANGLE[cue] + 540) % 360) - 180);
            if (d <= 40) color = YELLOW;
          }
          return (
            <line
              key={i}
              x1={Math.cos(a) * 44.5}
              y1={Math.sin(a) * 44.5}
              x2={Math.cos(a) * 49}
              y2={Math.sin(a) * 49}
              stroke={color}
              strokeWidth={1.6}
              strokeLinecap="round"
              style={{ transition: "stroke 120ms" }}
            />
          );
        })}
        <rect
          x={-half}
          y={-half}
          width={half * 2}
          height={half * 2}
          // Round enough that the corners stay inside the ring of ticks.
          rx={13}
          fill="none"
          stroke={stroke}
          strokeWidth={1.1}
          strokeDasharray={square ? undefined : "3 3"}
          style={{ transition: "stroke 150ms" }}
        />
      </svg>
    </div>
  );
}
