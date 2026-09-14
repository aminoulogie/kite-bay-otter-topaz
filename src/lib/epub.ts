/**
 * Enough of the EPUB format to read one.
 *
 * An EPUB is a ZIP with a rulebook. The rulebook is what this file is: given
 * the bytes of the two XML files every EPUB must contain, work out the order
 * of the chapters, their paths inside the archive, and what the book is
 * called. The unzipping and the rendering live elsewhere — this part is pure,
 * which is what lets a format defined by a specification be tested against
 * one rather than against a screenshot.
 *
 * No library. epub.js is 200KB and mostly a pagination engine for a viewport
 * model this app does not use; the parsing it wraps is three XML lookups and
 * a path join, and the path join is the only part anyone gets wrong.
 */

/** The fixed entry point. Every EPUB has exactly this file. */
export const CONTAINER_PATH = "META-INF/container.xml";

export interface EpubChapter {
  id: string;
  /** Path inside the archive, already resolved against the OPF's folder. */
  path: string;
  mediaType: string;
}

export interface EpubBook {
  title?: string;
  author?: string;
  /** Archive path of the cover image, if the book declares one. */
  coverPath?: string;
  /** Reading order. */
  chapters: EpubChapter[];
  /** Every declared file, by archive path, for resolving links and images. */
  byPath: Map<string, string>;
}

function parseXml(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return doc.querySelector("parsererror") ? null : doc;
  } catch {
    return null;
  }
}

/**
 * Join a relative href against the folder its manifest lives in.
 *
 * The one genuinely fiddly part of the format. A manifest at
 * "OEBPS/content.opf" listing "text/ch1.xhtml" means "OEBPS/text/ch1.xhtml",
 * and one listing "../images/c.png" means "images/c.png" — and hrefs are
 * percent-encoded, so a chapter called "Chapter 1.xhtml" arrives as
 * "Chapter%201.xhtml" and will not match a ZIP entry until it is decoded.
 */
