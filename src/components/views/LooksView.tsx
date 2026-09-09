import { useState } from "react";
import { ArrowUpRight, Scan } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { parseAether, scanTitle } from "@/lib/aether-import";
import { agoLabel } from "@/lib/last-time";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";

/**
 * The face and posture measurements, kept here and captured in Aether.
 *
 * Aether is a separate app for a real reason rather than a lack of ambition:
 * it is a camera pipeline with a MediaPipe WASM model behind it, megabytes
 * loaded for something used weekly, inside an app opened five times a day —
 * and a failure in face landmarking must not be able to take down the workout
 * logger. So the capture lives there and the NUMBERS live here, where the rest
 * of the body data is, where the calendar can mark them and the backup carries
 * them.
 *
 * What this deliberately does not do is compute anything. Evenness and CVA are
 * typed in from a scan, not derived here, because deriving them needs the
 * gating, the pose normalisation and the reflect-relabel step that Aether does
 * properly. A number invented on this screen would look identical to a measured
 * one and mean nothing.
 */

const AETHER_URL = "https://github.com/aminoulogie/aether-os";

export function LooksView() {
  const mind = useSoma((s) => s.mind);
  const addMind = useSoma((s) => s.addMind);
  const removeMind = useSoma((s) => s.removeMind);
  const restoreMind = useSoma((s) => s.restoreMind);

  const today = getLocalDateKey(new Date());
  const [evenness, setEvenness] = useState("");
  const [cva, setCva] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);

  // Scans ride in the mind log under a reserved title prefix rather than in a
  // store of their own. Another top-level collection would be another thing to
  // remember at backup time, and forgetting four of those is what the
  // side-stores work existed to fix.
  const scans = mind
    .filter((m) => m.kind === "idea" && m.title.startsWith("Scan · "))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = scans[0];

  const save = () => {
    const e = Number(String(evenness).replace(",", "."));
    const c = Number(String(cva).replace(",", "."));
    const hasE = Number.isFinite(e) && e > 0 && e <= 100;
    const hasC = Number.isFinite(c) && c > 0 && c < 180;
    if (!hasE && !hasC) {
      toast.error("Enter an evenness or a CVA reading.");
      return;
    }
    const parts = [hasE ? `evenness ${e}` : null, hasC ? `CVA ${c}°` : null].filter(Boolean);
    addMind({ date: today, kind: "idea", title: `Scan · ${parts.join(" · ")}`, takeaway: undefined });
    setEvenness("");
    setCva("");
    toast.success("Scan recorded");
  };

  return (
    <div className="space-y-3 pb-4">
      <Card>
        <CardTitle>Latest scan</CardTitle>
        {latest ? (
          <>
            <div className="font-display text-lg font-extrabold">
              {latest.title.replace("Scan · ", "")}
            </div>
            <div className="text-xs text-muted">{agoLabel(latest.date, today)}</div>
          </>
        ) : (
          <p className="text-xs text-faint">
            Nothing recorded yet. Capture in Aether, then type the readings here.
          </p>
        )}
        <p className="mt-2 text-[0.68rem] leading-snug text-faint">
          Evenness is a shape reading under one pose, not a rating. CVA is estimated from a
          side photo — C7 is inferred, not palpated.
        </p>
      </Card>

      <Card>
        <CardTitle>Capture</CardTitle>
        <p className="mb-2 text-[0.7rem] leading-snug text-faint">
          Scanning happens in Aether — front, 45°, profile, with the alignment and lighting
          gates. It is a separate app because a camera model that size has no business
          loading every time you open your food diary.
        </p>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => window.open(AETHER_URL, "_blank", "noopener,noreferrer")}
        >
          <Scan className="size-4" /> Open Aether <ArrowUpRight className="size-3.5" />
        </Button>
      </Card>

      <Card>
        <CardTitle>Import from Aether</CardTitle>
        <p className="mb-2 text-[0.7rem] leading-snug text-faint">
          Pick a JSON export and a run of scans lands here at once, instead of retyping two
          numbers off another screen. A row with a date but no reading is skipped rather
          than imported blank, and a reading outside its range is refused rather than
          clamped — a CVA of 400° is a unit error, not a posture.
        </p>
        <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface-2 text-sm font-semibold">
          Choose export file
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void file.text().then((raw) => {
                const parsed = parseAether(raw);
                if (parsed.reason) {
                  toast.error(parsed.reason);
                  return;
                }
                // Existing dates are left alone: an import must not overwrite a
                // reading already recorded, only fill the days without one.
                const have = new Set(scans.map((sc) => sc.date));
                let added = 0;
                for (const scan of parsed.scans) {
                  if (have.has(scan.date)) continue;
                  addMind({ date: scan.date, kind: "idea", title: scanTitle(scan) });
                  have.add(scan.date);
                  added++;
                }
                const skipped = parsed.skipped + (parsed.scans.length - added);
                toast.success(
                  `Imported ${added} scan${added === 1 ? "" : "s"}` +
                    (skipped ? ` · ${skipped} skipped or already here` : ""),
                );
              });
            }}
          />
        </label>
        <details className="mt-2">
          <summary className="cursor-pointer text-[0.68rem] font-bold text-accent-text">
            What the file has to look like
          </summary>
          <pre className="mt-1.5 overflow-x-auto rounded-xl border border-border bg-surface-2 p-2.5 text-[0.6rem] leading-relaxed text-muted">
{`{ "scans": [
    { "date": "2026-09-08",
      "evenness": 94.2,   // or "alpha": 0.058
      "cva": 52.4 }
] }`}
          </pre>
          <p className="mt-1 text-[0.65rem] leading-snug text-faint">
            A bare array works too, as does a wrapper with the list under
            &quot;data&quot;. Aether needs an exporter written on its side that emits this —
            it does not have one yet.
          </p>
        </details>
      </Card>

      <Card>
        <CardTitle>Record a reading</CardTitle>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              Evenness
            </label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="—"
              className="text-center"
              value={evenness}
              onChange={(e) => setEvenness(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">
              CVA degrees
            </label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="—"
              className="text-center"
              value={cva}
              onChange={(e) => setCva(e.target.value)}
            />
          </div>
        </div>
        <Button className="w-full" onClick={save}>
          Save today&apos;s reading
        </Button>
      </Card>

      <Card>
        <CardTitle>{scans.length ? `${scans.length} recorded` : "No history"}</CardTitle>
        {scans.length === 0 ? (
          <p className="py-2 text-center text-xs text-faint">
            Readings you save appear here and on the calendar.
          </p>
        ) : (
          <div className="space-y-1.5">
            {scans.slice(0, 30).map((sc) => (
              <SwipeRow
                key={sc.id}
                id={sc.id}
                openId={swiped}
                setOpenId={setSwiped}
                onDelete={() => {
                  const index = mind.findIndex((x) => x.id === sc.id);
                  removeMind(sc.id);
                  toast.success("Removed", {
                    action: { label: "Undo", onClick: () => restoreMind(index, sc) },
                  });
                }}
              >
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <span className="truncate text-sm font-bold">
                    {sc.title.replace("Scan · ", "")}
                  </span>
                  <span className="shrink-0 text-[0.7rem] text-faint">{sc.date}</span>
                </div>
              </SwipeRow>
            ))}
          </div>
        )}
      </Card>

      <p className="px-1 text-center text-[0.7rem] leading-relaxed text-faint">
        Shape is landmarks. Projection is fat, light and lens. Carriage is how the skull is
        aimed. None of them is a score, and no drill changes adult bone.
      </p>
    </div>
  );
}
