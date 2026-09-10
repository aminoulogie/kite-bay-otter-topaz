import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The app's text field, with one behaviour worth knowing about.
 *
 * `type="number"` is REWRITTEN to a text field with a numeric keypad, and a
 * comma typed into it becomes a dot before anything downstream sees it.
 *
 * `<input type="number">` parses against the browser's locale and silently
 * discards what it cannot read. On a keyboard whose decimal key is a comma —
 * French, Arabic, most of Europe — typing "82,5" leaves the field holding the
 * empty string. No error, no cue: the number looks entered and saves as
 * nothing. There is no attribute that fixes it; the input type is the problem.
 *
 * Doing it here rather than at each call site is deliberate. Sixteen fields
 * used the raw type and converting them one by one leaves the seventeenth to
 * whoever adds it next. Now `type="number"` simply means "a number field that
 * works on this keyboard" everywhere in the app, and a test walks the source
 * to make sure nothing bypasses this by rendering a bare <input>.
 *
 * `step`, `min` and `max` are dropped along with the type, since they only
 * mean anything to a real number input. Range checks live in the handlers.
 */
export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, inputMode, ...props }, ref) => {
    const numeric = type === "number";
    const { step: _step, min: _min, max: _max, ...rest } = props;

    return (
      <input
        ref={ref}
        type={numeric ? "text" : type}
        inputMode={inputMode ?? (numeric ? "decimal" : undefined)}
        onChange={
          numeric && onChange
            ? (e) => {
                const raw = e.target.value;
                // Only the separator is normalised. Anything else the user
                // types is left alone so a half-finished entry is not fought
                // with mid-keystroke.
                const fixed = raw.replace(/,/g, ".");
                if (fixed !== raw) e.target.value = fixed;
                onChange(e);
              }
            : onChange
        }
        className={cn(
          "h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-medium placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]",
          className,
        )}
        {...(numeric ? rest : props)}
      />
    );
  },
);
Input.displayName = "Input";
