import { forwardRef } from "react";
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
  { value, onValueChange, allowNegative = false, ...rest },
  ref,
) {
  return (
    <Input
      {...rest}
      ref={ref}
      // text, not number: see above.
      type="text"
      inputMode="decimal"
      value={String(value ?? "")}
      onChange={(e) => {
        const raw = e.target.value;
        // Keep only what can belong to a number, so the field cannot hold
        // letters, but allow a trailing separator while it is being typed —
        // stripping it would make "12," impossible to extend to "12,5".
        const pattern = allowNegative ? /[^0-9.,-]/g : /[^0-9.,]/g;
        const filtered = raw.replace(pattern, "");
        onValueChange(parseDecimal(filtered), filtered);
      }}
    />
  );
});
