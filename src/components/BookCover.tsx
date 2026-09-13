import { useEffect, useState } from "react";
import { getPhoto } from "@/lib/habit-photos";
import { coverKey } from "@/lib/shelf";
import { coverSource, coverWords, hueFor } from "@/lib/shelf";
import { cn } from "@/lib/utils";
import type { MindEntry } from "@/lib/types";

/**
 * A book, drawn as a book.
 *
 * Three sources, in order of how much they can be trusted: the bytes stored in
 * the photo database, then the remote link, then artwork drawn from the title
 * itself. The middle one exists because an `<img>` will render cross-origin
 * art that a `fetch` is not allowed to read — so a cover can be on the shelf
 * even when the app was never permitted to save it, which is why the shelf was
 * showing blank rectangles for books that plainly have covers.
 *
 * The drawn fallback is not a placeholder in the apologetic sense. A shelf of
 * grey rectangles looks broken; a shelf of coloured spines looks like a shelf,
 * and the colour is derived from the title so it never changes under you.
 */
export function BookCover({
  book, className, rounded = "rounded-lg",
}: {
  book: MindEntry;
  className?: string;
  rounded?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void getPhoto(coverKey(book.id), book.date).then((row) => {
      if (!alive || !row) return;
      made = URL.createObjectURL(row.display);
      setLocal(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [book.id, book.date, book.sourceKey]);

  const src = coverSource(local, remoteFailed ? undefined : book.coverUrl);
  const hue = hueFor(book.title);

  return (
    <div
      className={cn(
        "relative isolate aspect-[2/3] w-full overflow-hidden bg-surface-3 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.65)]",
        rounded,
        className,
      )}
    >
      {src.kind === "drawn" ? (
        <div
          className="flex size-full flex-col justify-end p-2"
          style={{
            background: `linear-gradient(160deg, hsl(${hue} 48% 34%), hsl(${(hue + 40) % 360} 44% 18%))`,
          }}
        >
          <span className="font-display text-[0.72rem] font-extrabold leading-tight text-white/95 [text-wrap:balance]">
            {coverWords(book.title).join(" ")}
          </span>
          {book.author && (
            <span className="mt-0.5 truncate text-[0.55rem] font-bold text-white/60">
              {book.author}
            </span>
          )}
        </div>
      ) : (
        <img
          src={src.url}
          alt=""
          loading="lazy"
          onError={() => setRemoteFailed(true)}
          className="size-full object-cover"
        />
      )}

      {/* The spine. A flat rectangle reads as a thumbnail; this reads as a
          book, which is the entire difference between a shelf and a table. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
    </div>
  );
}
