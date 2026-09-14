/**
 * Put pdf.js's own data files where the app can serve them.
 *
 * pdf.js needs four folders of data at runtime: the base-14 font programmes
 * for PDFs that do not embed their fonts, the Adobe CMaps for CJK text, the
 * wasm decoders for JPEG 2000 and JBIG2 images, and one ICC profile. Without
 * them a PDF opens, reports its page count, and then renders nothing — which
 * is exactly what it did here before this existed.
 *
 * They are COPIED out of node_modules into public/ rather than referenced
 * where they lie, because "where they lie" is a path that exists in dev and
 * not in a build, and rather than fetched from a CDN, because the whole point
 * of this app is that it works with the phone in flight mode. public/ is the
 * one place Vite treats identically in dev, in a build, on Pages under a
 * sub-path, and inside the Capacitor shell.
 *
 * Copied, so public/pdfjs is generated and git-ignored: 4MB of somebody
 * else's binaries do not belong in this repository's history, and npm already
 * has them pinned in the lockfile.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FROM = join(ROOT, "node_modules", "pdfjs-dist");
const INTO = join(ROOT, "public", "pdfjs");
const STAMP = join(INTO, ".version");

/** Everything pdf.js fetches rather than bundles. */
const FOLDERS = ["standard_fonts", "cmaps", "wasm", "iccs"];

export function copyPdfjsAssets({ quiet = false } = {}) {
  if (!existsSync(FROM)) return false;
  const version = JSON.parse(readFileSync(join(FROM, "package.json"), "utf8")).version;

  // Stamped with the version so an upgrade replaces the files, and an
  // unchanged version costs one file read rather than a 4MB copy on every
  // dev-server start.
  if (existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === version) return false;

  rmSync(INTO, { recursive: true, force: true });
  mkdirSync(INTO, { recursive: true });
  for (const folder of FOLDERS) {
    const src = join(FROM, folder);
    if (existsSync(src)) cpSync(src, join(INTO, folder), { recursive: true });
  }
  writeFileSync(STAMP, `${version}\n`);
  if (!quiet) console.log(`[pdfjs] copied ${FOLDERS.join(", ")} for pdfjs-dist ${version}`);
  return true;
}

/** Runs at dev-server start and at the top of a build, in both cases before
 *  anything reads public/. */
export function pdfjsAssetsPlugin() {
  return {
    name: "soma:pdfjs-assets",
    buildStart() {
      copyPdfjsAssets({ quiet: true });
    },
  };
}

if (process.argv[1] && process.argv[1].endsWith("pdfjs-assets.mjs")) copyPdfjsAssets();
