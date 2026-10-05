import assert from "node:assert/strict";
import { test } from "node:test";
import { newSecret, secretToCode } from "./crypto.ts";
import { SyncEngine, type SyncHost, type SyncMeta } from "./engine.ts";
import { handle, memoryStorage } from "./server-core.ts";

const URL_ = "https://sync.test";

function device(server: ReturnType<typeof memoryStorage>, initial: Record<string, unknown>) {
  let state = structuredClone(initial);
  let meta: SyncMeta | null = null;
  const host: SyncHost = {
    read: () => state,
    write: (next) => {
      state = { ...state, ...next };
    },
    load: () => (meta ? structuredClone(meta) : null),
    save: (m) => {
      meta = m ? structuredClone(m) : null;
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => handle(new Request(String(input), init), server)) as typeof fetch,
  };
  return { engine: new SyncEngine(host), get: () => state, set: (s: Record<string, unknown>) => (state = s) };
}

test("phone creates, PC joins, edits flow both ways and merge", async () => {
  const server = memoryStorage();
  const code = secretToCode(newSecret());
  const phone = device(server, {
    settings: { accent: "#f00", uiScale: 1.2 },
    todos: [{ id: "a", text: "Audit client X" }],
    nutrition: { "2026-10-04": { items: [{ name: "Oats" }] } },
  });
  const pc = device(server, { settings: { uiScale: 0.9 }, todos: [{ id: "seed", text: "sample" }], nutrition: {} });

  await phone.engine.enable(URL_, code, "create");
  await pc.engine.enable(URL_, code, "join");
  assert.deepEqual(pc.get().todos, [{ id: "a", text: "Audit client X" }], "PC now has the phone's data, not its sample");
  assert.equal((pc.get().settings as { uiScale: number }).uiScale, 0.9, "display size stays per device");

  // PC ticks the task; phone logs lunch. Both sync.
  pc.set({ ...pc.get(), todos: [{ id: "a", text: "Audit client X", done: true }] });
  phone.set({ ...phone.get(), nutrition: { "2026-10-04": { items: [{ name: "Oats" }, { name: "Rice" }] } } });
  await pc.engine.sync();
  await phone.engine.sync();
  await pc.engine.sync();

  assert.deepEqual(phone.get().todos, [{ id: "a", text: "Audit client X", done: true }]);
  assert.equal((pc.get().nutrition as Record<string, { items: unknown[] }>)["2026-10-04"]!.items.length, 2);
});

test("a wrong code cannot read or join", async () => {
  const server = memoryStorage();
  const phone = device(server, { todos: [{ id: "a", text: "secret client" }] });
  await phone.engine.enable(URL_, secretToCode(newSecret()), "create");
  const stranger = device(server, { todos: [] });
  await stranger.engine.enable(URL_, secretToCode(newSecret()), "join");
  assert.deepEqual(stranger.get().todos, [], "a different code is a different, empty vault");
  await assert.rejects(stranger.engine.enable(URL_, "not-a-code", "join"));
});

test("a device on an older version does not delete data it does not know about", async () => {
  const server = memoryStorage();
  const code = secretToCode(newSecret());
  const pc = device(server, { todos: [], timeEntries: [] });
  await pc.engine.enable(URL_, code, "create");
  const phone = device(server, { todos: [] });
  await phone.engine.enable(URL_, code, "join");
  pc.set({ ...pc.get(), timeEntries: [{ id: "t1", projectId: "p", start: 1, end: 2 }] });
  await pc.engine.sync();
  // The old phone pulls the entry into state, but its app keeps no such field.
  await phone.engine.sync();
  const { timeEntries: _drop, ...without } = phone.get() as Record<string, unknown>;
  void _drop;
  phone.set(without);
  await phone.engine.sync();
  await pc.engine.sync();
  assert.deepEqual(pc.get().timeEntries, [{ id: "t1", projectId: "p", start: 1, end: 2 }]);
});

test("a pull can be undone, and the undo reaches the other device; later edits survive it", async () => {
  const server = memoryStorage();
  const code = secretToCode(newSecret());
  const phone = device(server, { todos: [{ id: "a", text: "Audit" }, { id: "b", text: "Invoice" }] });
  const pc = device(server, {});
  let hist: import("./engine.ts").SyncHistoryEntry[] = [];
  const pcHost = (pc.engine as unknown as { host: SyncHost }).host;
  pcHost.loadHistory = () => hist;
  pcHost.saveHistory = (h) => (hist = h);
  await phone.engine.enable(URL_, code, "create");
  await pc.engine.enable(URL_, code, "join");

  // The phone (an old version, say) renames one task and deletes the other.
  phone.set({ todos: [{ id: "a", text: "WRONG" }] });
  await phone.engine.sync();
  await pc.engine.sync();
  assert.deepEqual(pc.get().todos, [{ id: "a", text: "WRONG" }]);
  assert.equal(hist.length, 1);

  // Meanwhile nothing else changed on the PC; undo puts both back and pushes.
  const n = await pc.engine.undo(hist[0]!.at);
  assert.ok(n >= 2);
  assert.deepEqual(pc.get().todos, [{ id: "a", text: "Audit" }, { id: "b", text: "Invoice" }]);
  await phone.engine.sync();
  assert.deepEqual(phone.get().todos, [{ id: "a", text: "Audit" }, { id: "b", text: "Invoice" }]);
  assert.equal(hist.length, 0);

  // A record edited after the pull is not rolled back.
  phone.set({ todos: [{ id: "a", text: "Phone edit" }, { id: "b", text: "Invoice" }] });
  await phone.engine.sync();
  await pc.engine.sync();
  pc.set({ todos: [{ id: "a", text: "PC edit since" }, { id: "b", text: "Invoice" }] });
  await pc.engine.undo(hist[hist.length - 1]!.at);
  assert.equal((pc.get().todos as { text: string }[])[0]!.text, "PC edit since");
});
