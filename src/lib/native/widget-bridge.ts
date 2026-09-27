import { Capacitor, registerPlugin } from "@capacitor/core";
import { widgetSnapshot, type WidgetSnapshot } from "@/lib/widget-snapshot";

/** Hands the snapshot to ios/App/App/WidgetBridgePlugin.swift. */
const WidgetBridge = registerPlugin<{
  setRings(s: WidgetSnapshot): Promise<{ ok: boolean; shared: boolean }>;
}>("WidgetBridge");

let last = "";
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Sends the snapshot when it has changed, a moment after the last change:
 * logging a meal touches the store several times in a row, and the widget
 * only needs the result. Off the iOS build this does nothing.
 */
export function pushWidgetSnapshot(s: Parameters<typeof widgetSnapshot>[0]): void {
  if (Capacitor.getPlatform() !== "ios") return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const snap = widgetSnapshot(s);
    const key = JSON.stringify(snap);
    if (key === last) return;
    WidgetBridge.setRings(snap)
      .then((r) => {
        if (r.ok) last = key;
      })
      .catch(() => {
        // An older native build without the plugin: nothing to update.
      });
  }, 800);
}
