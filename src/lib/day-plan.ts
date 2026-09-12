/**
 * The twenty-four hours, and what is in them.
 *
 * A day plan is a ring, not a list, and that changes the rules. A list can be
 * any length; a ring is always exactly full. So the one invariant everything
 * here exists to hold is: **the blocks always sum to 24 hours.** Not "should",
 * not "after you press save" — at every moment, after every edit.
 *
 * That invariant needs somewhere to give, which is what the fixed/variable
 * split is for. Sleep is eight hours whatever else happens to the day; the
 * free time around it is what absorbs the change. Move an hour into training
 * and it comes out of free time, because there is nowhere else it can come
 * from. A planner that let you allocate 26 hours would be a to-do list wearing
 * a clock face.
 *
 * The honest failure case is deliberately NOT hidden: if the fixed blocks
 * alone exceed 24 hours, that is a plan that cannot exist, and this reports it
 * rather than silently shaving an hour off someone's sleep to make the numbers
 * work.
 */

export const DAY_HOURS = 24;

/** Below this an arc is thinner than its own border and cannot be tapped. */
export const MIN_BLOCK_HOURS = 0.25;

/** Rounding floor. Quarter-hours are what people actually plan in. */
export const STEP_HOURS = 0.25;

export interface TimeBlock {
  id: string;
  label: string;
  /** Duration. Always positive; the sum across the plan is always 24. */
  hours: number;
  color: string;
  /**
   * Fixed blocks keep their duration through every edit to another block.
   * Variable blocks share whatever is left over.
   */
  fixed: boolean;
}

/** Quarter-hour grid, and never a negative. */
export function snap(hours: number): number {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / STEP_HOURS) * STEP_HOURS;
}

/** Sum, rounded away from binary-float dust so 24.000000000000004 reads as 24. */
export function totalHours(blocks: TimeBlock[]): number {
  const sum = (blocks ?? []).reduce((a, b) => a + (Number(b.hours) || 0), 0);
  return Math.round(sum * 1000) / 1000;
}

export function fixedHours(blocks: TimeBlock[]): number {
  return totalHours((blocks ?? []).filter((b) => b.fixed));
}

export interface PlanState {
  blocks: TimeBlock[];
  /** Hours the variable blocks share. Negative means the plan is impossible. */
  free: number;
  /** True when the fixed blocks alone are more than a day. */
  over: boolean;
}

/**
 * Force the invariant, and say when it cannot be forced.
 *
 * The remainder is distributed across the variable blocks in proportion to the
 * sizes they already have, so a day with two free blocks in a 3:1 ratio keeps
 * that ratio as the leftover grows and shrinks. Proportional rather than
 * equal: the ratio is a decision the user made, and an edit somewhere else in
 * the day is no reason to overwrite it.
 *
 * With no variable block at all there is nowhere for a remainder to go, so one
 * is created rather than leaving a plan that does not add up.
 */
export function normalise(input: TimeBlock[]): PlanState {
  const blocks = (input ?? []).map((b) => ({ ...b, hours: snap(b.hours) }));
  const fixed = blocks.filter((b) => b.fixed);
  const variable = blocks.filter((b) => !b.fixed);

  const usedByFixed = totalHours(fixed);
  const free = Math.round((DAY_HOURS - usedByFixed) * 1000) / 1000;

  if (free < 0) {
    // Over-committed. Reported, never silently corrected: shaving the excess
    // off a fixed block would quietly rewrite something the user pinned.
    return { blocks, free, over: true };
  }

  if (!variable.length) {
    return {
      blocks: free > 0 ? [...blocks, freeBlock(free)] : blocks,
      free,
      over: false,
    };
  }

  const varTotal = totalHours(variable);
  const scaled = variable.map((b) => ({
    ...b,
    hours: varTotal > 0 ? snap((b.hours / varTotal) * free) : 0,
  }));

  // Snapping each share independently loses or gains a few minutes against the
  // total. The drift lands on the largest variable block, where a quarter hour
  // is least noticeable — spreading it would put rounding dust everywhere.
  const drift = Math.round((free - totalHours(scaled)) * 1000) / 1000;
  if (drift !== 0 && scaled.length) {
    let biggest = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i]!.hours > scaled[biggest]!.hours) biggest = i;
    }
    scaled[biggest] = {
      ...scaled[biggest]!,
      hours: Math.max(0, Math.round((scaled[biggest]!.hours + drift) * 1000) / 1000),
    };
  }

  // Variable blocks squeezed to nothing are dropped rather than left as
  // untappable slivers. A fixed block at zero is kept: the user pinned it, and
  // it comes back the moment something else shrinks.
  const kept = scaled.filter((b) => b.hours >= MIN_BLOCK_HOURS);
  const lost = totalHours(scaled) - totalHours(kept);
  if (lost > 0 && kept.length) {
    kept[0] = { ...kept[0]!, hours: Math.round((kept[0]!.hours + lost) * 1000) / 1000 };
  }

  const out: TimeBlock[] = [];
  for (const b of blocks) {
    if (b.fixed) out.push(b);
    else {
      const match = kept.find((k) => k.id === b.id);
      if (match) out.push(match);
    }
  }
  if (!out.some((b) => !b.fixed) && free >= MIN_BLOCK_HOURS) out.push(freeBlock(free));

  return { blocks: out, free, over: false };
}

