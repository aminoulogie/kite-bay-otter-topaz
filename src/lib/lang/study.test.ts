import assert from "node:assert/strict";
import { test } from "node:test";
import { LANGUAGES, LEVELS, WORDS, type LangCode } from "./words.ts";
import { drawAll, drawFor, hash, learn, progress, remaining, unlearn, wordFor, type LangTrack } from "./study.ts";

const track = (code: LangCode, learned: string[] = []): LangTrack =>
  ({ code, level: "A1", learned });

const CODES: LangCode[] = ["zh", "de", "it", "es"];

test("every shipped language has a list, and every entry is filled in", () => {
  for (const code of CODES) {
    const list = WORDS[code];
    assert.ok(list.length >= 60, `${code} has only ${list.length}`);
    for (const w of list) {
      assert.ok(w.w.trim(), `${code} has a blank word`);
      assert.ok(w.en.trim(), `${code}: ${w.w} has no translation`);
    }
  }
});

test("no list repeats a word", () => {
  for (const code of CODES) {
    const seen = new Set(WORDS[code].map((w) => w.w));
    assert.equal(seen.size, WORDS[code].length, `${code} repeats a word`);
  }
});

test("Chinese carries a reading, because a character without one cannot be said", () => {
  for (const w of WORDS.zh) assert.ok(w.r?.trim(), `${w.w} has no pinyin`);
  // And the written form is not accidentally English, which is easy to fat-finger.
  for (const w of WORDS.zh) {
    assert.ok(!/^[a-zA-Z ()]+$/.test(w.w), `${w.w} looks like English, not Chinese`);
  }
});

test("the languages the app offers all have lists", () => {
  for (const meta of LANGUAGES) assert.ok(WORDS[meta.code]?.length, meta.code);
  assert.equal(LANGUAGES.filter((l) => l.romanised).map((l) => l.code).join(), "zh");
});

test("the same day gives the same word, however many times you ask", () => {
  const a = wordFor("de", "2026-09-14", []);
  const b = wordFor("de", "2026-09-14", []);
  assert.deepEqual(a, b);
});

test("a different day gives a different word", () => {
  const days = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
  const drawn = new Set(days.map((d) => wordFor("de", d, [])?.w));
  assert.ok(drawn.size >= 4, `five days drew only ${drawn.size} distinct words`);
});

test("two languages do not draw from the same position in their lists", () => {
  // Hashing the language in as well is what stops three tracks feeling like
  // one list read three times.
  const day = "2026-09-14";
  const idx = CODES.map((c) => WORDS[c].findIndex((w) => w.w === wordFor(c, day, [])?.w));
  assert.ok(new Set(idx).size > 1, `every language drew index ${idx[0]}`);
});

test("a learned word is never drawn again", () => {
  let t = track("it");
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const w = wordFor("it", `2026-10-${String(i + 1).padStart(2, "0")}`, t.learned);
    assert.ok(w, "ran out too early");
    assert.ok(!seen.has(w!.w), `${w!.w} came up twice`);
    seen.add(w!.w);
    t = learn(t, w!.w);
  }
});

test("learning the same word twice does not shorten the pool", () => {
  const before = remaining("es", []).length;
  let t = track("es");
  t = learn(t, WORDS.es[0]!.w);
  t = learn(t, WORDS.es[0]!.w);
  assert.equal(t.learned.length, 1);
  assert.equal(remaining("es", t.learned).length, before - 1);
});

test("a blank word is not learnable", () => {
  const t = learn(track("es"), "   ");
  assert.deepEqual(t.learned, []);
});

test("a word can be put back", () => {
  let t = learn(track("de"), WORDS.de[3]!.w);
  assert.equal(t.learned.length, 1);
  t = unlearn(t, WORDS.de[3]!.w);
  assert.deepEqual(t.learned, []);
  assert.equal(unlearn(t, "never-learned"), t, "unlearning nothing changes nothing");
});

test("a finished list draws nothing rather than repeating itself", () => {
  const all = WORDS.zh.map((w) => w.w);
  assert.equal(wordFor("zh", "2026-09-14", all), null);
  assert.deepEqual(remaining("zh", all), []);
  const d = drawFor(track("zh", all), "2026-09-14");
  assert.equal(d.word, null);
  assert.equal(d.left, 0);
  assert.equal(d.learnedCount, WORDS.zh.length);
});

test("the draw reports how far through the list you are", () => {
  const d = drawFor(track("it", [WORDS.it[0]!.w, WORDS.it[1]!.w]), "2026-09-14");
  assert.equal(d.learnedCount, 2);
  assert.equal(d.total, WORDS.it.length);
  assert.equal(d.left, WORDS.it.length - 3, "minus the two learned and today's");
});

test("progress counts only words that are actually in the list", () => {
  assert.equal(progress(track("de", [])), 0);
  assert.equal(progress(track("de", ["not-a-german-word"])), 0);
  assert.equal(progress(track("de", WORDS.de.map((w) => w.w))), 100);
});

test("every language being learned gets its own draw", () => {
  const all = drawAll([track("zh"), track("de"), track("it")], "2026-09-14");
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((d) => d.code), ["zh", "de", "it"]);
  assert.ok(all.every((d) => d.word));
  assert.deepEqual(drawAll([], "2026-09-14"), []);
});

test("the hash is stable and does not overflow into a negative", () => {
  assert.equal(hash("2026-09-14:de"), hash("2026-09-14:de"));
  assert.notEqual(hash("a"), hash("b"));
  for (const s of ["", "a", "2026-09-14:zh", "x".repeat(500)]) {
    assert.ok(hash(s) >= 0 && Number.isInteger(hash(s)), s.slice(0, 10));
  }
});

test("the levels are the Common European ones, in order", () => {
  assert.deepEqual([...LEVELS], ["A1", "A2", "B1", "B2", "C1", "C2"]);
});
