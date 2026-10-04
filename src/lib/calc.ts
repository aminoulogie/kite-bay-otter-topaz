/**
 * Arithmetic in number fields: "78+87" becomes 165, and "+67" typed into a
 * field that held 70 becomes 137.
 *
 * A small parser rather than eval — the input is whatever was typed into a
 * field, and nothing typed there should ever run as code.
 *
 * Accepts digits with a dot or comma decimal, + - * / and their keypad
 * spellings (× x ÷ −), parentheses and spaces.
 */

const OPS = /[+\-*/×x÷−]/;

function normalise(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[×x]/gi, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-");
}

/** Parse and evaluate; null when it is not a complete, finite expression. */
export function evaluate(raw: string): number | null {
  const s = normalise(raw);
  if (!s) return null;
  let i = 0;
  const peek = () => s[i];
  const num = (): number | null => {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number | null => {
    const c = peek();
    if (c === "-" || c === "+") {
      i++;
      const v = factor();
      return v == null ? null : c === "-" ? -v : v;
    }
    if (c === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") return null;
      i++;
      return v;
    }
    return num();
  };
  const term = (): number | null => {
    let v = factor();
    while (v != null && (peek() === "*" || peek() === "/")) {
      const op = s[i++];
      const r = factor();
      if (r == null) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v != null && (peek() === "+" || peek() === "-")) {
      const op = s[i++];
      const r = term();
      if (r == null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = expr();
  if (v == null || i !== s.length || !Number.isFinite(v)) return null;
  return v;
}

/** True when the text is a sum to work out, not just a number. */
export function isExpression(raw: string, base?: string | null): boolean {
  const s = normalise(raw);
  if (!s) return false;
  // An operator anywhere after the first character: "78+87", "2*3".
  if (OPS.test(normalise(s.slice(1))) || /[()]/.test(s)) return true;
  // A leading operator, applied to what the field held: "+67", "*2".
  return /^[+*/]/.test(s) || (/^-/.test(s) && hasBase(base));
}

function hasBase(base?: string | null): boolean {
  const b = base == null ? null : evaluate(base);
  return b != null && b !== 0;
}

/**
 * What the field should end up holding, or null when it should be left alone.
 * `base` is what the field held before this edit, for "+67".
 */
export function resolve(raw: string, base?: string | null): number | null {
  if (!isExpression(raw, base)) return null;
  const s = normalise(raw);
  if (/^[+\-*/]/.test(s) && (/^[+*/]/.test(s) || hasBase(base))) {
    const b = base == null ? null : evaluate(base);
    if (b != null) return tidy(evaluate(`(${b})${s}`));
  }
  return tidy(evaluate(s));
}

/** Rounded to what a field shows: no float noise like 0.30000000000000004. */
function tidy(v: number | null): number | null {
  if (v == null) return null;
  return Math.round(v * 1e6) / 1e6;
}

export function formatResult(v: number): string {
  return String(v);
}
