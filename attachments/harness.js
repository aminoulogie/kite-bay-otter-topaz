// Loads the BUILT main.js with a stubbed `obsidian` module, so the tests
// exercise the exact artefact Obsidian will load — not the sources it was
// built from. A green suite therefore means the bundle is good, which is the
// only thing that actually ships.
//
// Run `node build.mjs` first (or `npm run verify`, which does both).
const fs = require("fs");
const path = require("path");
const Module = require("module");
const vm = require("vm");

const MAIN = path.join(__dirname, "..", "main.js");

// Minimal stand-ins. Nothing under test touches these; they only need to
// exist so the top-level destructure and `class X extends Y` succeed.
class Stub {}
const obsidianStub = {
  Plugin: Stub, Modal: Stub, Notice: class { constructor(m) { this.message = m; } },
  requestUrl: async () => ({ json: {} }),
  PluginSettingTab: Stub, Setting: Stub, setIcon: () => {},
  MarkdownRenderChild: Stub
};

function loadPlugin() {
  if (!fs.existsSync(MAIN)) {
    throw new Error("main.js is missing — run `node build.mjs` first.");
  }
  const src = fs.readFileSync(MAIN, "utf8");
  const compiled = vm.runInThisContext(Module.wrap(src), { filename: MAIN });
  const mod = { exports: {} };
  const fakeRequire = (id) => (id === "obsidian" ? obsidianStub : require(id));
  compiled.call(mod.exports, mod.exports, fakeRequire, mod, MAIN, path.dirname(MAIN));

  const internals = mod.exports && mod.exports.__internals;
  if (!internals) {
    throw new Error(
      "main.js exposes no __internals — it is probably a stale bundle. Rebuild with `node build.mjs`."
    );
  }
  // The plugin class itself, for tests that care about it.
  internals.SomaSmartCoachPlugin = mod.exports;
  return internals;
}

module.exports = { loadPlugin };
