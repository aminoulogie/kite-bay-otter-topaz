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
