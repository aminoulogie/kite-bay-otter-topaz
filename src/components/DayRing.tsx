import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEG_PER_HOUR, arcPath, arcs, blockAtHour, clockAt, formatHours, hourOfDay, polar,
  type Arc, type TimeBlock,
} from "@/lib/day-plan";
import {
  FLING_MIN, angleFrom, decay, deltaAngle, radiusFrom, velocityFrom, wrapAngle,
  type Sample,
} from "@/lib/ring-rotation";
import { cn } from "@/lib/utils";

/** The drawing is authored at this size and scaled by the viewBox. */
const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 150;
const R_INNER = 96;
const R_MID = (R_OUTER + R_INNER) / 2;

/** Touches nearer the middle than this belong to the centre, not the ring. */
const GRAB_INNER = 70;

/**
 * The day as a ring, seen from above.
 *
 * A full turn is 24 hours, so an hour is 15°. The ring rotates under a fixed
 * focus mark at the top: the mark never moves, the day moves beneath it, which
 * is what makes "what is at the top" a stable thing to read.
 *
 * Two decisions worth stating, because both are the opposite of the obvious:
 *
 * **The centre does not rotate.** Only the ring group carries the transform.
 * Spinning the readout with the ring would make the one thing you are trying
 * to read the one thing that will not hold still.
 *
 * **Labels counter-rotate.** Each segment's label is turned back by the ring's
 * own rotation so text stays upright at every angle. Text that follows the arc
 * is upside-down for half the day, which looks considered in a screenshot and
 * is unreadable in use.
 */
