import assert from "node:assert/strict";
import { test } from "node:test";
import { codeToSecret, deriveKeys, newSecret, newerThan, open, recordId, seal, secretToCode } from "./crypto.ts";

test("a recovery code round-trips and catches typos", () => {
  const s = newSecret();
  const code = secretToCode(s);
  assert.match(code, /^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/);
  assert.deepEqual(codeToSecret(code), s);
  assert.deepEqual(codeToSecret(code.toLowerCase().replace(/-/g, " ")), s, "case and spacing do not matter");
  const typo = code.slice(0, 5) + (code[5] === "A" ? "B" : "A") + code.slice(6);
  assert.equal(codeToSecret(typo), null);
});

test("sealed records open with the right key only, and are not readable", async () => {
  const keys = await deriveKeys(newSecret());
  const other = await deriveKeys(newSecret());
  const env = { key: "nutrition/2026-10-04", value: '{"items":[{"name":"Client X lunch"}]}', t: 1, device: "phone" };
  const blob = await seal(keys, env);
  assert.ok(!blob.includes("Client") && !blob.includes("nutrition"), "nothing readable on the wire");
  assert.deepEqual(await open(keys, blob), env);
  assert.equal(await open(other, blob), null);
  const tampered = blob.slice(0, -2) + (blob.endsWith("A") ? "BB" : "AA");
  assert.equal(await open(keys, tampered), null);
});

test("record ids are stable per key and hide the name", async () => {
  const secret = newSecret();
  const a = await deriveKeys(secret);
  const b = await deriveKeys(secret);
  const id = await recordId(a, "projects#client-x");
  assert.equal(id, await recordId(b, "projects#client-x"));
  assert.notEqual(id, await recordId(a, "projects#client-y"));
  assert.ok(!id.includes("client"));
});

test("newest edit per record wins, ties settle the same everywhere", () => {
  const seen = new Map([["todos#a", { t: 5, device: "pc" }]]);
  const got = newerThan(
    [
      { key: "todos#a", value: "old", t: 4, device: "phone" },
      { key: "todos#a", value: "new", t: 6, device: "phone" },
      { key: "todos#b", value: "x", t: 1, device: "phone" },
      { key: "todos#b", value: "y", t: 1, device: "pc" },
    ],
    seen,
  );
  assert.deepEqual(got.map((e) => e.value).sort(), ["new", "x"]);
});
