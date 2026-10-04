import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, memoryStorage } from "./server-core.ts";

const V = "vault_abcdefgh1234";
const T = "t".repeat(43);
const req = (path: string, init: RequestInit & { token?: string } = {}) =>
  new Request(`https://sync.test${path}`, {
    ...init,
    headers: { "X-Vault": V, Authorization: `Bearer ${init.token ?? T}`, "Content-Type": "application/json" },
  });

test("push then pull returns newer records, newest blob per id", async () => {
  const s = memoryStorage();
  const push = (items: { id: string; blob: string }[]) => handle(req("/v1/push", { method: "POST", body: JSON.stringify({ items }) }), s);
  assert.equal((await (await push([{ id: "rec_aaaaaaaa", blob: "x1" }, { id: "rec_bbbbbbbb", blob: "y1" }])).json()).seq, 2);
  await push([{ id: "rec_aaaaaaaa", blob: "x2" }]);
  const all = await (await handle(req("/v1/pull?after=0"), s)).json();
  assert.deepEqual(all.items.map((i: { blob: string }) => i.blob), ["y1", "x2"]);
  const since = await (await handle(req("/v1/pull?after=2"), s)).json();
  assert.deepEqual(since.items.map((i: { blob: string }) => i.blob), ["x2"]);
});

test("a vault belongs to the first token that used it", async () => {
  const s = memoryStorage();
  assert.equal((await handle(req("/v1/pull?after=0"), s)).status, 200);
  assert.equal((await handle(req("/v1/pull?after=0", { token: "z".repeat(43) }), s)).status, 401);
});

test("junk is refused", async () => {
  const s = memoryStorage();
  assert.equal((await handle(new Request("https://sync.test/v1/pull"), s)).status, 401);
  const bad = await handle(req("/v1/push", { method: "POST", body: JSON.stringify({ items: [{ id: "../etc", blob: "x" }] }) }), s);
  assert.equal(bad.status, 400);
  assert.equal((await handle(new Request("https://sync.test/v1/pull", { method: "OPTIONS" }), s)).status, 204);
});
