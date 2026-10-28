import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  forgetNotesVault, mirrorNotes, pickNotesVault, storedNotesVault, supportsNotesVault,
} from "@/lib/notes-vault";
import { useSoma } from "@/lib/store";

/**
 * Settings > Notes vault: the Obsidian folder this device mirrors (see
 * lib/notes-vault.ts). The mirror itself runs every minute from
 * useNotesVaultLoop, mounted with the app.
 */
export function NotesVaultSettings() {
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string>("");
  const count = useSoma((s) => s.notes.length);

  useEffect(() => {
    void storedNotesVault().then(setHandle);
  }, []);

  const run = async (h: FileSystemDirectoryHandle) => {
    setBusy(true);
    try {
      const r = await mirrorNotes(h);
      setLast(`${new Date().toLocaleTimeString()} · ${r.read} in, ${r.written} out${r.todos ? `, ${r.todos} to-dos` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the vault.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle>Notes vault</CardTitle>
      {!supportsNotesVault() ? (
        <p className="text-xs text-muted">Connect the vault from SOMA on the PC: this device can't hold a folder open.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            Pick your Obsidian vault folder (in iCloud Drive, so Obsidian on the iPhone keeps it too). Its notes
            reach the Margin tablet through sync, edits there come back as files, and SOMA keeps a daily note, a
            weekly review and a page for each goal. Checkboxes written in any note become to-dos. Runs every
            minute while SOMA is open here.
          </p>
          {handle ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Connected to <b className="text-fg">{handle.name}</b> · {count} notes{last && ` · ${last}`}
              </p>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void run(handle)}>
                  {busy ? "Syncing…" : "Sync now"}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    void forgetNotesVault();
                    setHandle(null);
                  }}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              className="w-full"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  try {
                    const h = await pickNotesVault();
                    setHandle(h);
                    await run(h);
                  } catch (err) {
                    if (err instanceof DOMException && err.name === "AbortError") return;
                    toast.error(err instanceof Error ? err.message : "Could not open that folder.");
                  }
                })();
              }}
            >
              Choose Obsidian vault
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
