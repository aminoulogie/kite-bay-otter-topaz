/**
 * SOMA sync relay on Cloudflare Workers + D1. All the logic is in
 * src/lib/sync/server-core.ts; this only adapts it to D1. Deployed by
 * .github/workflows/sync-server.yml.
 */
import { handle, type StoredRecord, type SyncStorage } from "../../src/lib/sync/server-core.ts";

/** The slice of D1's API used here, so no Cloudflare type package is needed. */
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

function d1Storage(db: D1Database): SyncStorage {
  return {
    async vault(vault) {
      const row = await db.prepare("SELECT token_hash FROM vaults WHERE vault = ?").bind(vault).first<{ token_hash: string }>();
      return row ? { tokenHash: row.token_hash } : null;
    },
    async createVault(vault, tokenHash) {
      await db.prepare("INSERT OR IGNORE INTO vaults (vault, token_hash, seq) VALUES (?, ?, 0)").bind(vault, tokenHash).run();
    },
    async put(vault, items) {
      // One transaction: reserve the numbers and write the rows together, so a
      // pull can never see a later number before an earlier one is written.
      const n = items.length;
      const stmts = [db.prepare("UPDATE vaults SET seq = seq + ? WHERE vault = ?").bind(n, vault)];
      items.forEach((it, i) => {
        stmts.push(
          db
            .prepare(
              `INSERT INTO records (vault, id, seq, blob) VALUES (?, ?, (SELECT seq FROM vaults WHERE vault = ?) - ?, ?)
               ON CONFLICT (vault, id) DO UPDATE SET seq = excluded.seq, blob = excluded.blob`,
            )
            .bind(vault, it.id, vault, n - 1 - i, it.blob),
        );
      });
      await db.batch(stmts);
      const row = await db.prepare("SELECT seq FROM vaults WHERE vault = ?").bind(vault).first<{ seq: number }>();
      return row?.seq ?? 0;
    },
    async putBackupPart(vault, day, part, parts, blob, created) {
      const stmts: D1Statement[] = [];
      // A new upload of the day replaces the old one, parts and all.
      if (part === 0) stmts.push(db.prepare("DELETE FROM backups WHERE vault = ? AND day = ?").bind(vault, day));
      stmts.push(
        db
          .prepare(
            `INSERT INTO backups (vault, day, part, parts, blob, created) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (vault, day, part) DO UPDATE SET parts = excluded.parts, blob = excluded.blob, created = excluded.created`,
          )
          .bind(vault, day, part, parts, blob, created),
      );
      await db.batch(stmts);
    },
    async listBackups(vault) {
      const { results } = await db
        .prepare(
          `SELECT day, MAX(parts) AS parts, SUM(LENGTH(blob)) AS size, MAX(created) AS created, COUNT(*) AS n
           FROM backups WHERE vault = ? GROUP BY day ORDER BY day`,
        )
        .bind(vault)
        .all<{ day: string; parts: number; size: number; created: number; n: number }>();
      return results.filter((r) => r.n === r.parts).map(({ day, parts, size, created }) => ({ day, parts, size, created }));
    },
    async getBackupPart(vault, day, part) {
      const row = await db
        .prepare("SELECT blob FROM backups WHERE vault = ? AND day = ? AND part = ?")
        .bind(vault, day, part)
        .first<{ blob: string }>();
      return row?.blob ?? null;
    },
    async pruneBackups(vault, day) {
      await db.prepare("DELETE FROM backups WHERE vault = ? AND day < ?").bind(vault, day).run();
    },
    async after(vault, seq, limit) {
      const { results } = await db
        .prepare("SELECT id, seq, blob FROM records WHERE vault = ? AND seq > ? ORDER BY seq LIMIT ?")
        .bind(vault, seq, limit)
        .all<StoredRecord>();
      return results;
    },
  };
}

export default {
  async fetch(request: Request, env: { DB: D1Database }): Promise<Response> {
    try {
      return await handle(request, d1Storage(env.DB));
    } catch {
      return new Response(JSON.stringify({ error: "server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
