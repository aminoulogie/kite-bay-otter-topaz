import { useRef, useState } from "react";
import { HeartPulse, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import {
  parseHealthFile, planMerge, type HealthImport, type MergePlan,
} from "@/lib/health-import";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Read in chunks so a 200MB export never sits in memory whole. */
const CHUNK = 4 * 1024 * 1024;

/**
 * Apple Health, by way of a file.
 *
 * A live HealthKit connection needs an entitlement a FREE Apple ID cannot be
 * granted, and this app is installed by signing an unsigned .ipa with exactly
 * that. So the plugin route does not produce a working feature — it produces a
 * build that refuses to install or fails silently.
 *
 * What does work needs nobody's permission: Health → your photo → Export All
 * Health Data gives you `export.xml`, and that file holds the two things this
 * app actually wants. Any CSV with a date column works too, for data that came
 * from somewhere else.
 *
 * The import is previewed before it writes. A restore that silently rewrote a
 * year of weigh-ins would be indistinguishable from a bug.
 */
export function HealthImportCard() {
  const nutrition = useSoma((s) => s.nutrition);
  const patchDay = useSoma((s) => s.patchDay);
  const ensureDay = useSoma((s) => s.ensureDay);

  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<HealthImport | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [overwrite, setOverwrite] = useState(false);

  /**
   * Read the file a few megabytes at a time, keeping only the tail of the last
   * chunk so a record split across a boundary is not lost.
   */
  const read = async (f: File) => {
    setBusy(true);
    try {
      let carry = "";
      const merged: HealthImport = { days: [], weights: 0, nights: 0, skipped: 0 };
      const byDate = new Map<string, { date: string; weightKg?: number; sleepHours?: number }>();

      for (let at = 0; at < f.size; at += CHUNK) {
        const text = carry + (await f.slice(at, at + CHUNK).text());
        const cut = text.lastIndexOf("\n");
        const whole = cut >= 0 && at + CHUNK < f.size ? text.slice(0, cut) : text;
        carry = cut >= 0 && at + CHUNK < f.size ? text.slice(cut + 1) : "";

        const part = parseHealthFile(whole);
        merged.weights += part.weights;
        merged.nights += part.nights;
        merged.skipped += part.skipped;
        for (const d of part.days) {
          const row = byDate.get(d.date) ?? { date: d.date };
          if (d.weightKg !== undefined) row.weightKg = d.weightKg;
          if (d.sleepHours !== undefined) row.sleepHours = d.sleepHours;
          byDate.set(d.date, row);
        }
      }

      merged.days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
      setFound(merged);
      setPlan(planMerge(merged.days, nutrition, overwrite));
      if (!merged.days.length) toast.error("No weight or sleep records in that file.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!plan?.changes.length) return;
    for (const change of plan.changes) {
      ensureDay(change.date);
      const day = useSoma.getState().nutrition[change.date];
      const patch: Record<string, unknown> = {};
      if (change.weightKg !== undefined) patch.bodyWeight = change.weightKg;
      if (change.sleepHours !== undefined) {
        // Quality is left alone: Health does not record one, and inventing a 3
        // would put a number nobody entered into the readiness blend.
        patch.sleep = { ...(day?.sleep ?? {}), hours: change.sleepHours };
      }
      patchDay(change.date, patch);
    }
    toast.success(`${plan.changes.length} days updated`);
    setFound(null);
    setPlan(null);
  };

  return (
    <Card>
      <CardTitle>
        <span className="inline-flex items-center gap-1.5">
          <HeartPulse className="size-3.5" />
          Import from Apple Health
        </span>
      </CardTitle>

      <p className="mb-2 text-[0.7rem] leading-snug text-faint">
        On your phone: Health → your photo, top right → <b>Export All Health Data</b>. Unzip
        it and pick <code>export.xml</code>. Weight and sleep come across; nothing is sent
        anywhere. A CSV with a date column works too.
      </p>

      <input
        ref={file}
        type="file"
        accept=".xml,.csv,.txt,text/xml,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void read(f);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => file.current?.click()}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm font-bold disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Reading…" : "Choose a file"}
      </button>

      {found && (
        <>
          <div className="mb-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs">
            <div className="font-bold">
              {found.weights} weigh-in{found.weights === 1 ? "" : "s"} · {found.nights} night
              {found.nights === 1 ? "" : "s"} of sleep
            </div>
            <div className="mt-0.5 text-[0.68rem] text-faint">
              {found.days.length
                ? `${found.days[0]!.date} to ${found.days[found.days.length - 1]!.date}`
                : "nothing usable"}
              {found.skipped > 0 ? ` · ${found.skipped} unreadable records skipped` : ""}
            </div>
          </div>

          {/* Off by default. You stood on the scale; Health only heard about it. */}
          <button
            type="button"
            onClick={() => {
              const next = !overwrite;
              setOverwrite(next);
              setPlan(planMerge(found.days, nutrition, next));
            }}
            className="mb-2 flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-[5px] border-2",
                overwrite ? "border-danger bg-danger" : "border-border",
              )}
            />
            <span className="text-xs font-bold">
              Replace what I logged myself
              <span className="block text-[0.65rem] font-normal text-faint">
                Off: the import only fills gaps. {plan?.kept ?? 0} of your own entries would be
                kept.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={apply}
            disabled={!plan?.changes.length}
            className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-extrabold text-accent-ink disabled:opacity-40"
          >
            {plan?.changes.length
              ? `Import ${plan.changes.length} day${plan.changes.length === 1 ? "" : "s"}`
              : "Nothing new to import"}
          </button>
        </>
      )}
    </Card>
  );
}