export function DayRing({
  blocks, dayStart = 0, selectedId, onSelect, className,
}: {
  blocks: TimeBlock[];
  dayStart?: number;
  selectedId?: string | null;
  onSelect?: (block: TimeBlock) => void;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(() => hourOfDay());

  const list = useMemo(() => arcs(blocks, dayStart), [blocks, dayStart]);

  // The clock hand, once a minute. Any faster is a redraw nobody can see.
  useEffect(() => {
    const id = setInterval(() => setNow(hourOfDay()), 60_000);
    return () => clearInterval(id);
  }, []);

  // --------------------------------------------------------------- drag --
  const drag = useRef<{ last: number; moved: number; samples: Sample[] } | null>(null);
  const fling = useRef(0);
  const raf = useRef(0);

  const centre = useCallback(() => {
    const el = svgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }, []);

  const settle = useCallback(() => {
    raf.current = requestAnimationFrame(function step() {
      fling.current = decay(fling.current);
      if (!fling.current) {
        raf.current = 0;
        return;
      }
      // Velocity is degrees per millisecond; a frame is about 16 of them.
      setRotation((r) => wrapAngle(r + fling.current * 16));
      raf.current = requestAnimationFrame(step);
    });
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const c = centre();
    if (!c) return;
    const dist = radiusFrom(c.x, c.y, e.clientX, e.clientY);
    // The middle of the ring is a readout, not a handle.
    if (dist < (GRAB_INNER / (SIZE / 2)) * c.r) return;

    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    fling.current = 0;

    const a = angleFrom(c.x, c.y, e.clientX, e.clientY);
    drag.current = { last: a, moved: 0, samples: [{ angle: a, t: e.timeStamp }] };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const c = centre();
    if (!d || !c) return;
    const a = angleFrom(c.x, c.y, e.clientX, e.clientY);
    const step = deltaAngle(d.last, a);
    d.last = a;
    d.moved += Math.abs(step);
    d.samples.push({ angle: a, t: e.timeStamp });
    if (d.samples.length > 12) d.samples.shift();
    setRotation((r) => wrapAngle(r + step));
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const v = velocityFrom(d.samples);
    if (Math.abs(v) >= FLING_MIN) {
      fling.current = v;
      settle();
    }
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  // Scroll and arrow keys turn it too — a drag is not available to everyone.
  const onWheel = (e: React.WheelEvent) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    fling.current = 0;
    setRotation((r) => wrapAngle(r + e.deltaY * 0.25));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? DEG_PER_HOUR * 3 : DEG_PER_HOUR;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      setRotation((r) => wrapAngle(r + step));
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      setRotation((r) => wrapAngle(r - step));
      e.preventDefault();
    }
  };

  // ------------------------------------------------------------ readout --
  // What sits under the focus mark. This is what the rotation is FOR.
  const focusHour = useMemo(
    () => (((-rotation / DEG_PER_HOUR) % 24) + 24 + dayStart) % 24,
    [rotation, dayStart],
  );
  const focused = useMemo(() => blockAtHour(list, focusHour), [list, focusHour]);

  return (
    <div className={cn("relative select-none", className)} data-no-swipe-nav>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full touch-none"
        role="group"
        tabIndex={0}
        aria-label={`Day ring. ${focused ? focused.block.label : "Nothing"} at ${clockAt(focusHour)}. Arrow keys turn it.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onKeyDown={onKey}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        {/* The track, so a day with a gap in it still reads as a ring. */}
        <circle
          cx={CX} cy={CY} r={R_MID}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={R_OUTER - R_INNER}
        />

        <g
          transform={`rotate(${rotation} ${CX} ${CY})`}
          style={{ transition: dragging || fling.current ? "none" : "transform 260ms cubic-bezier(.2,.8,.2,1)" }}
        >
          {list.map((a) => (
            <Segment
              key={a.block.id}
              arc={a}
              rotation={rotation}
              selected={selectedId === a.block.id}
              onPick={() => onSelect?.(a.block)}
            />
          ))}

          {/* Hour ticks, on top of the arcs so a boundary never hides one. */}
          {Array.from({ length: 24 }, (_, h) => {
            const major = h % 6 === 0;
            const deg = h * DEG_PER_HOUR;
            const p1 = polar(CX, CY, R_OUTER - (major ? 12 : 6), deg);
            const p2 = polar(CX, CY, R_OUTER, deg);
            return (
              <line
                key={h}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="var(--color-bg)"
                strokeOpacity={major ? 0.85 : 0.4}
                strokeWidth={major ? 2 : 1}
              />
            );
          })}

          {/* Where the clock actually is. Drawn inside the rotating group so it
              stays pinned to its hour as the day turns under the mark. */}
          <g transform={`rotate(${(now - dayStart) * DEG_PER_HOUR} ${CX} ${CY})`}>
            <line
              x1={CX} y1={CY - R_INNER + 4} x2={CX} y2={CY - R_OUTER - 4}
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={CX} cy={CY - R_OUTER - 7} r={3.5} fill="var(--color-accent)" />
          </g>
        </g>

        {/* The focus mark. Outside the rotating group, so it holds still. */}
        <polygon
          points={`${CX - 8},${CY - R_OUTER - 12} ${CX + 8},${CY - R_OUTER - 12} ${CX},${CY - R_OUTER + 2}`}
          fill="var(--color-fg)"
        />
      </svg>

      {/* The readout. Also outside the SVG's rotation, and never turned: the
          one thing you are reading must not be the one thing that moves. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="max-w-[44%] text-center">
          <div className="font-display text-[0.6rem] font-bold uppercase tracking-[0.14em] text-faint">
            {clockAt(focusHour)}
          </div>
          {focused ? (
            <>
              <div className="mt-1 truncate font-display text-lg font-extrabold leading-tight">
                {focused.block.label}
              </div>
              <div className="mt-0.5 text-xs font-bold tabular text-muted">
                {formatHours(focused.block.hours)}
              </div>
              <div className="mt-1 text-[0.58rem] font-bold uppercase tracking-wider text-faint">
                {focused.block.fixed ? "fixed" : "flexible"}
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs text-faint">Nothing planned</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Segment({
  arc, rotation, selected, onPick,
}: {
  arc: Arc;
  rotation: number;
  selected: boolean;
  onPick: () => void;
}) {
  const { block, startAngle, endAngle } = arc;
  const sweep = endAngle - startAngle;
  const mid = startAngle + sweep / 2;
  const at = polar(CX, CY, R_MID, mid);

  return (
    <g>
      <path
        d={arcPath(CX, CY, R_OUTER, R_INNER, startAngle, endAngle)}
        fill={block.color}
        fillOpacity={block.fixed ? 1 : 0.55}
        stroke={selected ? "var(--color-fg)" : "var(--color-bg)"}
        strokeWidth={selected ? 3 : 1.5}
        strokeLinejoin="round"
        // Flexible blocks are dashed as well as paler: colour alone is not a
        // distinction everyone can see.
        strokeDasharray={block.fixed ? undefined : "5 3"}
        onPointerUp={(e) => {
          e.stopPropagation();
          onPick();
        }}
        style={{ cursor: "pointer" }}
      />
      {/* Counter-rotated so it is upright wherever the ring has been turned to.
          Text that follows the arc is upside-down for half the day. */}
      {sweep >= 22 && (
        <text
          x={at.x}
          y={at.y}
          transform={`rotate(${-rotation} ${at.x} ${at.y})`}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={700}
          fill="#fff"
          style={{ paintOrder: "stroke", pointerEvents: "none" }}
          stroke="#0007"
          strokeWidth={2.5}
        >
          {block.label}
        </text>
      )}
    </g>
  );
}
