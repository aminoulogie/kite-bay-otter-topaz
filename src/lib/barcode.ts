/**
 * Barcode scanning and product lookup.
 *
 * Decoding is an explicit frame loop over a canvas rather than a library's
 * "decode from video element" helper: those hand back a single frame and
 * silently drop the callback, which is exactly how the Obsidian plugin's
 * scanner ended up appearing to work while never resolving a code.
 *
 * BarcodeDetector is deliberately unused. It does not exist in Safari, so on
 * an iPhone — the device this is installed to — it would never run. The wasm
 * decoder is bundled rather than pulled from a CDN so it also works offline.
 */

import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
// Bundled, not fetched. zxing-wasm defaults to pulling its binary from a CDN,
// which means the scanner fails in exactly the situation a phone app needs it
// most — a supermarket with no signal — and depends on a third-party host
// staying up. `?url` makes Vite emit it as a build asset instead.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : prefix + path,
  },
});

export interface ScanHandle {
  stop: () => void;
  /**
   * Nudge the camera to refocus, optionally on a point in the preview.
   *
   * A barcode held close is exactly the case a phone's continuous autofocus is
   * worst at — it hunts, settles on the shelf behind, and the decode loop spins
   * on a blurred frame forever. `x`/`y` are 0-1 within the video; where the
   * platform ignores points of interest this still forces a refocus, which is
   * most of the value.
   *
   * Resolves false when the camera exposes no focus control at all, so the UI
   * can hide a button that would do nothing.
   */
  focus: (x?: number, y?: number) => Promise<boolean>;
  /**
   * Set the optical/digital zoom, where the camera has one.
   *
   * 0.5 asks for the ultra-wide lens and 1 for the main one; both are mapped
   * onto whatever range this particular camera actually reports, because the
   * numbers a phone exposes are not the numbers printed in its camera app.
   */
  setZoom: (level: number) => Promise<boolean>;
  /** What this camera supports, so controls that would do nothing are not shown. */
  capabilities: () => { focus: boolean; zoom: boolean };
}

// Retail formats first — a food barcode is nearly always EAN-13 or UPC-A.
// Narrowing the set is also a speed win: every extra format is another
// decoding pass over each frame.
const FORMATS = ["EAN-13", "EAN-8", "UPC-A", "UPC-E", "Code128", "Code39"] as const;

/**
 * Starts the rear camera and calls `onCode` with the first barcode decoded.
 * `onError` receives a human-readable reason — a refused permission is a
 * normal outcome here, not an exception to swallow.
 */
