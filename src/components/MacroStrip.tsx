import { cn } from "@/lib/utils";

/**
 * Calories and the three macros, colour-coded.
 *
 * The old row said "525 kcal · 18.8p 108.8c 2.3f" — a run of numbers where
 * the only thing telling you which was which was a single letter you had to
 * read. Scanning a day of food meant reading every character.
 *
 * A colour per quantity, kept in one place so it means the same thing on
 * every screen. The bar is a small rounded rule rather than a chip or a dot:
 * a filled shape at this size competes with the number beside it, and the
 * number is the thing being read.
 */
export const MACRO_COLOR = {
  cals: "#f59e0b",
  p: "#a3e635",
  f: "#ef4444",
  c: "#3b82f6",
} as const;

export const MACRO_LABEL = {
  cals: "calories",
  p: "protein",
  f: "fat",
  c: "carbohydrate",
} as const;

export type MacroKey = keyof typeof MACRO_COLOR;

export function MacroStrip({
  cals, p, c, f, dim, className, dp = 1,
}: {
  cals: number;
  p: number;
  c: number;
  f: number;
  /** Planned rather than eaten: the whole strip reads back. */
  dim?: boolean;
  className?: string;
  dp?: number;
}) {
  // Order follows the plate, not the alphabet: energy first, then the macro
  // that is being chased, then the two that are being kept inside a ceiling.
  const cells: { key: MacroKey; value: number; suffix: string }[] = [
    { key: "cals", value: cals, suffix: " kcal" },
    { key: "p", value: p, suffix: "g" },
    { key: "f", value: f, suffix: "g" },
    { key: "c", value: c, suffix: "g" },
  ];

  return (
    <div className={cn("flex items-stretch gap-2", dim && "opacity-45", className)}>
      {cells.map((cell) => (
        <span key={cell.key} className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            aria-hidden
            className="h-[1.05em] w-[3px] shrink-0 rounded-full"
            style={{ background: MACRO_COLOR[cell.key] }}
          />
          <span className="truncate text-[0.72rem] font-bold tabular">
            {cell.key === "cals" ? Math.round(cell.value) : round(cell.value, dp)}
            <span className="text-faint">{cell.suffix}</span>
            <span className="sr-only"> {MACRO_LABEL[cell.key]}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function round(n: number, dp: number): string {
  const f = 10 ** dp;
  const v = Math.round((Number(n) || 0) * f) / f;
  // Trailing ".0" on every whole gram is four wasted characters per row on a
  // screen this narrow.
  return Number.isInteger(v) ? String(v) : v.toFixed(dp);
}
