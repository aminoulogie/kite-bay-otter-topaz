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
const SIZE = 340;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 150;
const R_INNER = 110;
const R_MID = (R_OUTER + R_INNER) / 2;

/** Corner rounding, applied as a same-colour stroke around each segment. */
const ROUND = 5;

/** Breathing room between neighbouring segments, in degrees. */
const GAP_DEG = 1.1;

/** How far a flexible block is inset from the full band on each side. */
const FLEX_INSET = 7;

/** The dial face in the middle, which is a readout rather than a handle. */
const R_DIAL = R_INNER - 8;
const GRAB_INNER = 92;

/** A press that turns the ring less than this was meant as a tap. */
const TAP_SLOP_DEG = 4;

/** Below this a segment is too narrow to hold its own name. */
const LABEL_MIN_SWEEP = 26;
const LABEL_SIZE = 9.5;
const LABEL_TRACK = 0.9;

/** Rough advance of one uppercase glyph at the label's size and tracking. */
const LABEL_CHAR = LABEL_SIZE * 0.62 + LABEL_TRACK;

/** As much of a name as fits the arc it sits on, cut with an ellipsis. */
function fitLabel(text: string, room: number): string {
  const max = Math.floor(room / LABEL_CHAR);
  if (max < 3) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}\u2026`;
}

/**
 * The day as a ring, seen from above.
 *
 * A full turn is 24 hours, so an hour is 15°. The ring rotates under a fixed
 * focus mark at the top: the mark never moves, the day moves beneath it, which
 * is what makes "what is at the top" a stable thing to read.
 *
 * Four decisions worth stating, because each is the opposite of the obvious:
 *
 * **The centre does not rotate.** Only the ring group carries the transform.
 * Spinning the readout with the ring would make the one thing you are trying
 * to read the one thing that will not hold still.
 *
 * **Labels follow the arc, and flip rather than invert.** Text laid out
 * horizontally inside a ring crosses the band radially at three and nine
 * o'clock and spills out of it; text that follows the arc without flipping is
 * upside-down for half the day. Each label is therefore turned along its own
 * arc and rotated a further half-turn whenever it has travelled into the lower
 * half of the ring, so it stays inside the band AND stays the right way up.
 *
 * **Fixed and flexible differ in THICKNESS, not just colour.** A pinned block
 * fills the whole band; a flexible one is a slimmer bar inside the same track.
 * That is a difference you can see at a glance, in greyscale, and from across
 * the room — which dashes and half-opacity are not.
 *
 * **The hour ticks sit in the foreground colour, not the background.** Drawn in
 * the background they vanish wherever the ring has a gap and survive only over
 * the pale fills, so they appear at apparently random hours.
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
  const drag = useRef<
    { last: number; moved: number; at: number; radius: number; samples: Sample[] } | null
  >(null);
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
    drag.current = { last: a, moved: 0, at: a, radius: dist / c.r, samples: [{ angle: a, t: e.timeStamp }] };
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

    // A tap picks the block under the finger. This has to be decided here and
    // not on the segment itself: the pointer was captured on the svg at press
    // time, so every later pointer event is retargeted to the svg and a handler
    // on the arc would simply never run.
    if (d.moved < TAP_SLOP_DEG && d.radius <= (R_OUTER + 8) / (SIZE / 2)) {
      const hour = (((d.at - rotation) / DEG_PER_HOUR) % 24 + 24 + dayStart) % 24;
      const hit = blockAtHour(list, hour);
      if (hit) onSelect?.(hit.block);
      return;
    }

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
        className="w-full touch-none rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
        {/* The groove. It shows through the gaps between segments and behind
            the slimmer flexible bars, so the ring reads as one track that is
            filled to different depths rather than as four loose arcs. */}
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
            />
          ))}

          {/* Hour ticks, on top of the arcs so a boundary never hides one, and
              in the foreground colour so they read on a fill, on the groove and
              on the background alike. */}
          {Array.from({ length: 24 }, (_, h) => {
            const midnight = h === 0;
            const major = h % 6 === 0;
            const deg = h * DEG_PER_HOUR;
            const reach = midnight ? 11 : major ? 9 : 5;
            const p1 = polar(CX, CY, R_OUTER - reach, deg);
            const p2 = polar(CX, CY, R_OUTER + (major && !midnight ? 4 : 0), deg);
            return (
              <line
                key={h}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="var(--color-fg)"
                strokeOpacity={midnight ? 0.8 : major ? 0.5 : 0.22}
                strokeWidth={midnight ? 2 : major ? 1.5 : 1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Where the clock actually is: a bead across the band, not a needle
              sticking out of it. Drawn inside the rotating group so it stays
              pinned to its hour as the day turns under the mark. */}
          <g transform={`rotate(${(now - dayStart) * DEG_PER_HOUR} ${CX} ${CY})`}>
            <line
              x1={CX} y1={CY - R_INNER - 5} x2={CX} y2={CY - R_OUTER + 5}
              stroke="var(--color-accent)"
              strokeOpacity={0.25}
              strokeWidth={7}
              strokeLinecap="round"
            />
            <line
              x1={CX} y1={CY - R_INNER - 3} x2={CX} y2={CY - R_OUTER + 3}
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* The dial face. Opaque, so a segment can never crowd the readout. */}
        <circle
          cx={CX} cy={CY} r={R_DIAL}
          fill="var(--color-bg)"
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* The focus mark. Outside the rotating group, so it holds still. */}
        <polygon
          points={`${CX - 7},${CY - R_OUTER - 14} ${CX + 7},${CY - R_OUTER - 14} ${CX},${CY - R_OUTER - 1}`}
          fill="var(--color-fg)"
        />
      </svg>

      {/* The readout. Also outside the SVG's rotation, and never turned: the
          one thing you are reading must not be the one thing that moves. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="max-w-[46%] text-center">
          <div className="font-display text-[0.62rem] font-bold uppercase tracking-[0.16em] text-faint tabular">
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
              <div
                className={cn(
                  "mx-auto mt-1.5 w-fit rounded-full px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider",
                  focused.block.fixed
                    ? "bg-surface-2 text-muted"
                    : "border border-border text-faint",
                )}
              >
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
  arc, rotation, selected,
}: {
  arc: Arc;
  rotation: number;
  selected: boolean;
}) {
  const { block, startAngle, endAngle } = arc;
  const sweep = endAngle - startAngle;

  // A gap between neighbours, taken out of both ends — but never so much that
  // a short block is eaten by its own spacing.
  const gap = Math.min(GAP_DEG, sweep * 0.18);
  const from = startAngle + gap;
  const to = endAngle - gap;

  // Flexible blocks are a slimmer bar in the same groove. The rounding stroke
  // adds half its width on every side, so the drawn radii come in by that much
  // and the visible band lands exactly where it is meant to.
  const inset = block.fixed ? 0 : FLEX_INSET;
  const rOuter = R_OUTER - inset - ROUND / 2;
  const rInner = R_INNER + inset + ROUND / 2;

  const mid = startAngle + sweep / 2;
  const rLabel = (rOuter + rInner) / 2;
  const at = polar(CX, CY, rLabel, mid);

  // Along the arc, and the right way up. `mid` alone lays the text tangentially
  // once the group's own rotation is applied; the half-turn is what keeps it
  // from reading upside-down through the bottom half of the ring.
  const screen = wrapAngle(mid + rotation);
  const spin = mid + (screen > 90 && screen < 270 ? 180 : 0);

  // A name longer than its own arc is cut rather than allowed to run out of
  // the segment and over its neighbours.
  const room = rLabel * ((sweep * Math.PI) / 180) * 0.88;
  const label = fitLabel(block.label.toUpperCase(), room);

  return (
    <g>
      <path
        d={arcPath(CX, CY, rOuter, rInner, from, to)}
        fill={block.color}
        fillOpacity={block.fixed ? 1 : 0.8}
        // The stroke is the same colour as the fill: it exists to round the
        // corners, not to outline the shape. When the block is selected it
        // becomes the outline as well.
        stroke={selected ? "var(--color-fg)" : block.color}
        strokeOpacity={selected ? 1 : block.fixed ? 1 : 0.8}
        strokeWidth={ROUND}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ cursor: "pointer" }}
      />
      {/* Counter-rotated so it is upright wherever the ring has been turned to.
          Text that follows the arc is upside-down for half the day. */}
      {sweep >= LABEL_MIN_SWEEP && label && (
        <text
          x={at.x}
          y={at.y}
          transform={`rotate(${spin} ${at.x} ${at.y})`}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={LABEL_SIZE}
          fontWeight={800}
          letterSpacing={LABEL_TRACK}
          fill="#fff"
          style={{ paintOrder: "stroke", pointerEvents: "none" }}
          stroke="#00000040"
          strokeWidth={1.4}
        >
          {label}
        </text>
      )}
    </g>
  );
}
