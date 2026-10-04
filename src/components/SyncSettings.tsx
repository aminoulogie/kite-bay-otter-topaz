import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { newSecret, secretToCode } from "@/lib/sync/crypto";
import { DEFAULT_SYNC_URL, syncEngine } from "@/lib/sync/app";
import type { SyncMeta } from "@/lib/sync/engine";
import { cn } from "@/lib/utils";

function useMeta(): SyncMeta | null {
  const [meta, setMeta] = useState(() => syncEngine.meta());
  useEffect(() => {
    const on = () => setMeta(syncEngine.meta());
    window.addEventListener("soma-sync-meta", on);
    return () => window.removeEventListener("soma-sync-meta", on);
  }, []);
  return meta;
}

const field = "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm";

/**
 * End-to-end encrypted sync between your devices. See lib/sync/ for how:
 * the server only ever holds data it cannot read.
 */
export function SyncSettings() {
  const meta = useMeta();
  const [mode, setMode] = useState<"idle" | "create" | "join">("idle");
  const [url, setUrl] = useState(DEFAULT_SYNC_URL);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const start = async (how: "create" | "join") => {
    if (!/^(https:\/\/|http:\/\/localhost)/.test(url.trim())) {
      toast.error("Paste the server address (it starts with https://).");
      return;
    }
    setBusy(true);
    try {
      await syncEngine.enable(url, code, how);
      toast.success(how === "create" ? "Sync is on — keep the recovery code safe" : "Joined — this device now has your data");
      setMode("idle");
      setShowCode(how === "create");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start sync");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle>Device sync</CardTitle>
      <p className="mb-3 text-xs text-muted">
        Keeps this phone and your PC in step. Everything is locked on the device before it leaves, with a key
        only your devices have — the server stores data it cannot read.
      </p>

      {meta ? (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3">
            <span className="text-muted">Status</span>
            <span className={cn("truncate font-bold", meta.lastError ? "text-warn" : "text-emerald-400")}>
              {meta.lastError
                ? meta.lastError
                : meta.lastSync
                  ? `Synced ${new Date(meta.lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Starting…"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void syncEngine.sync().then(() => toast.success("Synced"))}
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 font-bold"
            >
              Sync now
            </button>
            <button
              type="button"
              onClick={() => setShowCode((s) => !s)}
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 font-bold"
            >
              {showCode ? "Hide recovery code" : "Show recovery code"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Stop syncing this device? Its data stays here; it just stops sending and receiving.")) {
                  syncEngine.disable();
                }
              }}
              className="rounded-full px-3 py-1.5 text-muted underline decoration-dotted underline-offset-2"
            >
              Turn off on this device
            </button>
          </div>
          {showCode && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3">
              <p className="mb-1 font-bold text-warn">Recovery code — the only key to your data</p>
              <p className="select-all break-all font-mono text-sm tracking-wide">{meta.code}</p>
              <p className="mt-1 text-faint">
                Type it on your PC to join. Write it down somewhere safe: lose every device and this code and the
                synced copy cannot be opened by anyone, including me.
              </p>
            </div>
          )}
          <p className="text-faint">Server: {meta.url}</p>
        </div>
      ) : mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCode(secretToCode(newSecret()));
              setMode("create");
            }}
            className="rounded-full bg-accent px-4 py-2 text-xs font-extrabold text-accent-ink"
          >
            Set up on this device
          </button>
          <button
            type="button"
            onClick={() => {
              setCode("");
              setMode("join");
            }}
            className="rounded-full border border-border bg-surface-2 px-4 py-2 text-xs font-bold"
          >
            Join with a recovery code
          </button>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <label className="block">
            <span className="mb-1 block text-muted">Server address</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://soma-sync.….workers.dev" className={field} />
          </label>
          {mode === "create" ? (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3">
              <p className="mb-1 font-bold text-warn">Your recovery code</p>
              <p className="select-all break-all font-mono text-sm tracking-wide">{code}</p>
              <p className="mt-1 text-faint">
                Save it before you continue. Your other devices join with it, and it is the only way back in.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-muted">Recovery code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-…" className={cn(field, "font-mono")} />
              <span className="mt-1 block text-faint">This device's synced data is replaced by your vault's.</span>
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void start(mode)}
              className="rounded-full bg-accent px-4 py-2 font-extrabold text-accent-ink disabled:opacity-50"
            >
              {busy ? "Working…" : mode === "create" ? "I saved it — start syncing" : "Join"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="px-3 text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
