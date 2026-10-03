import { Capacitor } from "@capacitor/core";
import { textFromLink } from "../screen-time-import.ts";

/**
 * Listen for soma://screentime?text=… from the Apple Shortcut.
 *
 * Guarded on the App plugin being in the native build: a live update reaches
 * phones still on an older install, which do not have it.
 */
export function startScreenTimeLink(onText: (text: string) => void): () => void {
  let off: (() => void) | null = null;
  let alive = true;

  // Dev and browser testing: ?screentime=<text>.
  try {
    const q = new URLSearchParams(window.location.search).get("screentime");
    if (q) onText(q);
  } catch {
    /* no window */
  }

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("App")) {
    void import("@capacitor/app").then(async ({ App }) => {
      if (!alive) return;
      try {
        const h = await App.addListener("appUrlOpen", ({ url }) => {
          const t = textFromLink(url);
          if (t != null) onText(t);
        });
        off = () => void h.remove();
        if (!alive) off();
        // A link that cold-started the app arrives as the launch URL instead.
        const launch = await App.getLaunchUrl();
        const t = launch?.url ? textFromLink(launch.url) : null;
        if (alive && t != null) onText(t);
      } catch {
        /* plugin missing on this install */
      }
    });
  }

  return () => {
    alive = false;
    off?.();
  };
}
