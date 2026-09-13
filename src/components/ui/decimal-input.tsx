import { forwardRef, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A number field that accepts a comma as the decimal separator.
 *
 * `<input type="number">` parses against the browser locale and DISCARDS
 * anything it cannot read, with no error and no visible cue. On a keyboard
 * whose decimal key is a comma — French, Arabic, most of Europe — typing
 * "12,5" leaves the field holding nothing at all, so a value looks entered and
 * saves as empty. There is no attribute that fixes this; the type itself is
 * the problem.
 *
 * So this is a text field constrained to numeric characters, with
 * inputMode="decimal" to keep the numeric keypad, and both separators
 * normalised to a dot before the value is read.
 *
 * It also holds its own text while it has focus, and that is the part worth
 * reading twice.
 *
 * The parent is handed a NUMBER, so a half-typed entry has no number to hand
 * back: "1." parses to 1, "" and "," parse to null. A parent that stores the
 * number and passes it straight back — `onValueChange={(n) => setX(n ?? 0)}` —
 * therefore rewrites the field under the user mid-word. Typing "1.5" goes
 * "1" → "1." becomes "1" again → and the decimal point can never be entered
 * at all. Typing over a value to clear it snaps to "0" on the first
 * backspace. The caret jumps to the end each time, because the text it was
 * sitting in was replaced.
 *
 * That is what "it jumps when I type" is. The field keeps the raw string until
 * blur and shows the parent's value again afterwards, so the parent stays free
 * to clamp, round or reject — it just does not get to do it between two
 * keystrokes.
 */

export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(",", ".").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface DecimalInputProps extends Omit<React.ComponentProps<typeof Input>, "type" | "onChange" | "value"> {
  value: string | number;
  /** Receives the parsed number, or null when the field is empty or mid-edit. */
  onValueChange: (value: number | null, raw: string) => void;
  allowNegative?: boolean;
}

export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput(
  { value, onValueChange, allowNegative = false, onBlur, onFocus, ...rest },
  ref,
) {
  /** The text as typed, while typing. Null means "show what the parent has". */
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      {...rest}
      ref={ref}
      // text, not number: see above.
      type="text"
      inputMode="decimal"
      value={draft ?? String(value ?? "")}
      onFocus={(e) => {
        // Start from whatever the parent holds, so a value corrected on the
        // last blur is the one being edited rather than the text that was
        // rejected.
        setDraft(null);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        // Hand the field back. Anything the parent did with the number —
        // clamping it to a minimum, rounding it, ignoring it — becomes
        // visible now, which is the moment it can be seen rather than fought.
        setDraft(null);
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Keep only what can belong to a number, so the field cannot hold
        // letters, but allow a trailing separator while it is being typed —
        // stripping it would make "12," impossible to extend to "12,5".
        const pattern = allowNegative ? /[^0-9.,-]/g : /[^0-9.,]/g;
        const filtered = raw.replace(pattern, "");
        setDraft(filtered);
        onValueChange(parseDecimal(filtered), filtered);
      }}
    />
  );
});
