import { useEffect, useRef, useState } from "react";
import { formatResult, isExpression, resolve } from "@/lib/calc";

/**
 * Arithmetic in every number field in the app.
 *
 * Mounted once. It watches focus rather than being built into each field, so
 * the forty-odd number inputs across the app all get it — including the next
 * one someone adds — without touching them.
 *
 * While a number field has focus a strip sits above the keyboard with
 * + − × ÷ (the iPhone's number pad has none of them) and, once the field
 * holds a sum, the answer in grey: "= 165". The first Enter swaps the sum for
 * its answer and stops there — it does not also submit — and leaving the
 * field does the same, so a sum is never saved as text. "+67" in a field
 * that held 70 is 137.
 */

/** The bar's own height, so it can be placed by its top edge. */
const BAR_H = 48;

const OPS = [
  { label: "+", text: "+" },
  { label: "−", text: "-" },
  { label: "×", text: "×" },
  { label: "÷", text: "÷" },
  { label: "(", text: "(" },
  { label: ")", text: ")" },
];

function isNumberField(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.dataset.noCalc != null || el.readOnly || el.disabled) return false;
  const mode = el.getAttribute("inputmode");
  return mode === "decimal" || mode === "numeric";
}

const setValue = (el: HTMLInputElement, v: string) => {
  // React tracks the value it last wrote; going through the prototype setter
  // and firing a real input event is how a change it did not make reaches
  // onChange.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

export function CalcBar() {
  const [field, setField] = useState<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  /** Top edge in layout pixels: just above the keys, wherever iOS panned to. */
  const [top, setTop] = useState<number | null>(null);
  /** What each field held when it was focused — the base for "+67". */
  const bases = useRef(new WeakMap<HTMLInputElement, string>());

  useEffect(() => {
    const commit = (el: HTMLInputElement): boolean => {
      const v = resolve(el.value, bases.current.get(el));
      if (v == null) return false;
      setValue(el, formatResult(v));
      bases.current.set(el, formatResult(v));
      setText(formatResult(v));
      return true;
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!isNumberField(e.target)) return;
      bases.current.set(e.target, e.target.value);
      setField(e.target);
      setText(e.target.value);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isNumberField(e.target)) return;
      commit(e.target);
      const el = e.target;
      // Focus moving to the next number field arrives after this; only hide
      // when it really left.
      setTimeout(() => {
        if (document.activeElement !== el && !isNumberField(document.activeElement)) setField(null);
      }, 0);
    };
    const onInput = (e: Event) => {
      if (isNumberField(e.target)) setText(e.target.value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !isNumberField(e.target)) return;
      if (!isExpression(e.target.value, bases.current.get(e.target))) return;
      // Work it out, and stop: this Enter belongs to the sum, not the form.
      if (commit(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("input", onInput, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("input", onInput, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  // Sit on top of the keyboard, wherever it ends.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!field || !vv) return;
    const place = () => setTop(Math.round(vv.offsetTop + vv.height - BAR_H));
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, [field]);

  if (!field) return null;
  const base = bases.current.get(field);
  const result = isExpression(text, base) ? resolve(text, base) : null;

  const insert = (op: string) => {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const next = field.value.slice(0, start) + op + field.value.slice(end);
    setValue(field, next);
    const at = start + op.length;
    field.setSelectionRange(at, at);
  };

  return (
    <div
      className="fixed inset-x-0 z-[90] flex items-center gap-1.5 border-t border-border bg-surface/95 px-2 py-1.5 backdrop-blur"
      style={top == null ? { bottom: 0, height: BAR_H } : { top, height: BAR_H }}
      // Pressing a key here must not take focus from the field.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      data-no-swipe-nav
    >
      <div className="min-w-0 flex-1 truncate pl-1 text-sm font-bold tabular text-faint">
        {result != null ? `= ${formatResult(result)}` : ""}
      </div>
      {OPS.map((o) => (
        <button
          key={o.label}
          type="button"
          tabIndex={-1}
          onClick={() => insert(o.text)}
          className="grid h-9 w-10 place-items-center rounded-xl bg-surface-2 text-base font-bold active:scale-95"
          aria-label={o.label}
        >
          {o.label}
        </button>
      ))}
      {result != null && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setValue(field, formatResult(result));
            bases.current.set(field, formatResult(result));
          }}
          className="grid h-9 w-10 place-items-center rounded-xl bg-accent text-base font-extrabold text-accent-ink active:scale-95"
          aria-label="Work it out"
        >
          =
        </button>
      )}
    </div>
  );
}
