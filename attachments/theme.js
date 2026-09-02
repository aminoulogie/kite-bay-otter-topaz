// ==========================================================================
// Theme engine: light/dark resolution and contrast-aware accent derivation.
// ==========================================================================

const ACCENT_PRESETS = [
  { id: "lime",   label: "Lime",    color: "#d3fd50", ink: "#16210a" },
  { id: "mint",   label: "Mint",    color: "#10b981", ink: "#04150a" },
  { id: "cyan",   label: "Cyan",    color: "#22d3ee", ink: "#04191d" },
  { id: "blue",   label: "Blue",    color: "#3b82f6", ink: "#f8fafc" },
  { id: "violet", label: "Violet",  color: "#a855f7", ink: "#f8fafc" },
  { id: "pink",   label: "Pink",    color: "#f472b6", ink: "#2a0a1a" },
  { id: "orange", label: "Orange",  color: "#fb923c", ink: "#241002" },
  { id: "amber",  label: "Amber",   color: "#fbbf24", ink: "#231803" },
  { id: "red",    label: "Red",     color: "#f87171", ink: "#2a0808" },
  { id: "slate",  label: "Slate",   color: "#94a3b8", ink: "#0b1220" }
];

const DEFAULT_ACCENT = ACCENT_PRESETS[0].color;

// Relative luminance, so text sitting on the accent stays readable whatever
// colour is picked — a pale lime needs dark ink, a deep violet needs light.
function accentInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "#0b0c10";
  const int = parseInt(m[1], 16);
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLin((int >> 16) & 255)
            + 0.7152 * toLin((int >> 8) & 255)
            + 0.0722 * toLin(int & 255);
  return lum > 0.45 ? "#0b1207" : "#f8fafc";
}

// The accent doubles as a button fill and as type. Those need different
// colours: a pale lime reads well behind dark ink but vanishes as text on
// white. This darkens or lightens the accent until it clears a readable
// contrast ratio against the surface behind it, preserving the hue.
function accentText(hex, theme) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return theme === "light" ? "#3f6212" : "#d3fd50";
  const int = parseInt(m[1], 16);
  let r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;

  const toLin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  // Luminance of the surface the text sits on in each theme.
  const surfaceLum = theme === "light" ? lum(255, 255, 255) : lum(20, 23, 32);
  const target = 4.0;
  const step = theme === "light" ? 0.88 : 1.12;

  for (let i = 0; i < 24; i++) {
    if (contrast(lum(r, g, b), surfaceLum) >= target) break;
    r = Math.max(0, Math.min(255, Math.round(r * step)));
    g = Math.max(0, Math.min(255, Math.round(g * step)));
    b = Math.max(0, Math.min(255, Math.round(b * step)));
    if ((theme === "light" && r + g + b === 0) || (theme !== "light" && r === 255 && g === 255 && b === 255)) break;
  }
  const hx = (c) => c.toString(16).padStart(2, "0");
  return "#" + hx(r) + hx(g) + hx(b);
}

function normalizeAccent(value) {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : DEFAULT_ACCENT;
}

// "system" follows Obsidian's own light/dark setting.
function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  try {
    if (document.body.classList.contains("theme-light")) return "light";
    if (document.body.classList.contains("theme-dark")) return "dark";
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch (e) { /* non-DOM context */ }
  return "dark";
}

function applySomaTheme(rootEl, settings) {
  if (!rootEl) return;
  const accent = normalizeAccent(settings && settings.accent);
  const theme = resolveTheme(settings && settings.theme);
  rootEl.setAttribute("data-soma-theme", theme);
  rootEl.style.setProperty("--soma-accent", accent);
  rootEl.style.setProperty("--soma-accent-ink", accentInk(accent));
  rootEl.style.setProperty("--soma-accent-text", accentText(accent, theme));
}

// ============================================================================
// WIDGET PROFILES
// ----------------------------------------------------------------------------
// The suite used to mount as one nine-tab app. It is now split into focused
// widgets that each drop into a note on their own, so a daily note can run
// macros, then workout, then habits as three separate blocks.
//   ```soma-macros```   nutrition, weight, creatine
//   ```soma-workout```  training only — no macro tab
//   ```habittracker```  habits, already standalone
//   ```soma-coach```    the original all-in-one, kept so old notes still work
// All three share one codebase; a profile just decides which tabs appear.
// ============================================================================

module.exports = { ACCENT_PRESETS, DEFAULT_ACCENT, accentInk, accentText, normalizeAccent, resolveTheme, applySomaTheme };
