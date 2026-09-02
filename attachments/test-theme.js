// Tests for the theme engine: accent validation, contrast-picked ink, and
// theme resolution.
// Run with:  node test/test-theme.js
const assert = require("assert");
const { loadPlugin } = require("./harness.js");

const { ACCENT_PRESETS, DEFAULT_ACCENT, accentInk, normalizeAccent,
        resolveTheme, applySomaTheme } = loadPlugin();

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

// ---------------------------------------------------------- presets ----
test("presets: every swatch is a valid 6-digit hex", () => {
  ACCENT_PRESETS.forEach(p =>
    assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), p.id + " is not a hex colour")
  );
});
test("presets: every swatch has an id and label", () => {
  ACCENT_PRESETS.forEach(p => {
    assert.ok(p.id && p.id.length, "missing id");
    assert.ok(p.label && p.label.length, p.id + " missing label");
  });
});
test("presets: ids are unique", () => {
  assert.strictEqual(new Set(ACCENT_PRESETS.map(p => p.id)).size, ACCENT_PRESETS.length);
});
test("presets: the default accent is one of them", () => {
  assert.ok(ACCENT_PRESETS.some(p => p.color === DEFAULT_ACCENT));
});

// ------------------------------------------------------ normalizing ----
test("normalize: passes a valid hex through", () => {
  assert.strictEqual(normalizeAccent("#ff0000"), "#ff0000");
});
test("normalize: trims surrounding whitespace", () => {
  assert.strictEqual(normalizeAccent("  #00ff00  "), "#00ff00");
});
test("normalize: rejects junk and falls back to the default", () => {
  ["", null, undefined, "red", "#fff", "#12345", "javascript:alert(1)", "#gggggg", 42]
    .forEach(v => assert.strictEqual(normalizeAccent(v), DEFAULT_ACCENT, "accepted " + JSON.stringify(v)));
});
test("normalize: a rejected value can never inject CSS", () => {
  const out = normalizeAccent("red; background: url(evil)");
  assert.strictEqual(out, DEFAULT_ACCENT);
});

// ------------------------------------------------------------- ink ----
test("ink: a bright accent gets dark text", () => {
  ["#d3fd50", "#fbbf24", "#22d3ee", "#ffffff"].forEach(c => {
    const ink = accentInk(c);
    assert.strictEqual(ink, "#0b1207", c + " got " + ink);
  });
});
test("ink: a dark accent gets light text", () => {
  ["#3b82f6", "#a855f7", "#000000", "#1e293b"].forEach(c => {
    const ink = accentInk(c);
    assert.strictEqual(ink, "#f8fafc", c + " got " + ink);
  });
});
test("ink: every preset gets readable ink, never mid-grey", () => {
  ACCENT_PRESETS.forEach(p => {
    const ink = accentInk(p.color);
    assert.ok(ink === "#0b1207" || ink === "#f8fafc", p.id + " -> " + ink);
  });
});
test("ink: junk input still returns a usable colour", () => {
  assert.ok(/^#[0-9a-f]{6}$/i.test(accentInk("nonsense")));
});

// ---------------------------------------------------------- themes ----
test("theme: explicit dark and light are returned as-is", () => {
  assert.strictEqual(resolveTheme("dark"), "dark");
  assert.strictEqual(resolveTheme("light"), "light");
});
test("theme: unknown/absent preference resolves to a real theme", () => {
  [undefined, null, "", "banana", "system"].forEach(v => {
    const r = resolveTheme(v);
    assert.ok(r === "dark" || r === "light", v + " -> " + r);
  });
});

// ------------------------------------------------------- application ---
function fakeRoot() {
  const attrs = {}, props = {};
  return {
    attrs, props,
    setAttribute: (k, v) => { attrs[k] = v; },
    style: { setProperty: (k, v) => { props[k] = v; } }
  };
}

test("apply: stamps theme attribute and accent property", () => {
  const el = fakeRoot();
  applySomaTheme(el, { theme: "light", accent: "#a855f7" });
  assert.strictEqual(el.attrs["data-soma-theme"], "light");
  assert.strictEqual(el.props["--soma-accent"], "#a855f7");
  assert.strictEqual(el.props["--soma-accent-ink"], "#f8fafc");
});
test("apply: a junk accent falls back rather than writing it to the DOM", () => {
  const el = fakeRoot();
  applySomaTheme(el, { theme: "dark", accent: "url(evil)" });
  assert.strictEqual(el.props["--soma-accent"], DEFAULT_ACCENT);
});
test("apply: missing settings still produce a valid theme", () => {
  const el = fakeRoot();
  applySomaTheme(el, {});
  assert.ok(["dark", "light"].includes(el.attrs["data-soma-theme"]));
  assert.strictEqual(el.props["--soma-accent"], DEFAULT_ACCENT);
});
test("apply: a null root is a no-op, not a crash", () => {
  assert.doesNotThrow(() => applySomaTheme(null, { theme: "dark" }));
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
