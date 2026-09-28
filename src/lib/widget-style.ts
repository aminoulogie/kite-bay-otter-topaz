/**
 * How one widget looks at one size, set by hand.
 *
 * Canva-style editing for the cards on a page: a colour of your own, text
 * that sits left, centre or right and at the size you want, the whole
 * content nudged, and — at the small sizes, where the parts of a tile are
 * known — each part of it (title, number, line under it, ring, chart, list)
 * moved, recoloured or taken off on its own.
 *
 * Kept per SIZE, because a 1x1 and a 2x4 of the same widget are different
 * drawings: moving the number in the square should not throw it across the
 * wide card.
 */
import type { CSSProperties } from "react";

export type PartId = "head" | "value" | "sub" | "visual" | "chart" | "bar" | "list";

export const PARTS: { id: PartId; label: string }[] = [
  { id: "head", label: "Title" },
  { id: "value", label: "Number" },
  { id: "sub", label: "Line under" },
  { id: "visual", label: "Ring / picture" },
  { id: "chart", label: "Chart" },
  { id: "bar", label: "Progress bar" },
  { id: "list", label: "List" },
];

export interface PartStyle {
  dx?: number;
  dy?: number;
  hidden?: boolean;
  color?: string;
}

export type TextAlign = "start" | "center" | "end";

export interface WidgetStyle {
  /** The widget's own colour: its accent, rings, bars and tint. */
  color?: string;
  /** The colour of its text. */
  text?: string;
  align?: TextAlign;
  /** Text size, 0.8–1.3. */
  scale?: number;
  /** The whole content, nudged, in px. */
  dx?: number;
  dy?: number;
  parts?: Partial<Record<PartId, PartStyle>>;
}

export const STYLE_COLORS = [
  "#c8ff2e", "#30d158", "#64d2ff", "#0a84ff", "#9b8cf5", "#bf5af2",
  "#ff375f", "#ff9f0a", "#ffd60a", "#ffffff", "#8e8e93",
];

const HEX = /^#[0-9a-f]{3,8}$/i;
const PART_IDS = new Set<string>(PARTS.map((p) => p.id));
const clampPx = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(-160, Math.min(160, Math.round(n))) : undefined);

function cleanPart(raw: unknown): PartStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as PartStyle;
  const out: PartStyle = {};
  const dx = clampPx(r.dx);
  const dy = clampPx(r.dy);
  if (dx) out.dx = dx;
  if (dy) out.dy = dy;
  if (r.hidden === true) out.hidden = true;
  if (typeof r.color === "string" && HEX.test(r.color)) out.color = r.color;
  return Object.keys(out).length ? out : undefined;
}

/** A stored style read back safely; nothing left means no style at all. */
export function cleanStyle(raw: unknown): WidgetStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as WidgetStyle;
  const out: WidgetStyle = {};
  if (typeof r.color === "string" && HEX.test(r.color)) out.color = r.color;
  if (typeof r.text === "string" && HEX.test(r.text)) out.text = r.text;
  if (r.align === "start" || r.align === "center" || r.align === "end") out.align = r.align;
  if (typeof r.scale === "number" && Number.isFinite(r.scale) && Math.abs(r.scale - 1) > 0.001) {
    out.scale = Math.max(0.8, Math.min(1.3, Math.round(r.scale * 100) / 100));
  }
  const dx = clampPx(r.dx);
  const dy = clampPx(r.dy);
  if (dx) out.dx = dx;
  if (dy) out.dy = dy;
  if (r.parts && typeof r.parts === "object") {
    const parts: Partial<Record<PartId, PartStyle>> = {};
    for (const [k, v] of Object.entries(r.parts)) {
      if (!PART_IDS.has(k)) continue;
      const p = cleanPart(v);
      if (p) parts[k as PartId] = p;
    }
    if (Object.keys(parts).length) out.parts = parts;
  }
  return Object.keys(out).length ? out : undefined;
}

/** One part changed, the rest kept; an emptied style disappears. */
export function withPart(style: WidgetStyle | undefined, id: PartId, patch: Partial<PartStyle>): WidgetStyle | undefined {
  const parts = { ...(style?.parts ?? {}) };
  parts[id] = { ...(parts[id] ?? {}), ...patch };
  return cleanStyle({ ...(style ?? {}), parts });
}

/** The CSS a styled widget's box carries. */
export function boxStyle(style: WidgetStyle | undefined): CSSProperties | undefined {
  if (!style) return undefined;
  const css: Record<string, string> = {};
  if (style.color) {
    // The theme's accent, redefined inside this one widget: every ring, bar,
    // button and tint it draws with the accent follows.
    css["--color-accent"] = style.color;
    css["--color-accent-text"] = style.color;
    css["--color-accent-soft"] = `color-mix(in srgb, ${style.color} 16%, transparent)`;
    css["--color-accent-line"] = `color-mix(in srgb, ${style.color} 45%, transparent)`;
  }
  if (style.text) {
    css.color = style.text;
    css["--color-fg"] = style.text;
  }
  if (style.align) css.textAlign = style.align === "start" ? "left" : style.align === "end" ? "right" : "center";
  if (style.scale) css.zoom = String(style.scale);
  if (style.dx || style.dy) css.transform = `translate(${style.dx ?? 0}px, ${style.dy ?? 0}px)`;
  return css as CSSProperties;
}
