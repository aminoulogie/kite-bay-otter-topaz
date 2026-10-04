// Two throwaway devices sync through a live relay (SYNC_URL), each with a
// fresh random vault, and the result is checked. Run by the deploy workflow.
import { newSecret, secretToCode } from "../src/lib/sync/crypto.ts";
import { SyncEngine, type SyncMeta } from "../src/lib/sync/engine.ts";

const url = process.env.SYNC_URL;
if (!url) throw new Error("SYNC_URL not set");

function device(initial: Record<string, unknown>) {
  let state = structuredClone(initial);
  let meta: SyncMeta | null = null;
  const engine = new SyncEngine({
    read: () => state,
    write: (n) => (state = { ...state, ...n }),
    load: () => (meta ? structuredClone(meta) : null),
    save: (m) => (meta = m ? structuredClone(m) : null),
    fetch,
  });
  return { engine, get: () => state, set: (s: Record<string, unknown>) => (state = s) };
}

const code = secretToCode(newSecret());
const a = device({ todos: [{ id: "a", text: "smoke" }] });
const b = device({ todos: [] });
await a.engine.enable(url, code, "create");
await b.engine.enable(url, code, "join");
b.set({ todos: [{ id: "a", text: "smoke", done: true }] });
await b.engine.sync();
await a.engine.sync();
const got = JSON.stringify(a.get().todos);
if (got !== JSON.stringify([{ id: "a", text: "smoke", done: true }])) throw new Error(`sync mismatch: ${got}`);
const err = a.engine.meta()?.lastError || b.engine.meta()?.lastError;
if (err) throw new Error(err);
console.log("sync smoke test passed");
