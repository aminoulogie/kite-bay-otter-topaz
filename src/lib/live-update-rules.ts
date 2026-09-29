/**
 * When a live update may be applied — the rules, apart from the plugin.
 *
 * SOMA is two layers. The web layer (every screen and all the logic) can be
 * replaced while the app is installed; the native layer (Swift: the widget,
 * the lock-screen timer, the plugins) only by installing a new build. A web
 * layer is built against a particular native layer, so each published update
 * says the oldest native build it can run on (`nativeSince`: the last build
 * whose native side changed). An app installed from before that is told to
 * reinstall instead of being handed a layer that calls into code it lacks.
 */

export interface LiveManifest {
  /** The web layer on offer, "0.0.150". */
  version: string;
  /** Where its zip is. */
  url: string;
  /** The same zip elsewhere, tried in turn if the first is slow or down. */
  mirrors?: string[];
  /** SHA-256 of the zip, hex. The updater will not download without it. */
  checksum?: string;
  /** The oldest installed build this layer runs on. */
  nativeSince: string;
  /** When it was built, ISO. */
  date?: string;
}

export type LiveDecision =
  | { kind: "current" }
  | { kind: "update"; version: string; url: string; checksum: string }
  | { kind: "reinstall"; version: string; nativeSince: string };

/** "0.0.150" against "0.0.99", part by part; -1, 0 or 1. Non-numbers count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** A manifest read back from the network, or null if it is not one. */
export function asManifest(raw: unknown): LiveManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LiveManifest>;
  if (typeof r.version !== "string" || typeof r.url !== "string" || typeof r.nativeSince !== "string") return null;
  if (!/^https:\/\//.test(r.url)) return null;
  const mirrors = Array.isArray(r.mirrors) ? r.mirrors.filter((m): m is string => typeof m === "string" && /^https:\/\//.test(m)) : [];
  return {
    version: r.version,
    url: r.url,
    mirrors,
    checksum: typeof r.checksum === "string" && /^[0-9a-f]{64}$/i.test(r.checksum) ? r.checksum.toLowerCase() : undefined,
    nativeSince: r.nativeSince,
    date: typeof r.date === "string" ? r.date : undefined,
  };
}

/**
 * What to do with an offered update, given the web layer running now and the
 * native build installed.
 */
export function decide(manifest: LiveManifest, running: string, native: string): LiveDecision {
  if (compareVersions(manifest.version, running) <= 0) return { kind: "current" };
  // Without a checksum the updater refuses the download; nothing to offer.
  if (!manifest.checksum) return { kind: "current" };
  if (compareVersions(native, manifest.nativeSince) < 0) {
    return { kind: "reinstall", version: manifest.version, nativeSince: manifest.nativeSince };
  }
  return { kind: "update", version: manifest.version, url: manifest.url, checksum: manifest.checksum };
}
