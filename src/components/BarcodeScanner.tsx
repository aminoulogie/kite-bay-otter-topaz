import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupBarcode, startScanner, type ProductHit, type ScanHandle } from "@/lib/barcode";

/**
 * Full-screen scanner. Always offers manual entry alongside the camera —
 * permission can be refused, the light can be bad, and a barcode can be
 * creased; without a fallback those all become dead ends.
 */
export function BarcodeScanner({
  onFound,
  onClose,
}: {
  onFound: (hit: ProductHit) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScanHandle | null>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [manual, setManual] = useState("");

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
      setStatus((s) => (s === "Starting camera…" ? "Scanning…" : s));
    });

    return () => {
      alive = false;
      handleRef.current?.stop();
    };
    // Mount-only: re-running would tear down and restart the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black p-4 pt-[max(56px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="absolute inset-x-4 top-[max(10px,env(safe-area-inset-top))] flex items-center justify-between text-sm font-bold text-muted">
        <span>Point at a barcode</span>
        <button type="button" onClick={onClose} aria-label="Close scanner">
          <X className="size-5" />
        </button>
      </div>

      <video ref={videoRef} playsInline muted className="max-h-[52vh] w-full rounded-2xl bg-[#111] object-cover" />

      <div className="min-h-[2.4em] text-center text-sm font-bold text-info">{status}</div>

      <div className="flex w-full gap-2">
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
  );
}
