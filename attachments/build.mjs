// Bundles src/ into the single main.js that Obsidian loads.
//
//   node build.mjs           one-off build
//   node build.mjs --watch   rebuild on save
//
// `obsidian` stays external: it is provided by the app at runtime and must
// never be inlined. Output is CommonJS because that is what Obsidian requires.
import esbuild from "esbuild";
import process from "process";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/index.js"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  platform: "browser",
  target: "es2020",
  // Obsidian's own modules, plus the Node built-ins Electron exposes.
  external: ["obsidian", "electron", "fs", "path", "os", "crypto", "child_process"],
  // Readable output: this file ships to users and gets read when something
  // breaks, so minifying it would trade away every stack trace for ~200KB.
  minify: false,
  sourcemap: false,
  logLevel: "info",
  banner: {
    js: [
      "/* SOMA Smart Coach — generated bundle. Do not edit by hand.",
      "   Source lives in src/; rebuild with `node build.mjs`. */"
    ].join("\n")
  }
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src/ …");
} else {
  await esbuild.build(options);
  console.log("built main.js");
}
