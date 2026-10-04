import { useEffect, useRef } from "react";
import { Check, Star } from "lucide-react";
import { tapLight } from "@/lib/haptics";
import { ACCENT_PRESETS } from "@/lib/soma";
import { pushRecentColor, toggleFavoriteColor } from "@/lib/habit-colors";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Presets, then "Your colours" (starred first, then the last ones picked by
 * hand), then the free picker. A hand-picked colour is remembered on its own
 * after a moment, so a nice find is never lost to the next drag of the wheel.
 */
export function ColorPalette({
  value, onChange, presets = ACCENT_PRESETS.map((p) => ({ label: p.label, color: p.color })),
}: {
  value: string;
  onChange: (color: string) => void;
  presets?: { label: string; color: string }[];
}) {
  const settings = useSoma((s) => s.settings);
  const patchSettings = useSoma((s) => s.patchSettings);
  const favorites = settings.colorFavorites ?? [];
  const recent = (settings.colorRecent ?? []).filter((c) => !favorites.some((f) => same(f, c)));
  const mine = [...favorites, ...recent].slice(0, 12);
  const starred = favorites.some((f) => same(f, value));

  // Remember a picked colour once the wheel has settled on it.
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const remember = (c: string) => {
    pending.current = c;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const st = useSoma.getState();
      st.patchSettings({ colorRecent: pushRecentColor(st.settings.colorRecent, c) });
      pending.current = null;
    }, 900);
  };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      const c = pending.current;
      if (c) {
        const st = useSoma.getState();
        st.patchSettings({ colorRecent: pushRecentColor(st.settings.colorRecent, c) });
      }
    },
    [],
  );

  const swatch = (c: string, label: string, star = false) => (
    <button
      key={label + c}
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        onChange(c);
        tapLight();
      }}
      className={cn(
        "relative grid aspect-square place-items-center rounded-full transition-transform active:scale-90",
        same(value, c) && "ring-2 ring-fg ring-offset-2 ring-offset-[var(--color-surface)]",
      )}
      style={{ background: c, boxShadow: `0 4px 14px color-mix(in srgb, ${c} 35%, transparent)` }}
    >
      {same(value, c) && <Check className="size-4" strokeWidth={3} style={{ color: "rgba(0,0,0,0.65)" }} />}
      {star && (
        <Star className="absolute -right-0.5 -top-0.5 size-3 fill-[#ffcf4a] text-[#ffcf4a] drop-shadow" />
      )}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2.5">{presets.map((p) => swatch(p.color, p.label))}</div>

      {mine.length > 0 && (
        <div>
          <div className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-faint">Your colours</div>
          <div className="grid grid-cols-6 gap-2.5">
            {mine.map((c) => swatch(c, favorites.some((f) => same(f, c)) ? `Saved ${c}` : `Recent ${c}`, favorites.some((f) => same(f, c))))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface-2 px-2 py-1.5">
          <input
            type="color"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              remember(e.target.value);
            }}
            className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent"
          />
          <span className="text-xs text-muted">Pick any colour</span>
          <span className="ml-auto font-mono text-[0.7rem] uppercase text-faint">{value}</span>
        </label>
        <button
          type="button"
          onClick={() => {
            patchSettings({ colorFavorites: toggleFavoriteColor(favorites, value) });
            tapLight();
          }}
          aria-label={starred ? "Remove from saved colours" : "Save this colour"}
          className={cn(
            "flex h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold",
            starred ? "border-[#ffcf4a]/50 bg-[#ffcf4a]/10 text-[#ffcf4a]" : "border-border bg-surface-2 text-muted",
          )}
        >
          <Star className={cn("size-4", starred && "fill-current")} />
          {starred ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
