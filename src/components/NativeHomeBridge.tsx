import { useCallback, useEffect, useMemo, useRef } from "react";
import { DashboardView } from "@/components/views/DashboardView";
import { EXPAND_WIDGET_EVENT, WidgetCollectContext } from "@/components/WidgetGrid";
import type { GlanceCollector, GlanceSpec } from "@/components/Glance";
import { reconcile, visible } from "@/lib/dashboard-layout";
import { chromeSetHome, iconPng } from "@/lib/native/chrome";
import { normalizeAccent } from "@/lib/soma";
import { useSoma } from "@/lib/store";

/**
 * The native Home (NativeHome.swift) draws the page's widgets on real glass.
 *
 * Every widget already knows how to describe itself as a glance — label,
 * value, progress, lines, a trend — for its small sizes. This renders the
 * Home page out of sight in collect mode, where each widget hands that
 * description over instead of drawing it, and sends the set to native in the
 * user's own order and sizes. A tap comes back as "open": the widget's own
 * action if it has one, otherwise its whole card in the page's sheet.
 */
const specs = new Map<string, GlanceSpec>();
const iconCache = new Map<string, string>();

export function openHomeWidget(id: string): void {
  const spec = specs.get(id);
  if (spec?.onOpen) spec.onOpen();
  else window.dispatchEvent(new CustomEvent(EXPAND_WIDGET_EVENT, { detail: { tab: "dashboard", id } }));
}

async function iconOf(spec: GlanceSpec): Promise<string> {
  const Icon = spec.icon;
  if (!Icon) return "";
  const key = Icon.displayName ?? spec.label;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const png = await iconPng(Icon).catch(() => "");
  iconCache.set(key, png);
  return png;
}

async function plain(id: string, spec: GlanceSpec | undefined) {
  if (!spec) return null;
  return {
    id,
    label: spec.label,
    short: spec.short ?? null,
    color: spec.color ?? null,
    icon: await iconOf(spec),
    value: spec.value ?? null,
    unit: spec.unit ?? null,
    sub: spec.sub ?? null,
    progress: spec.progress ?? null,
    done: !!spec.done,
    lines: (spec.lines ?? []).slice(0, 12).map((l) => ({ text: l.text, done: !!l.done, value: l.value ?? null, color: l.color ?? null })),
    stats: (spec.stats ?? []).map((s) => ({ label: s.label, value: s.value, of: s.of ?? null, color: s.color ?? null })),
    chart: spec.chart ? { values: spec.chart.values, target: spec.chart.target ?? null } : null,
    empty: spec.empty ?? null,
    rings: spec.rings ?? null,
  };
}

export function NativeHomeBridge({ visibleNow }: { visibleNow: boolean }) {
  const layouts = useSoma((s) => s.layouts);
  const accent = useSoma((s) => s.settings.accent);
  const timer = useRef<number | undefined>(undefined);
  const layoutRef = useRef(layouts);
  layoutRef.current = layouts;
  const showRef = useRef(visibleNow);
  showRef.current = visibleNow;
  const accentRef = useRef(accent);
  accentRef.current = accent;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const shown = visible(reconcile(layoutRef.current.dashboard, "dashboard"));
      const items = await Promise.all(
        shown.map(async (p) => ({ id: p.id, size: p.size, spec: await plain(p.id, specs.get(p.id)) })),
      );
      const extras = (await Promise.all(["sleepclock", "checkin"].map((id) => plain(id, specs.get(id))))).filter(Boolean);
      chromeSetHome(
        JSON.stringify({
          visible: showRef.current,
          accent: normalizeAccent(accentRef.current),
          extras,
          items: items.filter((i) => i.spec),
        }),
      );
    }, 80);
  }, []);

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
  }, [layouts, visibleNow, accent, flush]);

  return (
    <div hidden aria-hidden="true">
      <WidgetCollectContext.Provider value={collectFor}>
        <DashboardView />
      </WidgetCollectContext.Provider>
    </div>
  );
}
