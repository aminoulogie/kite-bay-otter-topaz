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

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    onError("Camera unavailable — check permissions.");
    return { stop };
  }

  if (stopped) {
    stream.getTracks().forEach((t) => t.stop());
    return { stop };
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
  return { stop };
}

export interface ProductHit {
  name: string;
  cals: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  serving: number;
  needsMacros: boolean;
}

/**
 * Open Food Facts, per 100g.
 *
 * The Obsidian plugin used Obsidian's own requestUrl to bypass CORS; a web app
 * has no equivalent, so this depends on the API sending permissive CORS
 * headers. It does — verified against a live request rather than assumed.
 */
export async function lookupBarcode(
  code: string,
): Promise<{ hit: ProductHit | null; offline: boolean }> {
  if (!navigator.onLine) return { hit: null, offline: true };

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
        `?fields=product_name,brands,nutriments`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { hit: null, offline: false };

    const json = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        nutriments?: Record<string, number | undefined>;
      };
    };
    if (json.status !== 1 || !json.product) return { hit: null, offline: false };

    const n = json.product.nutriments ?? {};
    const name =
      [json.product.brands?.split(",")[0]?.trim(), json.product.product_name?.trim()]
        .filter(Boolean)
        .join(" ") || `Item ${code}`;

    const cals = Math.round(n["energy-kcal_100g"] ?? 0);
    const p = Math.round((n.proteins_100g ?? 0) * 10) / 10;
    const c = Math.round((n.carbohydrates_100g ?? 0) * 10) / 10;
    const f = Math.round((n.fat_100g ?? 0) * 10) / 10;

    return {
      hit: {
        name,
        cals,
        p,
        c,
        f,
        fiber: Math.round((n.fiber_100g ?? 0) * 10) / 10,
        serving: 100,
        // A product can exist in the database with no nutrition at all;
        // adding it as zero calories would quietly corrupt the day's totals.
        needsMacros: cals === 0 && p === 0 && c === 0 && f === 0,
      },
      offline: false,
    };
  } catch {
    return { hit: null, offline: !navigator.onLine };
  }
}
