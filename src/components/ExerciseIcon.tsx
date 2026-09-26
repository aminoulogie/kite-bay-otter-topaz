import { useEffect, useMemo, useState } from "react";
import { exercisePhotoBlob } from "@/lib/habit-photos";
import { BASE_EXERCISE_DB } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { ExerciseDef } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * An exercise's face: the user's photo when one is set (an iOS-icon square,
 * rounded), otherwise an initial tile — plus its S/A tier badge. Shown next
 * to the name everywhere the exercise appears, so a session row and the
 * Settings list can never disagree about what an exercise looks like.
 */

export function tierColour(tier: string): string | null {
  const t = tier.toLowerCase();
  if (t.startsWith("s")) return "#f5c542"; // S — gold
  if (t.startsWith("a")) return "#7fb4ff"; // A — steel blue
  return null;
}

export function ExerciseIcon({ name, size = 34 }: { name: string; size?: number }) {
  // Raw state, not s.allExercises() — that method rebuilds its array on
  // every call, so calling it inside a selector reruns the merge on every
  // store change and is the exact shape of the crash that took the app down
  // twice (see selector-identity.test.ts). Customs win over the base
  // database by name, same rule allExercises() itself uses.
  const customs = useSoma((s) => s.customExercises);
  const def = useMemo(
    () =>
      customs.find((e) => e.name === name) ??
      (BASE_EXERCISE_DB as ExerciseDef[]).find((e) => e.name === name),
    [customs, name],
  );
  const photoId = def?.photoId;
  const remote = def?.img;
  const tier = def?.tier ?? "";
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!photoId) return;
    void exercisePhotoBlob(photoId).then((b) => {
      if (!alive || !b) return;
      const u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url revoke is best-effort
  }, [photoId]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  const badge = tierColour(tier);
  // The user's own photo wins; until it loads (or when there is none), the
  // site's picture shows, and only then the initials.
  const src = url ?? remote ?? null;

  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[22%] border border-border"
      style={{ width: size, height: size, background: "var(--color-surface-2)" }}
      aria-hidden
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display font-extrabold" style={{ fontSize: size * 0.34, color: "var(--color-fg)" }}>
          {initials}
        </span>
      )}
      {badge && (
        <span
          className={cn("absolute bottom-0 right-0 grid place-items-center rounded-tl-[30%] font-display font-extrabold")}
          style={{
            width: Math.max(9, size * 0.42),
            height: Math.max(9, size * 0.42),
            fontSize: Math.max(7, size * 0.24),
            background: badge,
            color: "#141210",
          }}
        >
          {tier[0]?.toUpperCase()}
        </span>
      )}
    </span>
  );
}
