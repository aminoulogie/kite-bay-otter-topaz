import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_READER, LINE_HEIGHT, MARGIN, READER_FONTS, READER_THEMES, SIZE, cleanReader,
  fontStack, isDefaultReader, step, themeSpec, type ReaderPrefs,
} from "./reader-prefs.ts";

test("the shipped preferences are valid ones", () => {
  assert.deepEqual(cleanReader(DEFAULT_READER), DEFAULT_READER);
  assert.equal(isDefaultReader(DEFAULT_READER), true);
});

test("nothing is stored and nothing is broken both come back as the default", () => {
  assert.deepEqual(cleanReader(undefined), DEFAULT_READER);
  assert.deepEqual(cleanReader(null), DEFAULT_READER);
  assert.deepEqual(cleanReader("sepia"), DEFAULT_READER);
  assert.deepEqual(cleanReader({}), DEFAULT_READER);
});

test("a font or theme this version does not have falls back rather than failing", () => {
  // These ride in the backup, so they come back from files written by older
  // versions and by people who have opened them in a text editor. A reader
  // that will not open is worse than a reader in the wrong font.
  assert.equal(cleanReader({ font: "comic-sans" }).font, DEFAULT_READER.font);
  assert.equal(cleanReader({ theme: "chartreuse" }).theme, DEFAULT_READER.theme);
  assert.equal(fontStack("nonsense"), READER_FONTS[0]!.stack);
  assert.equal(themeSpec("nonsense" as never).id, READER_THEMES[0]!.id);
});

test("every size is held between a floor and a ceiling", () => {
  assert.equal(cleanReader({ size: 2 }).size, SIZE.min);
  assert.equal(cleanReader({ size: 400 }).size, SIZE.max);
  assert.equal(cleanReader({ lineHeight: 0 }).lineHeight, LINE_HEIGHT.min);
  assert.equal(cleanReader({ lineHeight: 9 }).lineHeight, LINE_HEIGHT.max);
  assert.equal(cleanReader({ margin: -20 }).margin, MARGIN.min);
  assert.equal(cleanReader({ margin: 500 }).margin, MARGIN.max);
  assert.equal(cleanReader({ size: NaN }).size, SIZE.default);
  assert.equal(cleanReader({ size: "18" }).size, SIZE.default, "a string is not a size");
});

test("stepping stops at the ends instead of running off them", () => {
  let p: ReaderPrefs = { ...DEFAULT_READER, size: SIZE.max };
  assert.equal(step(p, "size", 1).size, SIZE.max);
  p = { ...DEFAULT_READER, size: SIZE.min };
  assert.equal(step(p, "size", -1).size, SIZE.min);
  assert.equal(step(DEFAULT_READER, "size", 1).size, DEFAULT_READER.size + SIZE.step);
  assert.equal(step(DEFAULT_READER, "margin", 1).margin, DEFAULT_READER.margin + MARGIN.step);
});

test("stepping line height does not accumulate floating-point noise", () => {
  // 1.7 + 0.1 is 1.7999999999999998, and that is what reaches the backup file.
  let p: ReaderPrefs = DEFAULT_READER;
  for (let i = 0; i < 4; i++) p = step(p, "lineHeight", 1);
  assert.equal(p.lineHeight, 2.1);
  for (let i = 0; i < 20; i++) p = step(p, "lineHeight", -1);
  assert.equal(p.lineHeight, LINE_HEIGHT.min);
});

test("the two switches are booleans, whatever was stored", () => {
  assert.equal(cleanReader({ paged: false }).paged, false);
  assert.equal(cleanReader({ paged: "yes" }).paged, true, "only an explicit false turns it off");
  assert.equal(cleanReader({ lineFocus: true }).lineFocus, true);
  assert.equal(cleanReader({ lineFocus: "true" }).lineFocus, false, "line focus is opt-in");
});

test("every font names a real family and ends in a generic", () => {
  for (const f of READER_FONTS) {
    assert.ok(f.label.length > 0, f.id);
    assert.match(f.stack, /(serif|sans-serif|monospace)\s*$/, `${f.id} has no generic fallback`);
    // Nothing is fetched: a web font is a request that fails on a plane and a
    // page that reflows once it lands.
    assert.ok(!/url\(|https?:/.test(f.stack), `${f.id} tries to download something`);
  }
});

test("every theme states its own chrome and a mark colour", () => {
  for (const t of READER_THEMES) {
    for (const key of ["bg", "fg", "strong", "faint", "mark"] as const) {
      assert.match(t[key], /^(#|rgba?\()/, `${t.id}.${key}`);
    }
    assert.equal(typeof t.dark, "boolean", t.id);
  }
  assert.equal(themeSpec("night").dark, true);
  assert.equal(themeSpec("paper").dark, false);
});

test("a changed preference is not the default any more", () => {
  assert.equal(isDefaultReader({ ...DEFAULT_READER, size: SIZE.max }), false);
  assert.equal(isDefaultReader({ ...DEFAULT_READER, theme: "paper" }), false);
});
