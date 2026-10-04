import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { MoneySheet } from "@/components/money/money-ui";
import { formatMinutes, parseDuration } from "@/lib/screen-time";
import { parseScreenTimeText, type ScreenImport } from "@/lib/screen-time-import";
import { startScreenTimeLink } from "@/lib/native/screen-time-link";
import { tapSuccess } from "@/lib/haptics";
import { addDays, getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * What the Screen Time shortcut sent, shown once to confirm before it is
 * saved: OCR is good, not perfect, and a wrong number should cost one tap.
 */
export function ScreenTimeImport() {
  const [got, setGot] = useState<ScreenImport | null>(null);

  useEffect(
    () =>
      startScreenTimeLink((text) => {
        const r = parseScreenTimeText(text);
        if (!r) {
          toast.error("Couldn't find Screen Time in that screenshot — open Settings → Screen Time first.");
          return;
        }
        setGot(r);
      }),
    [],
  );

  if (!got) return null;
  return <ImportSheet data={got} onClose={() => setGot(null)} />;
}

function ImportSheet({ data, onClose }: { data: ScreenImport; onClose: () => void }) {
  const logScreenTime = useSoma((s) => s.logScreenTime);
  const today = getLocalDateKey();
  const yesterday = getLocalDateKey(addDays(new Date(), -1));
  const [date, setDate] = useState(data.yesterday ? yesterday : today);
  const [draft, setDraft] = useState(formatMinutes(data.total));
  const total = parseDuration(draft);

  const save = () => {
    if (total == null) return;
    logScreenTime(date, {
      total,
      apps: data.apps.length ? data.apps : undefined,
      pickups: data.pickups,
    });
    tapSuccess();
    toast.success(`Screen time saved — ${formatMinutes(total)}`);
    onClose();
  };

  return (
    <MoneySheet title="Screen Time" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#5e5ce6]/20 text-[#8e8cff]">
            <Smartphone className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.62rem] font-bold uppercase tracking-wider text-faint">From your shortcut</div>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Total screen time"
              className="w-full bg-transparent font-display text-2xl font-extrabold tabular outline-none"
            />
          </div>
        </div>
        {data.average && (
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
            That was the week view, so this is a daily average. Switch Screen Time to “Day” for one day's number.
          </p>
        )}

        <div className="flex gap-2">
          {[
            { d: today, label: "Today" },
            { d: yesterday, label: "Yesterday" },
          ].map((o) => (
            <button
              key={o.d}
              type="button"
              onClick={() => setDate(o.d)}
              className={cn(
                "flex-1 rounded-full py-2 text-xs font-bold",
                date === o.d ? "bg-fg text-bg" : "bg-surface-2 text-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {(data.apps.length > 0 || data.pickups != null) && (
          <div className="rounded-2xl border border-border bg-surface p-3">
            {data.apps.map((a) => (
              <div key={a.name} className="flex justify-between py-1 text-sm">
                <span className="truncate font-semibold">{a.name}</span>
                <span className="tabular text-muted">{formatMinutes(a.min)}</span>
              </div>
            ))}
            {data.pickups != null && (
              <div className="flex justify-between border-t border-border pt-1.5 text-sm">
                <span className="font-semibold">Pickups</span>
                <span className="tabular text-muted">{data.pickups}</span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={total == null}
          className="h-12 w-full rounded-2xl bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </MoneySheet>
  );
}
