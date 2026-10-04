/**
 * The sync server, minus the host: a relay that stores encrypted records and
 * hands back whatever is newer than a device last saw.
 *
 * It cannot read anything. A vault is an opaque id; each record is an opaque
 * id and a sealed blob (see crypto.ts). Only the newest blob per record is
 * kept, so the store grows with how much data there is, not how often it
 * changes. Every write gets a vault-wide sequence number, and a device asks
 * for "everything after N".
 *
 * Written against a small storage interface so it runs the same on
 * Cloudflare (server/sync/worker.ts, D1) and in the tests (in memory).
 */

export interface StoredRecord {
  id: string;
  seq: number;
  blob: string;
}

export interface SyncStorage {
  vault(vault: string): Promise<{ tokenHash: string } | null>;
  createVault(vault: string, tokenHash: string): Promise<void>;
  /** Store the items with consecutive sequence numbers; returns the last one. */
  put(vault: string, items: { id: string; blob: string }[]): Promise<number>;
  after(vault: string, seq: number, limit: number): Promise<StoredRecord[]>;
}

export const MAX_ITEMS = 500;
export const MAX_BLOB = 512 * 1024;
export const PAGE = 500;

const ID = /^[A-Za-z0-9_-]{8,64}$/;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Vault",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare, so a wrong token cannot be guessed a character at a time. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export async function handle(req: Request, store: SyncStorage): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, service: "soma-sync" });

  const vault = req.headers.get("X-Vault") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!ID.test(vault) || token.length < 32 || token.length > 128) return json({ error: "unauthorized" }, 401);

  // A vault is claimed by the first device to use it; after that its token
  // must match. The token is derived from the secret, so only your devices
  // have it, and only its hash is stored.
  const hash = await sha256(token);
  const v = await store.vault(vault);
  if (!v) await store.createVault(vault, hash);
  else if (!same(v.tokenHash, hash)) return json({ error: "unauthorized" }, 401);

  if (url.pathname === "/v1/push" && req.method === "POST") {
    let body: { items?: { id?: unknown; blob?: unknown }[] };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ seq: null });
    if (items.length > MAX_ITEMS) return json({ error: `at most ${MAX_ITEMS} items` }, 413);
    const clean: { id: string; blob: string }[] = [];
    for (const it of items) {
      if (typeof it.id !== "string" || !ID.test(it.id) || typeof it.blob !== "string" || it.blob.length > MAX_BLOB) {
        return json({ error: "bad item" }, 400);
      }
      clean.push({ id: it.id, blob: it.blob });
    }
    return json({ seq: await store.put(vault, clean) });
  }

  if (url.pathname === "/v1/pull" && req.method === "GET") {
    const after = Math.max(0, Math.floor(Number(url.searchParams.get("after")) || 0));
    const items = await store.after(vault, after, PAGE);
    return json({ items, more: items.length === PAGE });
  }

  return json({ error: "not found" }, 404);
}

/** In-memory storage, for tests and local runs. */
export function memoryStorage(): SyncStorage {
  const vaults = new Map<string, { tokenHash: string; seq: number; records: Map<string, StoredRecord> }>();
  return {
    async vault(v) {
      const x = vaults.get(v);
      return x ? { tokenHash: x.tokenHash } : null;
    },
    async createVault(v, tokenHash) {
      if (!vaults.has(v)) vaults.set(v, { tokenHash, seq: 0, records: new Map() });
    },
    async put(v, items) {
      const x = vaults.get(v)!;
      for (const it of items) {
        x.seq += 1;
        x.records.set(it.id, { id: it.id, seq: x.seq, blob: it.blob });
      }
      return x.seq;
    },
    async after(v, seq, limit) {
      const x = vaults.get(v);
      if (!x) return [];
      return [...x.records.values()].filter((r) => r.seq > seq).sort((a, b) => a.seq - b.seq).slice(0, limit);
    },
  };
}
