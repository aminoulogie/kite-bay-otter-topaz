import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { asManifest, decide, type LiveDecision } from "@/lib/live-update-rules";

/**
 * Live updates: a new web layer, downloaded while the app is installed.
 *
 * The iOS workflow publishes, with every build, a zip of the web layer and a
 * small manifest (live.json) beside the AltStore source. On launch and on
 * return to the app SOMA reads the manifest; a newer layer that runs on the
 * native build installed is downloaded in the background and switched to the
 * next time the app is opened (or at once, from Settings). One that needs
 * newer native code is not downloaded — Settings says to reinstall instead.
 *
 * The plugin is Capgo's updater in manual mode with every one of its own
 * servers switched off (capacitor.config.json): nothing is reported
 * anywhere, and the only server is this repository's releases.
 *
 * Safety: the layer that just started says so (notifyAppReady). A layer that
 * never gets that far is thrown away by the plugin and the previous one comes
 * back on the next launch, so a broken update cannot lock the app.
 */

const MANIFEST =
  "https://github.com/aminoulogie/kite-bay-otter-topaz/releases/download/altstore/live.json";
/** Checked at most this often when coming back to the app. */
const EVERY_MS = 30 * 60_000;

type Updater = typeof import("@capgo/capacitor-updater").CapacitorUpdater;
let plugin: Promise<Updater | null> | null = null;
const updater = () =>
  (plugin ??= Capacitor.getPlatform() === "ios"
    ? import("@capgo/capacitor-updater").then((m) => m.CapacitorUpdater).catch(() => null)
    : Promise.resolve(null));

export type LiveStatus =
  | { state: "off" }
  | { state: "checking" }
  | { state: "current"; version: string }
  | { state: "downloading"; version: string }
  | { state: "ready"; version: string; id: string }
  | { state: "reinstall"; version: string; nativeSince: string }
  | { state: "error"; message: string };

let status: LiveStatus = { state: "off" };
const listeners = new Set<(s: LiveStatus) => void>();
const publish = (s: LiveStatus) => {
  status = s;
  for (const l of listeners) l(s);
};
export const liveStatus = () => status;
export function onLiveStatus(fn: (s: LiveStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let lastCheck = 0;
let running: Promise<LiveStatus> | null = null;

/** The web layer running now. */
export const runningVersion = () => __APP_VERSION__;

/** The native build installed, as the plugin reports it. */
export async function nativeVersion(): Promise<string | null> {
  const u = await updater();
  if (!u) return null;
  try {
    return (await u.current()).native || null;
  } catch {
    return null;
  }
}

/**
 * Tell the plugin this layer started. Must run early on every launch: a
 * downloaded layer that never says so is rolled back.
 */
export async function liveReady(): Promise<void> {
  const u = await updater();
  if (!u) return;
  try {
    await u.notifyAppReady();
  } catch {
    /* a build without the plugin */
  }
}

/** Look for a newer layer and download it if it fits. Returns where things stand. */
export function checkLive(force = false): Promise<LiveStatus> {
  if (running) return running;
  if (!force && Date.now() - lastCheck < EVERY_MS) return Promise.resolve(status);
  running = (async () => {
    const u = await updater();
    if (!u) {
      publish({ state: "off" });
      return status;
    }
    lastCheck = Date.now();
    if (status.state === "ready") return status;
    publish({ state: "checking" });
    try {
      const res = await CapacitorHttp.get({
        url: `${MANIFEST}?t=${Date.now()}`,
        headers: { "Cache-Control": "no-cache" },
        connectTimeout: 15000,
        readTimeout: 15000,
      });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const manifest = asManifest(data);
      if (!manifest) throw new Error("The update list could not be read.");
      const native = (await u.current()).native;
      const d: LiveDecision = decide(manifest, runningVersion(), native);
      if (d.kind === "current") {
        publish({ state: "current", version: runningVersion() });
      } else if (d.kind === "reinstall") {
        publish({ state: "reinstall", version: d.version, nativeSince: d.nativeSince });
      } else {
        // Already downloaded on an earlier check: just queue it again.
        const have = (await u.list()).bundles.find((b) => b.version === d.version && b.status !== "error");
        publish({ state: "downloading", version: d.version });
        const bundle = have ?? (await u.download({ url: d.url, version: d.version }));
        // Applied the next time the app is opened from scratch or comes back
        // from the background — never in the middle of something.
        await u.next({ id: bundle.id });
        publish({ state: "ready", version: d.version, id: bundle.id });
      }
    } catch (err) {
      publish({ state: "error", message: err instanceof Error ? err.message : "Update check failed." });
    }
    return status;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Switch to the downloaded layer now. The app reloads. */
export async function applyLiveNow(): Promise<void> {
  const u = await updater();
  if (!u || status.state !== "ready") return;
  await u.set({ id: status.id });
}
