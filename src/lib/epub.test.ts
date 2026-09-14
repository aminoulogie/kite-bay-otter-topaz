import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMParser } from "linkedom";
// The parsing this file covers runs in a browser, against the browser's own
// XML parser. linkedom stands in for it here so the format's rules can be
// tested against the specification rather than against a screenshot.
(globalThis as unknown as { DOMParser: unknown }).DOMParser = DOMParser;

const {
  CONTAINER_PATH, chapterHtml, chapterTitle, containerOpfPath, parseOpf, resolvePath,
} = await import("./epub.ts");

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf"
    media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Dune</dc:title>
    <dc:creator>Frank Herbert</dc:creator>
    <meta name="cover" content="cov"/>
  </metadata>
  <manifest>
    <item id="cov" href="images/cover.jpg" media-type="image/jpeg"/>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/Chapter%202.xhtml" media-type="application/xhtml+xml"/>
    <item id="ad" href="text/ad.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="../shared/book.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="ad" linear="no"/>
  </spine>
</package>`;

test("the container names the package document, wherever it is", () => {
  assert.equal(CONTAINER_PATH, "META-INF/container.xml");
  assert.equal(containerOpfPath(CONTAINER), "OEBPS/content.opf");
  // A leading slash is legal and means the same place.
  assert.equal(
    containerOpfPath(CONTAINER.replace('"OEBPS/content.opf"', '"/EPUB/package.opf"')),
    "EPUB/package.opf",
  );
  assert.equal(containerOpfPath("<container/>"), null);
  assert.equal(containerOpfPath("not xml at all <<<"), null);
});

test("hrefs resolve against the folder the manifest is in", () => {
  assert.equal(resolvePath("OEBPS/content.opf", "text/ch1.xhtml"), "OEBPS/text/ch1.xhtml");
  assert.equal(resolvePath("OEBPS/content.opf", "../shared/a.css"), "shared/a.css");
  assert.equal(resolvePath("OEBPS/content.opf", "./cover.jpg"), "OEBPS/cover.jpg");
  // A manifest at the root of the archive.
  assert.equal(resolvePath("content.opf", "ch1.xhtml"), "ch1.xhtml");
  // Absolute wins outright.
  assert.equal(resolvePath("OEBPS/content.opf", "/images/c.png"), "images/c.png");
  // Fragments and queries are not part of the path.
  assert.equal(resolvePath("OEBPS/text/a.xhtml", "b.xhtml#top"), "OEBPS/text/b.xhtml");
});

test("a percent-encoded href is decoded, or it never matches a zip entry", () => {
  assert.equal(resolvePath("OEBPS/content.opf", "text/Chapter%202.xhtml"), "OEBPS/text/Chapter 2.xhtml");
  // Broken encoding is left as it stands rather than throwing the book away.
  assert.equal(resolvePath("a/b.opf", "100%.xhtml"), "a/100%.xhtml");
});

test("the spine gives the reading order, and skips what is not in it", () => {
  const book = parseOpf(OPF, "OEBPS/content.opf")!;
  assert.deepEqual(
    book.chapters.map((c) => c.path),
    ["OEBPS/text/ch1.xhtml", "OEBPS/text/Chapter 2.xhtml"],
    'linear="no" is in the book but not in the reading order',
  );
  assert.equal(book.chapters[0]!.mediaType, "application/xhtml+xml");
});

test("title and author come off the Dublin Core metadata", () => {
  const book = parseOpf(OPF, "OEBPS/content.opf")!;
  assert.equal(book.title, "Dune");
  assert.equal(book.author, "Frank Herbert");
});

test("the cover is found by all three conventions", () => {
  // EPUB 2: a <meta name="cover"> pointing at a manifest id.
  assert.equal(parseOpf(OPF, "OEBPS/content.opf")!.coverPath, "OEBPS/images/cover.jpg");

  // EPUB 3: properties="cover-image" on the item itself.
  const three = OPF.replace(
    '<item id="cov" href="images/cover.jpg" media-type="image/jpeg"/>',
    '<item id="anything" href="c.png" media-type="image/png" properties="cover-image"/>',
  ).replace('<meta name="cover" content="cov"/>', "");
  assert.equal(parseOpf(three, "OEBPS/content.opf")!.coverPath, "OEBPS/c.png");

  // Neither: an item simply called "cover".
  const plain = OPF.replace('id="cov"', 'id="cover"').replace('<meta name="cover" content="cov"/>', "");
  assert.equal(parseOpf(plain, "OEBPS/content.opf")!.coverPath, "OEBPS/images/cover.jpg");

  // A book with no cover at all says so rather than guessing.
  const bare = OPF.replace(/<item id="cov"[^>]*\/>/, "").replace('<meta name="cover" content="cov"/>', "");
  assert.equal(parseOpf(bare, "OEBPS/content.opf")!.coverPath, undefined);
});

test("every declared file is reachable by its archive path", () => {
  const book = parseOpf(OPF, "OEBPS/content.opf")!;
  assert.equal(book.byPath.get("OEBPS/images/cover.jpg"), "image/jpeg");
  assert.equal(book.byPath.get("shared/book.css"), "text/css", "a manifest may point above itself");
});

test("a package document that is not one comes back null", () => {
  assert.equal(parseOpf("<<<not xml", "a.opf"), null);
});

/* --------------------------------------------------------------------------
   Chapter rendering.
   -------------------------------------------------------------------------- */
const CH = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body>
  <h1>Chapter One</h1>
  <p>A beginning is the time for taking care.</p>
  <img src="../images/dune.jpg" alt="Dune"/>
  <img src="https://example.com/tracker.gif" alt=""/>
  <a href="ch2.xhtml">Next</a>
  <a href="#note">A note</a>
  <script>alert(1)</script>
</body></html>`;

test("images are rewritten to the bytes out of the archive", () => {
  const asked: string[] = [];
  const html = chapterHtml(CH, "OEBPS/text/ch1.xhtml", (p) => {
    asked.push(p);
    return `blob:${p}`;
  });
  assert.ok(asked.includes("OEBPS/images/dune.jpg"), `asked for ${asked.join(", ")}`);
  assert.ok(html.includes('src="blob:OEBPS/images/dune.jpg"'));
  assert.ok(html.includes("A beginning is the time"));
});

test("a chapter cannot run code or call home", () => {
  const html = chapterHtml(CH, "OEBPS/text/ch1.xhtml", (p) => `blob:${p}`);
  assert.ok(!html.includes("<script"), "scripts are dropped");
  assert.ok(!html.includes("alert(1)"));
  assert.ok(!/src="https?:/.test(html), "a remote image would say what you are reading");
});

test("a link inside the book resolves, a fragment is left alone", () => {
  const html = chapterHtml(CH, "OEBPS/text/ch1.xhtml", (p) => `blob:${p}`);
  assert.ok(html.includes('href="blob:OEBPS/text/ch2.xhtml"'));
  assert.ok(html.includes('href="#note"'));
});

test("a file the archive does not hold loses its src rather than showing broken", () => {
  const html = chapterHtml(CH, "OEBPS/text/ch1.xhtml", () => null);
  assert.ok(!html.includes("dune.jpg"));
});

test("a chapter names itself from its own heading", () => {
  assert.equal(chapterTitle(CH, "Chapter 1"), "Chapter One");
  assert.equal(chapterTitle("<html><body><p>no heading</p></body></html>", "Chapter 4"), "Chapter 4");
});
