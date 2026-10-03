import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NutritionView } from "@/components/views/NutritionView";
import { plain } from "@/components/NativeHomeBridge";
import { EXPAND_WIDGET_EVENT, WidgetCollectContext } from "@/components/WidgetGrid";
import type { GlanceCollector, GlanceSpec } from "@/components/Glance";
import { reconcile, visible } from "@/lib/dashboard-layout";
import { chromeSetFuel } from "@/lib/native/chrome";
import { fuelCore, onFuelCore } from "@/lib/native/fuel-native";
import { normalizeAccent } from "@/lib/soma";
import { useSoma } from "@/lib/store";

/**
 * The native Fuel page's data: the core snapshot NutritionView publishes
 * (totals, water, add food, diary) merged with the glances of every other
 * card on the current sub-page, in the user's order and sizes.
 */
const CORE = new Set(["target", "actions", "water", "add", "diary"]);
const specs = new Map<string, GlanceSpec>();
let page = "nutrition-dash";

export function openFuelCard(id: string): void {
  const spec = specs.get(id);
  if (spec?.onOpen) spec.onOpen();
  else window.dispatchEvent(new CustomEvent(EXPAND_WIDGET_EVENT, { detail: { tab: page, id } }));
}

export function NativeFuelBridge({ visibleNow }: { visibleNow: boolean }) {
  const layouts = useSoma((s) => s.layouts);
  const accent = useSoma((s) => s.settings.accent);
  const [sub, setSub] = useState<"dash" | "week" | "log" | "weight">("dash");
  const timer = useRef<number | undefined>(undefined);
  const live = useRef({ layouts, accent, visibleNow, sub });
  live.current = { layouts, accent, visibleNow, sub };

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const { layouts: ls, accent: ac, visibleNow: vis, sub: sb } = live.current;
      const core = fuelCore() as ({ sub?: string } & Record<string, unknown>) | null;
      page = `nutrition-${sb}`;
      const shown = visible(reconcile(ls[page], page));
      const items = await Promise.all(
        shown.map(async (p) => ({
          id: p.id,
          size: p.size,
          core: CORE.has(p.id),
          spec: CORE.has(p.id) ? null : await plain(p.id, specs.get(p.id)),
        })),
      );
      chromeSetFuel(
        JSON.stringify({
          visible: vis && core != null,
          page,
          accent: normalizeAccent(ac),
          core,
          items: items.filter((i) => i.core || i.spec),
        }),
      );
    }, 60);
  }, []);

  // Follow the sub-page the visible Fuel page is on.
  useEffect(
    () =>
      onFuelCore(() => {
        const s = (fuelCore() as { sub?: string } | null)?.sub;
        if (s && s !== live.current.sub) {
          specs.clear();
          setSub(s as typeof sub);
        }
        flush();
      }),
    [flush],
  );

  const collectFor = useMemo(() => {
    const cache = new Map<string, GlanceCollector>();
    return (id: string): GlanceCollector => {
      let c = cache.get(id);
      if (!c) {
        c = {
          put(spec) {
            specs.set(id, spec);
            flush();
          },
          remove() {
            if (specs.delete(id)) flush();
          },
        };
        cache.set(id, c);
      }
      return c;
    };
  }, [flush]);

  useEffect(() => {
    flush();
  }, [layouts, visibleNow, accent, sub, flush]);

  return (
    <div hidden aria-hidden="true">
      <WidgetCollectContext.Provider value={collectFor}>
        <NutritionView key={sub} initialSub={sub} />
      </WidgetCollectContext.Provider>
    </div>
  );
}