export async function startScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
  onError: (message: string) => void,
): Promise<ScanHandle> {
  let stopped = false;
  let stream: MediaStream | null = null;
  let raf = 0;

  const stop = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
  };

  /**
   * The camera controls, as they exist on THIS device.
   *
   * Every one of these is optional in the spec and absent on desktop Safari, so
   * each is probed rather than assumed and every call is wrapped: an
   * unsupported constraint rejects, and an unhandled rejection here would kill
   * the scan loop over a button press.
   */
  const controls = () => {
    const track = stream?.getVideoTracks()[0] ?? null;
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      focusMode?: string[];
      pointsOfInterest?: unknown;
      zoom?: { min: number; max: number; step?: number };
    };
    return { track, caps };
  };

  const focus: ScanHandle["focus"] = async (x, y) => {
    const { track, caps } = controls();
    if (!track) return false;
    const modes = caps.focusMode ?? [];
    const advanced: Record<string, unknown>[] = [];
    if (x != null && y != null && "pointsOfInterest" in caps) {
      advanced.push({ pointsOfInterest: [{ x, y }] });
    }
    // single-shot re-runs the search now; continuous is the fallback that at
    // least kicks a camera that has given up mid-hunt.
    const mode = modes.includes("single-shot")
      ? "single-shot"
      : modes.includes("continuous")
        ? "continuous"
        : null;
    if (mode) advanced.push({ focusMode: mode });
    if (!advanced.length) return false;
    try {
      await track.applyConstraints({ advanced } as unknown as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  };

  const setZoom: ScanHandle["setZoom"] = async (level) => {
    const { track, caps } = controls();
    const range = caps.zoom;
    if (!track || !range) return false;
    // 1 is "no zoom", which is not always 1 in the camera's own units — some
    // report a range starting at 100. Asking for 0.5 means the widest the
    // camera will go, which is what the 0.5x button on a phone means.
    const neutral = Math.max(range.min, Math.min(range.max, 1));
    const want = level <= 0.5 ? range.min : neutral;
    try {
      // `zoom` and `focusMode` are real constraints that TypeScript's DOM lib
      // does not model, so the cast goes through unknown rather than pretending
      // the shapes overlap.
      await track.applyConstraints({ advanced: [{ zoom: want }] } as unknown as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  };

  const capabilities = () => {
    const { caps } = controls();
    return {
      focus: !!(caps.focusMode?.length || "pointsOfInterest" in caps),
      zoom: !!caps.zoom && caps.zoom.min < caps.zoom.max,
    };
  };

  const handle: ScanHandle = { stop, focus, setZoom, capabilities };

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    onError("Camera unavailable — check permissions.");
    return handle;
  }

  if (stopped) {
    stream.getTracks().forEach((t) => t.stop());
    return handle;
  }

  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  await video.play().catch(() => undefined);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let busy = false;

  const tick = async () => {
    if (stopped) return;
    // Skip while a decode is still in flight; queuing them behind each other
    // makes the preview stutter without decoding any faster.
    if (!busy && video.videoWidth > 0) {
      busy = true;
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0);
        const data = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (data) {
          const results = await readBarcodes(data, {
            tryHarder: true,
            formats: [...FORMATS],
          });
          const hit = results.find((r) => r.text);
          if (hit && !stopped) {
            stop();
            onCode(hit.text);
            return;
          }
        }
      } catch {
        // A frame that fails to decode is the normal case, not an error.
      } finally {
        busy = false;
      }
    }
    raf = requestAnimationFrame(() => void tick());
  };

  void tick();
  return handle;
}

export interface ProductHit {
  name: string;
  cals: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  /** Micronutrients, in mg, where the source reports them. */
  sodium?: number;
  calcium?: number;
  iron?: number;
  potassium?: number;
  serving: number;
  /** Which database answered, so a wrong entry can be traced. */
  source?: string;
  /** The code this was found by — the only barcode worth storing. */
  barcode?: string;
  needsMacros: boolean;
}

/**
 * Open Food Facts, per 100g.
 *
 * The Obsidian plugin used Obsidian's own requestUrl to bypass CORS; a web app
 * has no equivalent, so this depends on the API sending permissive CORS
 * headers. It does — verified against a live request rather than assumed.
 */
/**
 * A source that can answer a barcode, and how to read its reply.
 *
 * Several, because one is not enough in practice: Open Food Facts is strong on
 * European retail and thin elsewhere, and a product it holds with no nutrition
 * table is exactly the "Imported Product, 0 kcal" entry that has been landing
 * in the log. Falling through to another database turns those into real food.
 *
 * Every source must send permissive CORS headers — a web app has no way around
 * that, unlike the Obsidian plugin, which used Obsidian's own requestUrl.
 */
interface Source {
  id: string;
  label: string;
  url: (code: string) => string;
  parse: (json: unknown, code: string) => ProductHit | null;
}

function round1(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
}

