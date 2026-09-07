import { useEffect, useRef, useState } from "react";
import { Crosshair, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tapLight } from "@/lib/haptics";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";
import { lookupBarcode, startScanner, type ProductHit, type ScanHandle } from "@/lib/barcode";

/**
 * Scanning a barcode, as a widget rather than a takeover.
 *
 * It used to fill the screen: a black page with a small video floating in the
 * middle of it, most of which was empty. Scanning is a five-second act in the
 * middle of logging a meal, and taking the whole screen for it made it feel
 * like leaving the app.
 *
 * Now it is a card over the diary, roughly the size of the thing it is
 * showing, with the two controls a phone camera actually needs at close range:
 * a focus tap and a lens switch. Continuous autofocus hunts on a barcode held
 * a hand's width away and often settles on the shelf behind it, and the
 * ultra-wide lens focuses far closer than the main one — which is the
 * difference between decoding a small barcode and not.
 *
 * Manual entry stays alongside the camera. Permission can be refused, light
 * can be bad, a barcode can be creased, and without a fallback each of those
 * is a dead end.
 */
export function BarcodeScanner({
  onFound,
  onClose,
}: {
  onFound: (hit: ProductHit) => void;
  onClose: () => void;
}) {
  const sheetRef = useSheet(onClose);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScanHandle | null>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [manual, setManual] = useState("");
  const [caps, setCaps] = useState({ focus: false, zoom: false });
  const [zoom, setZoom] = useState<0.5 | 1>(1);
  // Where the last focus tap landed, so the tap has a visible consequence.
  const [focusAt, setFocusAt] = useState<{ x: number; y: number; at: number } | null>(null);

  const resolve = async (code: string) => {
    setStatus(`Looking up ${code}…`);
    const { hit, offline } = await lookupBarcode(code);
    if (offline) {
      setStatus("Offline — connect to look this up, or add it by hand.");
      return;
    }
    if (!hit) {
      setStatus(`Not in the database. Add "${code}" by hand instead.`);
      return;
    }
    if (hit.needsMacros) {
      setStatus(`Found "${hit.name}" but it has no nutrition data. Add it by hand.`);
      return;
    }
    onFound(hit);
  };

  useEffect(() => {
    let alive = true;
    const video = videoRef.current;
    if (!video) return;

    void startScanner(
      video,
      (code) => {
        if (alive) void resolve(code);
      },
      (msg) => {
        if (alive) setStatus(`${msg} You can still type the number.`);
      },
    ).then((h) => {
      if (!alive) {
        h.stop();
        return;
      }
      handleRef.current = h;
      // Capabilities are only readable once the track is live, and on some
      // phones only a beat after that.
      const readCaps = () => alive && setCaps(h.capabilities());
      readCaps();
      setTimeout(readCaps, 500);
      setStatus((s) => (s === "Starting camera…" ? "Scanning…" : s));
    });

    return () => {
      alive = false;
      handleRef.current?.stop();
    };
    // Mount-only: re-running would tear down and restart the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tap the preview to focus there. */
  const focusAtPoint = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    setFocusAt({ x, y, at: Date.now() });
    tapLight();
    void handleRef.current?.focus(x, y);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Scan a barcode"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-border-strong bg-bg p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-display text-sm font-extrabold">Scan a barcode</span>
          <button type="button" onClick={onClose} aria-label="Close scanner" className="text-muted">
            <X className="size-4" />
          </button>
        </div>

        <div
          className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#111]"
          onClick={focusAtPoint}
        >
          <video ref={videoRef} playsInline muted className="size-full object-cover" />

          {/* A frame to aim with. The decoder reads the whole frame, so this is
              a guide rather than a crop — but "point at a barcode" with nothing
              on screen to point at is not an instruction. */}
          <div className="pointer-events-none absolute inset-x-8 inset-y-1/4 rounded-xl border-2 border-white/70" />

          {focusAt && Date.now() - focusAt.at < 1200 && (
            <span
              key={focusAt.at}
              aria-hidden
              className="pointer-events-none absolute size-12 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-lg border-2 border-accent"
              style={{ left: `${focusAt.x * 100}%`, top: `${focusAt.y * 100}%` }}
            />
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2">
            {/* Both controls sit on the preview, where a camera app puts them,
                and each is hidden when this device cannot do it rather than
                offering a button that silently does nothing. */}
            {caps.focus ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  tapLight();
                  void handleRef.current?.focus();
                  setStatus("Refocusing…");
                  setTimeout(() => setStatus((s) => (s === "Refocusing…" ? "Scanning…" : s)), 700);
                }}
                className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1.5 text-[0.65rem] font-bold text-white backdrop-blur"
              >
                <Crosshair className="size-3.5" /> Focus
              </button>
            ) : (
              <span />
            )}

            {caps.zoom && (
              <div className="flex items-center gap-0.5 rounded-full bg-black/60 p-0.5 backdrop-blur">
                {([0.5, 1] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      tapLight();
                      setZoom(z);
                      void handleRef.current?.setZoom(z);
                    }}
                    className={cn(
                      "h-7 min-w-9 rounded-full px-2 text-[0.65rem] font-extrabold transition-colors",
                      zoom === z ? "bg-white text-black" : "text-white",
                    )}
                  >
                    {z}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-[2.2em] py-1.5 text-center text-[0.72rem] font-bold text-info">
          {status}
        </div>
        <p className="mb-2 text-center text-[0.6rem] text-faint">
          Tap the picture to focus where you tapped.
        </p>

        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            placeholder="Or type the barcode"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button variant="primary" onClick={() => manual.trim() && void resolve(manual.trim())}>
            Look up
          </Button>
        </div>
      </div>
    </div>
  );
}
