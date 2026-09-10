import { useMemo, useState } from "react";
import { Printer, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { buildReport } from "@/lib/report";
import { SomaIntelligenceEngine, getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

const WINDOWS = [7, 28, 90] as const;

/**
 * The report, on screen and on paper.
 *
 * Everything in this app is local by design, and the one cost of that is
 * having no way to show anyone what you did — not a coach, not a training
 * partner, not yourself in a year once the phone has been replaced.
 *
 * Print is the export. iOS's print sheet offers "Save to Files" as a PDF and
 * AirDrop from the same panel, so one button is a PDF writer and a share sheet
 * at once, for no dependency and no network. A PDF library would be several
 * hundred kilobytes to do the job worse and to need updating.
 *
 * The share button carries the one-line summary instead, because a share sheet
 * cannot take a layout and a wall of unformatted numbers helps nobody.
 */
export function ReportSheet({ onClose }: { onClose: () => void }) {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const settings = useSoma((s) => s.settings);
  const [days, setDays] = useState<number>(28);

  const report = useMemo(
    () =>
      buildReport({
        today: getLocalDateKey(new Date()),
        days,
        history,
        nutrition,
        unit: settings.unit,
        estimate1RM: (w, r) => SomaIntelligenceEngine.calculate1RM(w, r),
      }),
    [days, history, nutrition, settings.unit],
  );

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "SOMA", text: report.summary });
        return;
      }
      await navigator.clipboard?.writeText(report.summary);
      toast.success("Summary copied");
    } catch (err) {
      // A cancelled share is a decision, not a failure worth a toast.
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Could not share that.");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between border-b border-border px-4 pb-3 print:hidden">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-extrabold">Report</div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-faint">
            {report.from} → {report.to}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex gap-1.5 print:hidden">
          {WINDOWS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              className={cn(
                "h-9 flex-1 rounded-xl border text-xs font-bold",
                days === n ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2",
              )}
            >
              {n} days
            </button>
          ))}
        </div>

        {/* The printed page. Everything outside it is marked print:hidden. */}
        <div id="soma-report" className="space-y-3">
          <div className="hidden print:block">
            <h1 className="font-display text-xl font-extrabold">SOMA · {report.days} days</h1>
            <p className="text-xs">
              {report.from} to {report.to}
            </p>
          </div>

          {report.sections.map((section) => (
            <Card key={section.title}>
              <CardTitle>{section.title}</CardTitle>
              {section.empty ? (
                <p className="text-xs leading-snug text-faint">{section.empty}</p>
              ) : (
                <div className="space-y-1.5">
                  {section.lines.map((line) => (
                    <div key={line.label} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">{line.label}</span>
                      <span className="shrink-0 text-right">
                        <span className="text-sm font-bold tabular">{line.value}</span>
                        {line.note && (
                          <span className="block text-[0.62rem] text-faint">{line.note}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}

          <p className="px-1 text-[0.6rem] leading-relaxed text-faint">
            Figures come from what was logged, over the days it was logged on. Averages
            never divide by days you recorded nothing.
          </p>
        </div>

        <div className="mt-3 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-extrabold text-accent-ink"
          >
            <Printer className="size-4" />
            Save as PDF
          </button>
          <button
            type="button"
            onClick={() => void share()}
            aria-label="Share the summary"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-2"
          >
            <Share2 className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[0.62rem] leading-snug text-faint print:hidden">
          Save as PDF opens the print sheet — from there iOS offers Save to Files, AirDrop
          and printing. Nothing leaves the phone unless you send it.
        </p>
      </div>
    </div>
  );
}