const SOURCES: Source[] = [
  {
    id: "off",
    label: "Open Food Facts",
    url: (code) =>
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
      `?fields=product_name,brands,nutriments`,
    parse: (raw, code) => {
      const json = raw as {
        status?: number;
        product?: {
          product_name?: string;
          brands?: string;
          nutriments?: Record<string, number | undefined>;
        };
      };
      if (json.status !== 1 || !json.product) return null;
      const n = json.product.nutriments ?? {};
      const name =
        [json.product.brands?.split(",")[0]?.trim(), json.product.product_name?.trim()]
          .filter(Boolean)
          .join(" ") || `Item ${code}`;
      return {
        name,
        cals: Math.round(n["energy-kcal_100g"] ?? 0),
        p: round1(n.proteins_100g),
        c: round1(n.carbohydrates_100g),
        f: round1(n.fat_100g),
        fiber: round1(n.fiber_100g),
        sodium: round1((n.sodium_100g ?? 0) * 1000),
        calcium: round1((n.calcium_100g ?? 0) * 1000),
        iron: round1((n.iron_100g ?? 0) * 1000),
        potassium: round1((n.potassium_100g ?? 0) * 1000),
        serving: 100,
        source: "Open Food Facts",
        needsMacros: false,
      };
    },
  },
  {
    // Same project, separate database: household and restaurant items that the
    // food database deliberately does not carry.
    id: "offp",
    label: "Open Products Facts",
    url: (code) =>
      `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
      `?fields=product_name,brands,nutriments`,
    parse: (raw, code) => SOURCES[0]!.parse(raw, code),
  },
  {
    // United States coverage, where Open Food Facts is thinnest.
    id: "usda",
    label: "USDA FoodData Central",
    url: (code) =>
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&pageSize=1&query=${encodeURIComponent(code)}`,
    parse: (raw, code) => {
      const json = raw as {
        foods?: { description?: string; foodNutrients?: { nutrientName?: string; value?: number }[] }[];
      };
      const food = json.foods?.[0];
      if (!food) return null;
      const by = (needle: string) =>
        round1(
          food.foodNutrients?.find((x) => x.nutrientName?.toLowerCase().includes(needle))?.value,
        );
      return {
        name: food.description?.trim() || `Item ${code}`,
        cals: Math.round(by("energy")),
        p: by("protein"),
        c: by("carbohydrate"),
        f: by("total lipid"),
        fiber: by("fiber"),
        sodium: by("sodium"),
        calcium: by("calcium"),
        iron: by("iron"),
        potassium: by("potassium"),
        serving: 100,
        source: "USDA",
        needsMacros: false,
      };
    },
  },
];

function isEmpty(hit: ProductHit): boolean {
  return hit.cals === 0 && hit.p === 0 && hit.c === 0 && hit.f === 0;
}

/**
 * Ask each source in turn until one returns real nutrition.
 *
 * A hit with no macros does NOT stop the search: a product can exist in a
 * database with an empty nutrition table, and accepting that was how
 * "Imported Product, 0 kcal" kept reaching the food log. An empty hit is
 * remembered only as a last-resort name, so a scan that finds nothing
 * anywhere still tells the user what the product is called.
 *
 * Sources are tried sequentially rather than in parallel: the first usually
 * answers, and firing three requests for every scan would waste the other two
 * on a phone that may be on mobile data.
 */
export async function lookupBarcode(
  code: string,
  /**
   * A product already known by this code. Checked before the network, which is
   * what makes a repeat scan instant and — the case that actually matters —
   * makes it work in a shop with no signal.
   */
  known?: (code: string) => ProductHit | null,
): Promise<{ hit: ProductHit | null; offline: boolean; cached?: boolean }> {
  const local = known?.(code) ?? null;
  if (local) return { hit: local, offline: false, cached: true };

  if (!navigator.onLine) return { hit: null, offline: true };

  let fallback: ProductHit | null = null;

  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url(code), { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const parsed = src.parse(await res.json(), code);
      if (!parsed) continue;
      const hit = { ...parsed, barcode: code };
      if (!isEmpty(hit)) return { hit, offline: false };
      // Keep the name, keep looking for the numbers.
      fallback ??= { ...hit, needsMacros: true };
    } catch {
      // One source being unreachable must not end the search.
      continue;
    }
  }

  return { hit: fallback, offline: !navigator.onLine };
}
