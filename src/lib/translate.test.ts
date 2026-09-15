import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LANGUAGES, MAX_TRANSLATE_CHARS, defaultLanguage, isLanguage, languageLabel,
  parseTranslation, translateText,
} from "./translate.ts";

const body = (text: string, extra: Record<string, unknown> = {}) => ({
  responseData: { translatedText: text, match: 1 },
  responseStatus: 200,
  ...extra,
});

const reply = (json: unknown, ok = true): typeof fetch =>
  (async () => ({ ok, status: ok ? 200 : 500, json: async () => json })) as unknown as typeof fetch;

describe("the language list", () => {
  it("has no duplicates and labels every code it offers", () => {
    const codes = LANGUAGES.map((l) => l.code);
    assert.equal(new Set(codes).size, codes.length);
    for (const l of LANGUAGES) assert.equal(languageLabel(l.code), l.label);
  });

  it("names an unknown code rather than pretending it does not exist", () => {
    assert.equal(languageLabel("xx"), "XX");
    assert.equal(isLanguage("xx"), false);
    assert.equal(isLanguage("fr"), true);
  });

  it("takes the default from the phone, and never translates into its own language", () => {
    assert.equal(defaultLanguage("fr-FR"), "fr");
    assert.equal(defaultLanguage("ar"), "ar");
    assert.equal(defaultLanguage("en-US"), "fr", "an English phone still wants a second language");
    assert.equal(defaultLanguage("cy-GB"), "fr", "a language not offered falls back");
    assert.equal(defaultLanguage(undefined), "fr");
  });
});

describe("reading the service's answer", () => {
  it("takes the translation and how sure it is", () => {
    assert.deepEqual(parseTranslation(body("bonjour")), { text: "bonjour", quality: 1 });
  });

  it("refuses a failure wearing a success's clothes", () => {
    assert.equal(parseTranslation(body("INVALID SOURCE LANGUAGE")), null);
    assert.equal(parseTranslation({ ...body("bonjour"), responseStatus: 403 }), null);
  });

  it("keeps a short shouted word, which is a real translation", () => {
    assert.equal(parseTranslation(body("OUI"))?.text, "OUI");
  });

  it("refuses an empty or missing translation", () => {
    assert.equal(parseTranslation(body("   ")), null);
    assert.equal(parseTranslation({ responseStatus: 200 }), null);
    assert.equal(parseTranslation(null), null);
    assert.equal(parseTranslation("bonjour"), null);
  });

  it("leaves the quality out when the service does not say", () => {
    assert.equal(parseTranslation({ responseData: { translatedText: "bonjour" } })?.quality, undefined);
  });
});

describe("asking for a translation", () => {
  it("returns the word", async () => {
    const got = await translateText("hello", { to: "fr", fetch: reply(body("bonjour")) });
    assert.deepEqual(got, { ok: true, value: { text: "bonjour", quality: 1 } });
  });

  it("sends the word and the pair, and nothing else", async () => {
    let seen = "";
    const spy = (async (url: string) => {
      seen = url;
      return { ok: true, status: 200, json: async () => body("bonjour") };
    }) as unknown as typeof fetch;
    await translateText("the spice", { from: "en", to: "ar", fetch: spy });
    assert.match(seen, /q=the%20spice/);
    assert.match(seen, /langpair=en%7Car/);
  });

  it("will not translate a language into itself", async () => {
    const got = await translateText("hello", { from: "fr", to: "fr", fetch: reply(body("x")) });
    assert.equal(got.ok, false);
    assert.match(got.ok === false ? got.reason : "", /already French/);
  });

  it("refuses nothing, and refuses half a chapter", async () => {
    assert.equal((await translateText("  ", { to: "fr" })).ok, false);
    const long = "a".repeat(MAX_TRANSLATE_CHARS + 1);
    assert.equal((await translateText(long, { to: "fr" })).ok, false);
  });

  it("says so plainly when the service cannot be reached", async () => {
    const got = await translateText("hello", { to: "fr", fetch: reply(body("bonjour"), false) });
    assert.equal(got.ok, false);
    assert.match(got.ok === false ? got.reason : "", /Could not reach/);
  });

  it("says so plainly when there is no translation in the answer", async () => {
    const got = await translateText("qwertyx", { to: "fr", fetch: reply({ responseStatus: 200 }) });
    assert.equal(got.ok, false);
    assert.match(got.ok === false ? got.reason : "", /No French/);
  });
});
