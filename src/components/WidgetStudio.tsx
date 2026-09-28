import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Eye, EyeOff, Move, RotateCcw, X } from "lucide-react";
import { isGlance } from "@/components/Glance";
import { SIZE_SPECS, type WidgetPlacement, type WidgetSize } from "@/lib/dashboard-layout";
import {
  PARTS, STYLE_COLORS, cleanStyle, withPart, type PartId, type TextAlign, type WidgetStyle,
} from "@/lib/widget-style";
import { cn } from "@/lib/utils";
import { tapLight } from "@/lib/haptics";

/**
 * One widget, every size it comes in, each editable on its own — the three
 * dots on a card in edit mode.
 *
 * Pick a size along the top and the preview is the real widget at that size.
 * Drag in the preview to move things: at the small sizes a part is picked up
 * on its own (the number, the title, the ring), at the big ones the whole
 * content moves. Colour, text colour, alignment and text size sit below, and
 * the small sizes list their parts to hide or recolour one at a time. Every
 * size keeps its own look.
 */
export function WidgetStudio({
  label, placement, sizes, render, boxClass, onSize, onStyle, onClose,
}: {
  label: string;
  placement: WidgetPlacement;
  sizes: WidgetSize[];
  render: (size: WidgetSize, style: WidgetStyle | undefined) => React.ReactNode;
  boxClass: (size: WidgetSize) => string;
  onSize: (size: WidgetSize) => void;
  onStyle: (size: WidgetSize, style: WidgetStyle | undefined) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<WidgetSize>(placement.size);
  const saved = placement.style?.[size];
  /** What the preview shows: the saved style, or the one being dragged. */
  const [draft, setDraft] = useState<WidgetStyle | undefined>(saved);
  useEffect(() => setDraft(placement.style?.[size]), [placement.style, size]);

  const commit = (next: WidgetStyle | undefined) => {
    const clean = cleanStyle(next);
    setDraft(clean);
    onStyle(size, clean);
  };
  const patch = (p: Partial<WidgetStyle>) => commit({ ...(draft ?? {}), ...p });

  const glance = isGlance(size);
  const drag = useRef<{ id: number; x: number; y: number; part: PartId | null; base: WidgetStyle | undefined } | null>(null);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${label}`}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
        data-no-swipe-nav
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate font-display text-base font-extrabold">{label}</div>
            <div className="text-[0.66rem] text-faint">Every size keeps its own look.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Every size it comes in. */}
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {SIZE_SPECS.filter((s) => sizes.includes(s.id)).map((s) => {
            const on = s.id === size;
            const styled = !!placement.style?.[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSize(s.id)}
                aria-pressed={on}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2",
                  on ? "border-accent bg-accent/10" : "border-border bg-surface-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn("block rounded-[3px] border-2", on ? "border-accent bg-accent/40" : "border-fg/45")}
                  style={{ width: s.w * 8, height: s.h * 8 }}
                />
                <span className={cn("text-[0.62rem] font-bold tabular", on ? "text-accent-text" : "text-muted")}>
                  {s.id}
                  {placement.size === s.id ? " ·" : ""}
                  {styled ? " ✎" : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* The widget itself, at this size, to drag things around in. */}
        <div
          className="relative mt-3 touch-none rounded-3xl border border-dashed border-border p-2"
          onClickCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            const el = e.target as HTMLElement;
            const part = glance ? ((el.closest("[data-part]") as HTMLElement | null)?.dataset.part as PartId | undefined) ?? null : null;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, part, base: draft };
            tapLight();
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            const dx = Math.round(e.clientX - d.x);
            const dy = Math.round(e.clientY - d.y);
            if (d.part) {
              const cur = d.base?.parts?.[d.part];
              setDraft(withPart(d.base, d.part, { dx: (cur?.dx ?? 0) + dx, dy: (cur?.dy ?? 0) + dy }));
            } else {
              setDraft(cleanStyle({ ...(d.base ?? {}), dx: (d.base?.dx ?? 0) + dx, dy: (d.base?.dy ?? 0) + dy }));
            }
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            drag.current = null;
            commit(draft);
          }}
          onPointerCancel={() => {
            if (!drag.current) return;
            drag.current = null;
            setDraft(saved);
          }}
        >
          <div className="grid grid-cols-4 gap-x-2 gap-y-3">
            <div className={cn("flex min-w-0 flex-col", boxClass(size))}>
              <div className="relative flex min-h-0 flex-1 flex-col">{render(size, draft)}</div>
            </div>
          </div>
          <div className="pointer-events-none mt-2 flex items-center justify-center gap-1.5 text-[0.62rem] font-bold text-faint">
            <Move className="size-3" />
            {glance ? "Drag a part to move it — the number, the title, the ring" : "Drag to shift everything"}
          </div>
        </div>

        {placement.size !== size && (
          <button
            type="button"
            onClick={() => {
              onSize(size);
              tapLight();
            }}
            className="mt-3 h-10 w-full rounded-xl bg-accent text-sm font-bold text-accent-ink active:scale-[0.99]"
          >
            Use {size} on the page
          </button>
        )}

        <Row label="Colour">
          <Swatches value={draft?.color} onPick={(c) => patch({ color: c })} />
        </Row>
        <Row label="Text colour">
          <Swatches value={draft?.text} onPick={(c) => patch({ text: c })} />
        </Row>
        <Row label="Text">
          <div className="flex items-center gap-1.5">
            {([
              ["start", AlignLeft, "Left"],
              ["center", AlignCenter, "Centre"],
              ["end", AlignRight, "Right"],
            ] as [TextAlign, typeof AlignLeft, string][]).map(([a, Icon, name]) => (
              <button
                key={a}
                type="button"
                aria-label={`Align ${name}`}
                aria-pressed={draft?.align === a}
                onClick={() => patch({ align: draft?.align === a ? undefined : a })}
                className={cn(
                  "grid size-9 place-items-center rounded-xl border",
                  draft?.align === a ? "border-accent bg-accent/15 text-accent-text" : "border-border bg-surface-2 text-muted",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
            <input
              type="range"
              min={80}
              max={130}
              step={5}
              value={Math.round((draft?.scale ?? 1) * 100)}
              onChange={(e) => setDraft(cleanStyle({ ...(draft ?? {}), scale: Number(e.target.value) / 100 }))}
              onPointerUp={() => commit(draft)}
              onKeyUp={() => commit(draft)}
              aria-label="Text size"
              className="ml-2 min-w-0 flex-1 accent-[var(--color-accent)]"
            />
            <span className="w-9 text-right text-[0.66rem] font-bold tabular text-muted">
              {Math.round((draft?.scale ?? 1) * 100)}%
            </span>
          </div>
        </Row>

        {glance && (
          <div className="mt-4">
            <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted">Parts</div>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {PARTS.map((p, i) => {
                const ps = draft?.parts?.[p.id];
                const moved = !!(ps?.dx || ps?.dy);
                return (
                  <div key={p.id} className={cn("flex items-center gap-2 px-3 py-2", i > 0 && "border-t border-border")}>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold">{p.label}</span>
                    <MiniSwatch
                      value={ps?.color}
                      onPick={(c) => commit(withPart(draft, p.id, { color: c }))}
                    />
                    {moved && (
                      <button
                        type="button"
                        aria-label={`Put ${p.label} back`}
                        onClick={() => commit(withPart(draft, p.id, { dx: 0, dy: 0 }))}
                        className="grid size-8 place-items-center rounded-lg border border-border bg-surface-2 text-muted"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={ps?.hidden ? `Show ${p.label}` : `Hide ${p.label}`}
                      onClick={() => commit(withPart(draft, p.id, { hidden: !ps?.hidden }))}
                      className={cn(
                        "grid size-8 place-items-center rounded-lg border",
                        ps?.hidden ? "border-border bg-surface-2 text-faint" : "border-accent-line bg-accent-soft text-accent-text",
                      )}
                    >
                      {ps?.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[0.62rem] leading-snug text-faint">
              Not every size draws every part — a 1x1 has no chart to hide.
            </p>
          </div>
        )}

        {draft && (
          <button
            type="button"
            onClick={() => commit(undefined)}
            className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 text-sm font-bold text-muted"
          >
            <RotateCcw className="size-4" /> Reset {size} to how it came
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
      {children}
    </div>
  );
}

function Swatches({ value, onPick }: { value?: string; onPick: (c: string | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onPick(undefined)}
        aria-pressed={!value}
        aria-label="Default"
        className={cn(
          "h-8 rounded-full border px-2.5 text-[0.64rem] font-bold",
          !value ? "border-accent text-accent-text" : "border-border text-muted",
        )}
      >
        Default
      </button>
      {STYLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          aria-pressed={value === c}
          aria-label={c}
          className={cn("size-8 rounded-full border-2", value === c ? "border-fg" : "border-transparent")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

/** A dot that steps through the colours; past the last, back to default. */
function MiniSwatch({ value, onPick }: { value?: string; onPick: (c: string | undefined) => void }) {
  const next = () => {
    const i = value ? STYLE_COLORS.indexOf(value) : -1;
    onPick(i + 1 < STYLE_COLORS.length ? STYLE_COLORS[i + 1] : undefined);
  };
  return (
    <button
      type="button"
      onClick={next}
      aria-label={value ? `Colour ${value}, tap for the next` : "Default colour, tap to colour it"}
      className="grid size-8 place-items-center rounded-lg border border-border bg-surface-2"
    >
      <span
        className="block size-4 rounded-full border border-fg/30"
        style={{ background: value ?? "conic-gradient(#ff375f, #ffd60a, #30d158, #64d2ff, #bf5af2, #ff375f)" }}
      />
    </button>
  );
}