export function resolvePath(base: string, href: string): string {
  const raw = href.split("#")[0]!.split("?")[0]!;
  let rel: string;
  try {
    rel = decodeURIComponent(raw);
  } catch {
    rel = raw;
  }
  if (!rel) return "";
  // An href that starts at the root of the archive ignores the base entirely.
  if (rel.startsWith("/")) return rel.slice(1);
  const dir = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
  const parts = dir ? dir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Where the package document lives, read from container.xml.
 *
 * Not guessed at. "OEBPS/content.opf" is the common answer and is wrong often
 * enough — Calibre, InDesign and Sigil all use different folders — that
 * guessing is how a reader ends up working on the books its author tested.
 */
export function containerOpfPath(xml: string): string | null {
  const doc = parseXml(xml);
  const el = doc?.querySelector("rootfile[full-path]");
  const path = el?.getAttribute("full-path")?.trim();
  return path ? path.replace(/^\//, "") : null;
}

/** Read the package document: what the book is, and what order to read it in. */
export function parseOpf(xml: string, opfPath: string): EpubBook | null {
  const doc = parseXml(xml);
  if (!doc) return null;

  const byId = new Map<string, { path: string; mediaType: string; properties: string }>();
  const byPath = new Map<string, string>();
  for (const item of Array.from(doc.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    const path = resolvePath(opfPath, href);
    const mediaType = item.getAttribute("media-type") ?? "";
    byId.set(id, { path, mediaType, properties: item.getAttribute("properties") ?? "" });
    byPath.set(path, mediaType);
  }

  const chapters: EpubChapter[] = [];
  for (const ref of Array.from(doc.getElementsByTagName("itemref"))) {
    const idref = ref.getAttribute("idref");
    // linear="no" marks a page that is in the book but not in the reading
    // order — a colophon, an ad. Skipping it is what the attribute is for.
    if (!idref || ref.getAttribute("linear") === "no") continue;
    const item = byId.get(idref);
    if (item) chapters.push({ id: idref, path: item.path, mediaType: item.mediaType });
  }

  // Metadata is Dublin Core, so the tags arrive as "dc:title" and "dc:creator"
  // — and whether the prefix has been stripped into `localName` by the time it
  // reaches here depends on the parser. Comparing the part after the colon is
  // the one test that is true of both, and of a book that omits the prefix.
  const text = (tag: string): string | undefined => {
    for (const el of Array.from(doc.querySelectorAll("*"))) {
      const name = (el.localName || el.nodeName || "").toLowerCase();
      const local = name.slice(name.indexOf(":") + 1);
      if (local === tag && el.textContent?.trim()) return el.textContent.trim();
    }
    return undefined;
  };

  // A package document without a single manifest item is not one. Checking
  // the CONTENT rather than trusting a <parsererror> element, because whether
  // a parser produces one for rubbish input is a parser's own business and
  // "this file is not an EPUB" has to be a reliable answer.
  if (byId.size === 0) return null;

  return {
    title: text("title"),
    author: text("creator"),
    coverPath: coverFrom(doc, byId),
    chapters,
    byPath,
  };
}

/**
 * The cover image, by whichever of the three conventions this book uses.
 *
 * EPUB 3 marks the manifest item `properties="cover-image"`. EPUB 2 has no
 * such thing and instead points at it from a `<meta name="cover">`. Plenty of
 * books do neither and simply call the item "cover". All three are common
 * enough that a reader supporting only one shows a blank shelf.
 */
function coverFrom(
  doc: Document,
  byId: Map<string, { path: string; mediaType: string; properties: string }>,
): string | undefined {
  for (const [, item] of byId) {
    if (item.properties.split(/\s+/).includes("cover-image")) return item.path;
  }
  for (const meta of Array.from(doc.getElementsByTagName("meta"))) {
    if (meta.getAttribute("name") !== "cover") continue;
    const item = byId.get(meta.getAttribute("content") ?? "");
    if (item) return item.path;
  }
  for (const id of ["cover", "cover-image", "coverimage"]) {
    const item = byId.get(id);
    if (item?.mediaType.startsWith("image/")) return item.path;
  }
  return undefined;
}

/**
 * The readable text of one chapter, with its links to the archive rewritten.
 *
 * Chapter XHTML refers to images and stylesheets by paths inside the ZIP,
 * which mean nothing to a browser: every one has to be swapped for a blob URL
 * of the unzipped bytes. Scripts and remote resources are dropped — a book is
 * a document, and one that can run code or phone home is not a book.
 */
export function chapterHtml(
  xhtml: string,
  chapterPath: string,
  urlFor: (archivePath: string) => string | null,
): string {
  // XHTML first, HTML as the net. Books are XHTML by specification and plenty
  // of them are not: an unescaped ampersand in one chapter should cost that
  // chapter's strictness, not the whole book.
  const xml = new DOMParser().parseFromString(xhtml, "application/xhtml+xml");
  const body =
    (!xml.querySelector("parsererror") && (xml.body ?? xml.querySelector("body"))) ||
    new DOMParser().parseFromString(xhtml, "text/html").body;
  if (!body) return "";

  for (const el of Array.from(body.querySelectorAll("script, iframe, object, embed"))) {
    el.remove();
  }
  for (const el of Array.from(body.querySelectorAll("[src], [href], image"))) {
    const attr = el.hasAttribute("src")
      ? "src"
      : el.hasAttribute("href")
        ? "href"
        : "xlink:href";
    const value = el.getAttribute(attr);
    if (!value) continue;
    if (/^(https?:|data:|mailto:|blob:)/i.test(value)) {
      // A link out of the book is left alone as text; a remote IMAGE is
      // dropped, because a reader that fetches from the internet leaks what
      // you are reading and shows a broken box on a plane.
      if (attr === "src") el.removeAttribute("src");
      continue;
    }
    if (value.startsWith("#")) continue;
    const url = urlFor(resolvePath(chapterPath, value));
    if (url) el.setAttribute(attr, url);
    else if (attr !== "href") el.removeAttribute(attr);
  }
  return body.innerHTML;
}

/** A chapter's own heading, for a table of contents built from the spine. */
export function chapterTitle(xhtml: string, fallback: string): string {
  const doc = new DOMParser().parseFromString(xhtml, "text/html");
  for (const tag of ["h1", "h2", "h3", "title"]) {
    const t = doc.querySelector(tag)?.textContent?.trim();
    if (t) return t.replace(/\s+/g, " ").slice(0, 80);
  }
  return fallback;
}
