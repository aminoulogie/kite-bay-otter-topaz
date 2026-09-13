import { useCallback, useState } from "react";
import { toast } from "sonner";
import { buildBackup, saveBackupFile } from "@/lib/backup";
import { markBackedUp } from "@/lib/storage-health";
import { useSoma } from "@/lib/store";

/**
 * Writing the backup file, from wherever the user asked for it.
 *
 * This lived inside SettingsView, which was fine while Setup was the only door
 * to it. It is now also on the header of every tab, and two copies of "build
 * the file, name it, hand it over, record that it happened" is two places for
 * the date format to drift or for `markBackedUp` to be forgotten — and the
 * consequence of forgetting it is the app quietly believing a backup is
 * overdue when one was taken a minute ago.
 *
 * The whole thing is one call because none of the steps are optional. Building
 * the JSON without saving it does nothing; saving without marking leaves the
 * warning up; marking without saving is a lie.
 */
export function useBackupDownload(onSaved?: () => void): {
  busy: boolean;
  download: () => Promise<void>;
} {
  const exportJson = useSoma((s) => s.exportJson);
  const [busy, setBusy] = useState(false);

  const download = useCallback(async () => {
    // Guarded rather than queued: the file can be tens of megabytes with
    // photos in it, and a second press while the first is still reading
    // IndexedDB would build the whole thing twice.
    if (busy) return;
    setBusy(true);
    try {
      const backup = await buildBackup(JSON.parse(exportJson()));
      const json = JSON.stringify(backup);
      const name = `soma-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const how = await saveBackupFile(json, name);
      markBackedUp();
      onSaved?.();
      const mb = (json.length / 1048576).toFixed(1);
      toast.success(
        how === "shared"
          ? `Backup ready to save (${mb} MB, ${backup.photos.length} photos)`
          : `Downloaded ${name} (${mb} MB)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the backup.");
    } finally {
      setBusy(false);
    }
  }, [busy, exportJson, onSaved]);

  return { busy, download };
}