let seq = 0;
export function newBlockId(): string {
  seq += 1;
  return `tb-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export const FREE_COLOR = "#35c9a8";

function freeBlock(hours: number): TimeBlock {
  return { id: newBlockId(), label: "Free", hours: snap(hours), color: FREE_COLOR, fixed: false };
}

/**
 * Change one block's duration.
 *
 * A FIXED block takes the hours it was given and the variable blocks re-absorb
 * around it. A VARIABLE block is clamped to what is actually available, so
 * dragging a free block past the end of the day stops at the end of the day
 * rather than pushing the total to 26.
 */
export function setHours(blocks: TimeBlock[], id: string, hours: number): TimeBlock[] {
  const target = (blocks ?? []).find((b) => b.id === id);
  if (!target) return blocks ?? [];
  const want = Math.max(0, snap(hours));

  if (target.fixed) {
    const otherFixed = fixedHours(blocks.filter((b) => b.id !== id));
    const capped = Math.min(want, DAY_HOURS - otherFixed);
    return normalise(
      blocks.map((b) => (b.id === id ? { ...b, hours: Math.max(0, capped) } : b)),
    ).blocks;
  }

  // Variable: take the difference out of the OTHER variable blocks, largest
  // first, so growing one free block visibly eats the ones beside it instead
  // of silently rescaling every block in the ring.
  const siblings = blocks.filter((b) => !b.fixed && b.id !== id);
  const pool = totalHours(siblings);
  const available = Math.round((target.hours + pool) * 1000) / 1000;
  const capped = Math.min(want, available);
  let debt = Math.round((capped - target.hours) * 1000) / 1000;

  const order = [...siblings].sort((a, b) => b.hours - a.hours);
  const adjusted = new Map<string, number>();
  for (const s of order) {
    if (debt === 0) break;
    if (debt > 0) {
      const take = Math.min(s.hours, debt);
      adjusted.set(s.id, Math.round((s.hours - take) * 1000) / 1000);
      debt = Math.round((debt - take) * 1000) / 1000;
    } else {
      adjusted.set(s.id, Math.round((s.hours - debt) * 1000) / 1000);
      debt = 0;
    }
  }

  return normalise(
    blocks.map((b) => {
      if (b.id === id) return { ...b, hours: capped };
      const next = adjusted.get(b.id);
      return next === undefined ? b : { ...b, hours: next };
    }),
  ).blocks;
}

/** Add a block. A fixed one takes its hours from free time; a variable one splits it. */
export function addBlock(
  blocks: TimeBlock[],
  block: Omit<TimeBlock, "id"> & { id?: string },
): TimeBlock[] {
  const withId: TimeBlock = { ...block, id: block.id ?? newBlockId(), hours: snap(block.hours) };
  return normalise([...(blocks ?? []), withId]).blocks;
}

export function removeBlock(blocks: TimeBlock[], id: string): TimeBlock[] {
  const next = (blocks ?? []).filter((b) => b.id !== id);
  // Deleting a fixed block hands its hours back to free time, which is what
  // normalise does on its own once the block is gone.
  return normalise(next).blocks;
}

export function patchBlock(
  blocks: TimeBlock[],
  id: string,
  patch: Partial<Omit<TimeBlock, "id">>,
): TimeBlock[] {
  const next = (blocks ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b));
  // Pinning a block keeps the hours it already had; releasing one hands them
  // to the pool. Either way the ring still has to add up.
  return normalise(next).blocks;
}

/** Split a variable block in two, giving the new half the share asked for. */
export function splitBlock(
  blocks: TimeBlock[],
  id: string,
  label: string,
  hours: number,
  color: string,
): TimeBlock[] {
  const target = (blocks ?? []).find((b) => b.id === id);
  if (!target || target.fixed) return blocks ?? [];
  const take = Math.min(snap(hours), target.hours - MIN_BLOCK_HOURS);
  if (take < MIN_BLOCK_HOURS) return blocks ?? [];

  const out: TimeBlock[] = [];
  for (const b of blocks) {
    if (b.id !== id) {
      out.push(b);
      continue;
    }
    out.push({ ...b, hours: Math.round((b.hours - take) * 1000) / 1000 });
    out.push({ id: newBlockId(), label, hours: take, color, fixed: false });
  }
  return normalise(out).blocks;
}

// ------------------------------------------------------------- geometry --

export interface Arc {
  block: TimeBlock;
  /** Hours from midnight where this block begins. */
  startHour: number;
  endHour: number;
  /** Degrees clockwise from the top of the ring. */
  startAngle: number;
  endAngle: number;
}

export const DEG_PER_HOUR = 360 / DAY_HOURS;

/**
 * Where each block sits on the ring.
 *
 * Laid out in array order from midnight. Order is the plan's shape — sleep
 * then work then the evening — so it is carried by the array rather than
 * stored per block, which would let the two disagree.
 */
export function arcs(blocks: TimeBlock[], dayStart = 0): Arc[] {
  const out: Arc[] = [];
  let cursor = ((Number(dayStart) || 0) % DAY_HOURS + DAY_HOURS) % DAY_HOURS;
  for (const block of blocks ?? []) {
    const hours = Number(block.hours) || 0;
    if (hours <= 0) continue;
    const startHour = cursor;
    const endHour = cursor + hours;
    out.push({
      block,
      startHour,
      endHour,
      startAngle: startHour * DEG_PER_HOUR,
      endAngle: endHour * DEG_PER_HOUR,
    });
    cursor = endHour;
  }
  return out;
}

/** Which block covers a given hour of the day, or null. */
export function blockAtHour(list: Arc[], hour: number): Arc | null {
  const h = ((Number(hour) || 0) % DAY_HOURS + DAY_HOURS) % DAY_HOURS;
  for (const a of list) {
    const start = a.startHour % DAY_HOURS;
    const end = start + (a.endHour - a.startHour);
    if (h >= start && h < end) return a;
    // An arc crossing midnight is two ranges on the clock face.
    if (end > DAY_HOURS && h < end - DAY_HOURS) return a;
  }
  return null;
}

/** A point on a circle, with 0° at the top and angles running clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * An SVG path for one ring segment.
 *
 * A full-circle arc is the case that silently breaks: start and end land on
 * the same point and the renderer draws nothing at all, so a single block
 * filling the whole day would vanish. It is drawn as two half arcs instead.
 */
export function arcPath(
  cx: number, cy: number, rOuter: number, rInner: number,
  startDeg: number, endDeg: number,
): string {
  const sweep = endDeg - startDeg;
  if (sweep <= 0) return "";

  if (sweep >= 359.999) {
    const mid = startDeg + 180;
    const a = polar(cx, cy, rOuter, startDeg);
    const b = polar(cx, cy, rOuter, mid);
    const c = polar(cx, cy, rInner, mid);
    const d = polar(cx, cy, rInner, startDeg);
    return [
      `M ${a.x} ${a.y}`,
      `A ${rOuter} ${rOuter} 0 0 1 ${b.x} ${b.y}`,
      `A ${rOuter} ${rOuter} 0 0 1 ${a.x} ${a.y}`,
      `L ${d.x} ${d.y}`,
      `A ${rInner} ${rInner} 0 0 0 ${c.x} ${c.y}`,
      `A ${rInner} ${rInner} 0 0 0 ${d.x} ${d.y}`,
      "Z",
    ].join(" ");
  }

  const large = sweep > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, startDeg);
  const o2 = polar(cx, cy, rOuter, endDeg);
  const i2 = polar(cx, cy, rInner, endDeg);
  const i1 = polar(cx, cy, rInner, startDeg);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i1.x} ${i1.y}`,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------- format --

/** "7h 30m", "45m", "8h" — never "7.5 hours", which nobody plans in. */
export function formatHours(hours: number): string {
  const h = Math.max(0, Number(hours) || 0);
  const whole = Math.floor(h + 1e-9);
  const mins = Math.round((h - whole) * 60);
  if (whole && mins) return `${whole}h ${mins}m`;
  if (whole) return `${whole}h`;
  return `${mins}m`;
}

/** "06:30" from 6.5. The ring is a clock, so its labels are clock times. */
export function clockAt(hour: number): string {
  const h = ((Number(hour) || 0) % DAY_HOURS + DAY_HOURS) % DAY_HOURS;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  // 7.999 rounds to 60 minutes, which is 08:00 and not 07:60.
  const carry = mm === 60 ? 1 : 0;
  return `${String((hh + carry) % DAY_HOURS).padStart(2, "0")}:${String(carry ? 0 : mm).padStart(2, "0")}`;
}

/** Hours since midnight, as a fraction, for the "now" hand. */
export function hourOfDay(d = new Date()): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// --------------------------------------------------------------- default --

/**
 * Eight fills that stay apart from each other on a near-black ground and on a
 * near-white one. Deliberately clear of the app's lime accent, which the ring
 * reserves for "now" — a block the colour of the clock hand would be read as
 * the clock hand.
 */
export const PALETTE = [
  "#5b8cff", "#35c9a8", "#f0a63c", "#e2607a",
  "#9b7bf0", "#3fb6f0", "#5ecf7a", "#e0785a",
];

/**
 * The day everyone starts from.
 *
 * Sleep and work pinned, the rest free — which is the example in the brief and
 * also the only honest default: the app knows those two are non-negotiable for
 * most people and knows nothing at all about the other eight hours.
 */
export function defaultPlan(): TimeBlock[] {
  return normalise([
    { id: "sleep", label: "Sleep", hours: 8, color: "#7b6cf0", fixed: true },
    { id: "morning", label: "Morning", hours: 1.5, color: "#f0a63c", fixed: false },
    { id: "work", label: "Work", hours: 8, color: "#5b8cff", fixed: true },
    { id: "free", label: "Free", hours: 6.5, color: FREE_COLOR, fixed: false },
  ]).blocks;
}
