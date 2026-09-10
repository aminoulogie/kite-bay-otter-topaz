import { useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { captureImage, deletePhoto, getPhoto, savePhoto } from "@/lib/habit-photos";

/** One id for every plate photo; the date is the other half of the key. */
const PLATE_ID = "plate";

/**
 * A photograph of what you actually ate.
 *
 * Nothing here estimates calories from the picture. There are apps that claim
 * to and they are wrong by a wide margin on exactly the food this user eats —
 * a home-cooked Maghrebi plate is not in anybody's training set, and a
 * confident wrong number is worse than no number, because it goes into the
 * log and then into every estimate downstream.
 *
 * What a photo is genuinely good for is the thing no macro breakdown captures:
 * looking back at a week and seeing what the days you felt best actually
 * looked like. So it sits beside the numbers rather than pretending to be
 * them, and it reuses the photo store the habits and measurements already use
 * — which means it is in the backup from the day it ships.
 */
export function PlatePhoto({ date }: { date: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    void getPhoto(PLATE_ID, date).then((row) => {
      if (!alive || !row) return;
      made = URL.createObjectURL(row.display);
      setUrl(made);
    });
    return () => {
      alive = false;
      // Revoked on the way out, or every date change leaks a blob URL.
      if (made) URL.revokeObjectURL(made);
    };
  }, [date]);

  const shoot = async () => {
    setBusy(true);
    try {
      const file = await captureImage();
      if (!file) return;
      const row = await savePhoto(PLATE_ID, date, file);
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(row.display);
      });
      toast.success("Plate saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">Plate</CardTitle>
        <div className="flex shrink-0 gap-1.5">
          {url && (
            <button
              type="button"
              aria-label="Delete plate photo"
              onClick={() => {
                void deletePhoto(PLATE_ID, date).then(() => {
                  setUrl((old) => {
                    if (old) URL.revokeObjectURL(old);
                    return null;
                  });
                  toast.success("Photo removed");
                });
              }}
              className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            aria-label="Photograph the plate"
            onClick={() => void shoot()}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted"
          >
            <Camera className="size-4" />
          </button>
        </div>
      </div>

      {url ? (
        <img src={url} alt={`Plate on ${date}`} className="w-full rounded-xl object-cover" />
      ) : (
        <p className="text-xs leading-snug text-faint">
          A photo of the plate, kept beside the numbers. It is not read for calories — an
          app that guesses macros off a picture would be confidently wrong about most of
          what you cook, and a wrong number in the log poisons every estimate after it.
        </p>
      )}
    </Card>
  );
}
