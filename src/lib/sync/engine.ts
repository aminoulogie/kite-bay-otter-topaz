/**
 * Keeps this device and your other devices in step through the relay.
 *
 * Every few seconds, and whenever the app changes or comes back to the front:
 *
 *   1. PULL — fetch what is newer than the last sequence number seen, unlock
 *      it, and apply each record that is newer than what this device has.
 *   2. PUSH — find the records that changed here since the last push, lock
 *      them, and send them.
 *
 * What this device last sent or received is remembered as a short hash per
 * record, not a second copy of the data, so the bookkeeping stays small.
 * A record changed here and not yet sent is never overwritten by a pull: it
 * goes out next with a newer time, and the other devices take it.
 */

import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import { codeToSecret, deriveAccess, deriveKeys, newerThan, open, openBytes, recordId, seal, sealBytes, type Envelope, type SyncKeys } from "./crypto.ts";
import type { BackupInfo } from "./server-core.ts";
import { applyChanges, fieldOf, toRecords, type Change, type State } from "./records.ts";

export interface SyncMeta {
  url: string;
  /** The recovery code. Stored on this device only. */
  code: string;
  device: string;
  seq: number;
  /** Per record: hash of the value this device last synced, and its time. */
  known: Record<string, { h: string; t: number; d: string }>;
  lastSync?: number;
  lastError?: string;
  /** Local date of the last daily backup this device uploaded. */
  lastBackup?: string;
}

/** Characters per uploaded backup part (the server takes up to 1,000,000). */
export const BACKUP_PART = 900_000;

const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** One pull that changed something here, with what each record held before. */
export interface SyncHistoryEntry {
  at: number;
  /** Devices the changes came from. */
  from: string[];
  changes: { key: string; before: string | null; after: string | null }[];
}

/** Pulls remembered for undo, newest last, and the space they may take. */
export const HISTORY_ENTRIES = 15;
// Browser storage is ~5 MB for the whole app, most of it the data itself.
export const HISTORY_CHARS = 400_000;

/** Older entries go first until the history fits. */
export function trimHistory(h: SyncHistoryEntry[]): SyncHistoryEntry[] {
  let out = h.slice(-HISTORY_ENTRIES);
  const size = (e: SyncHistoryEntry) => e.changes.reduce((a, c) => a + (c.before?.length ?? 0) + (c.after?.length ?? 0) + c.key.length, 0);
  let total = out.reduce((a, e) => a + size(e), 0);
  while (out.length > 1 && total > HISTORY_CHARS) {
    total -= size(out[0]!);
    out = out.slice(1);
  }
  return out;
}

export interface SyncHost {
  /** The persisted part of the app's state. */
  read(): State;
  /** Merge changed fields into the app's state. */
  write(next: State): void;
  load(): SyncMeta | null;
  save(meta: SyncMeta | null): void;
  fetch: typeof fetch;
  /** Where pulled changes are remembered, so one can be undone. Optional. */
  loadHistory?(): SyncHistoryEntry[];
  saveHistory?(h: SyncHistoryEntry[]): void;
}

/** cyrb53: a fast 53-bit hash, plenty to tell whether a record changed. */
export function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const BATCH = 200;

export class SyncEngine {
  private keys: SyncKeys | null = null;
  private access: { vault: string; token: string } | null = null;
  private busy: Promise<void> | null = null;

  private host: SyncHost;

  constructor(host: SyncHost) {
    this.host = host;
  }

  meta(): SyncMeta | null {
    return this.host.load();
  }

  private async ready(meta: SyncMeta): Promise<void> {
    if (this.keys && this.access) return;
    const secret = codeToSecret(meta.code);
    if (!secret) throw new Error("The recovery code on this device is damaged.");
    this.keys = await deriveKeys(secret);
    this.access = await deriveAccess(secret);
  }

  private async call(meta: SyncMeta, path: string, init?: RequestInit): Promise<Response> {
    const res = await this.host.fetch(meta.url.replace(/\/+$/, "") + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Vault": this.access!.vault,
        Authorization: `Bearer ${this.access!.token}`,
      },
    });
    if (!res.ok) throw new Error(res.status === 401 ? "The server refused this code." : `Server error ${res.status}`);
    return res;
  }

  /**
   * Start syncing. "create" makes this device's data the vault's starting
   * point; "join" replaces this device's synced data with the vault's.
   */
  async enable(url: string, code: string, mode: "create" | "join"): Promise<void> {
    if (!codeToSecret(code)) throw new Error("That code is not valid — check for a typo.");
    const device = Math.random().toString(36).slice(2, 10);
    const meta: SyncMeta = { url: url.trim(), code, device, seq: 0, known: {} };
    this.keys = null;
    this.access = null;
    await this.ready(meta);
    if (mode === "join") {
      const envs = await this.pullAll(meta);
      const remote = new Map<string, Envelope>();
      for (const e of newerThan(envs, new Map())) remote.set(e.key, e);
      const local = toRecords(this.host.read());
      const changes: Change[] = [];
      for (const [k, e] of remote) if (local.get(k) !== (e.value ?? undefined)) changes.push({ key: k, value: e.value });
      for (const k of local.keys()) if (!remote.has(k)) changes.push({ key: k, value: null });
      this.host.write(applyChanges(this.host.read(), changes));
      for (const [k, e] of remote) if (e.value !== null) meta.known[k] = { h: hash(e.value), t: e.t, d: e.device };
    }
    this.host.save(meta);
    await this.push(meta);
    meta.lastSync = Date.now();
    this.host.save(meta);
  }

  disable(): void {
    this.host.save(null);
    this.keys = null;
    this.access = null;
  }

  /** Pull, then push. Overlapping calls share one run. */
  sync(): Promise<void> {
    if (this.busy) return this.busy;
    this.busy = (async () => {
      const meta = this.host.load();
      if (!meta) return;
      try {
        await this.ready(meta);
        await this.pull(meta);
        await this.push(meta);
        meta.lastSync = Date.now();
        meta.lastError = undefined;
        // Once a day, after a clean sync. The first device of the day takes
        // it and the others leave it be: a later copy would carry whatever
        // went wrong during the day over the good one. A backup failing must
        // never stop syncing, so it is simply tried again next time.
        const today = localDay();
        if (meta.lastBackup !== today) {
          try {
            const res = await this.call(meta, "/v1/backups");
            const have = ((await res.json()) as { items: BackupInfo[] }).items.some((b) => b.day === today);
            if (have) meta.lastBackup = today;
            else await this.uploadBackup(meta);
          } catch {
            /* next sync tries again */
          }
        }
      } catch (err) {
        meta.lastError = err instanceof Error ? err.message : String(err);
      }
      this.host.save(meta);
    })().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }

  history(): SyncHistoryEntry[] {
    return this.host.loadHistory?.() ?? [];
  }

  /**
   * Put back what a pull replaced, then send that out so the other devices
   * follow. A record edited again since the pull is left as it is: undoing a
   * sync must never throw away work done after it. Returns how many records
   * were put back.
   */
  async undo(at: number): Promise<number> {
    const all = this.history();
    const entry = all.find((e) => e.at === at);
    if (!entry) return 0;
    const local = toRecords(this.host.read());
    const back: Change[] = entry.changes
      .filter((c) => (local.get(c.key) ?? null) === c.after)
      .map((c) => ({ key: c.key, value: c.before }));
    if (back.length) this.host.write(applyChanges(this.host.read(), back));
    this.host.saveHistory?.(all.filter((e) => e.at !== at));
    await this.sync();
    return back.length;
  }

  /** Encrypt everything this device has and keep it on the server as today's backup. */
  private async uploadBackup(meta: SyncMeta): Promise<{ day: string; size: number }> {
    const day = localDay();
    const snapshot = JSON.stringify({ v: 1, at: Date.now(), device: meta.device, records: Object.fromEntries(toRecords(this.host.read())) });
    const blob = await sealBytes(this.keys!, gzipSync(strToU8(snapshot), { level: 6 }));
    const parts = Math.ceil(blob.length / BACKUP_PART);
    for (let i = 0; i < parts; i++) {
      await this.call(meta, "/v1/backup", {
        method: "POST",
        body: JSON.stringify({ day, part: i, parts, blob: blob.slice(i * BACKUP_PART, (i + 1) * BACKUP_PART) }),
      });
    }
    meta.lastBackup = day;
    this.host.save(meta);
    return { day, size: blob.length };
  }

  /** Back up now, whatever the day. */
  async backupNow(): Promise<{ day: string; size: number }> {
    const meta = this.host.load();
    if (!meta) throw new Error("Sync is off on this device.");
    await this.ready(meta);
    return this.uploadBackup(meta);
  }

  /** The backups the server holds, oldest first. */
  async backups(): Promise<BackupInfo[]> {
    const meta = this.host.load();
    if (!meta) return [];
    await this.ready(meta);
    const res = await this.call(meta, "/v1/backups");
    return ((await res.json()) as { items: BackupInfo[] }).items;
  }

  /**
   * Make this device what it was on `day`, then send that to the others.
   *
   * It goes into the sync history first, so a restore can be undone like any
   * sync. Kinds of data the backup does not know about (it predates them) are
   * left alone rather than wiped. Returns the number of records changed.
   */
  async restoreBackup(day: string): Promise<number> {
    const meta = this.host.load();
    if (!meta) throw new Error("Sync is off on this device.");
    await this.ready(meta);
    const list = await this.backups();
    const info = list.find((b) => b.day === day);
    if (!info) throw new Error("That backup is no longer on the server.");
    let blob = "";
    for (let i = 0; i < info.parts; i++) {
      const res = await this.call(meta, `/v1/backup?day=${day}&part=${i}`);
      blob += ((await res.json()) as { blob: string }).blob;
    }
    const bytes = await openBytes(this.keys!, blob);
    if (!bytes) throw new Error("That backup could not be unlocked with this device's code.");
    const snap = JSON.parse(strFromU8(gunzipSync(bytes))) as { records: Record<string, string> };
    const wanted = new Map(Object.entries(snap.records).filter(([k]) => fieldOf(k) !== "syncDevices"));
    const fields = new Set([...wanted.keys()].map(fieldOf));
    const local = toRecords(this.host.read());
    const changes: { key: string; before: string | null; after: string | null }[] = [];
    for (const [k, v] of wanted) if (local.get(k) !== v) changes.push({ key: k, before: local.get(k) ?? null, after: v });
    for (const [k, v] of local) if (!wanted.has(k) && fields.has(fieldOf(k))) changes.push({ key: k, before: v, after: null });
    if (!changes.length) return 0;
    if (this.host.saveHistory) {
      this.host.saveHistory(trimHistory([...(this.host.loadHistory?.() ?? []), { at: Date.now(), from: [`backup:${day}`], changes }]));
    }
    this.host.write(applyChanges(this.host.read(), changes.map((c) => ({ key: c.key, value: c.after }))));
    await this.sync();
    return changes.length;
  }

  private async pullAll(meta: SyncMeta): Promise<Envelope[]> {
    const out: Envelope[] = [];
    for (;;) {
      const res = await this.call(meta, `/v1/pull?after=${meta.seq}`);
      const body = (await res.json()) as { items: { id: string; seq: number; blob: string }[]; more: boolean };
      for (const it of body.items) {
        const env = await open(this.keys!, it.blob);
        if (env) out.push(env);
        meta.seq = Math.max(meta.seq, it.seq);
      }
      if (!body.more || !body.items.length) return out;
    }
  }

  private dirty(meta: SyncMeta, records: Map<string, string>, state: State): Set<string> {
    const out = new Set<string>();
    for (const [k, v] of records) if (meta.known[k]?.h !== hash(v)) out.add(k);
    // A record this device knew of and no longer has was deleted here — but
    // only if this device has that KIND of data at all. A device running an
    // older version that does not know a field (time entries, say) has none
    // of its records, and must not tell the others to delete theirs.
    for (const k of Object.keys(meta.known)) if (!records.has(k) && fieldOf(k) in state) out.add(k);
    return out;
  }

  private async pull(meta: SyncMeta): Promise<void> {
    const envs = await this.pullAll(meta);
    if (!envs.length) return;
    const seen = new Map(Object.entries(meta.known).map(([k, v]) => [k, { t: v.t, device: v.d }]));
    const local = toRecords(this.host.read());
    const dirty = this.dirty(meta, local, this.host.read());
    const fresh = newerThan(envs, seen).filter((e) => e.device !== meta.device && !dirty.has(e.key));
    if (!fresh.length) return;
    const changes = fresh
      .map((e) => ({ key: e.key, before: local.get(e.key) ?? null, after: e.value }))
      .filter((c) => c.before !== c.after);
    if (changes.length && this.host.saveHistory) {
      const entry: SyncHistoryEntry = { at: Date.now(), from: [...new Set(fresh.map((e) => e.device))], changes };
      this.host.saveHistory(trimHistory([...(this.host.loadHistory?.() ?? []), entry]));
    }
    this.host.write(applyChanges(this.host.read(), fresh.map((e) => ({ key: e.key, value: e.value }))));
    for (const e of fresh) {
      if (e.value === null) delete meta.known[e.key];
      else meta.known[e.key] = { h: hash(e.value), t: e.t, d: e.device };
    }
  }

  private async push(meta: SyncMeta): Promise<void> {
    const records = toRecords(this.host.read());
    const keys = [...this.dirty(meta, records, this.host.read())];
    for (let i = 0; i < keys.length; i += BATCH) {
      const slice = keys.slice(i, i + BATCH);
      const envs: Envelope[] = slice.map((k) => ({
        key: k,
        value: records.get(k) ?? null,
        // Always after anything this record has carried, even with a slow clock.
        t: Math.max(Date.now(), (meta.known[k]?.t ?? 0) + 1),
        device: meta.device,
      }));
      const items = await Promise.all(
        envs.map(async (e) => ({ id: await recordId(this.keys!, e.key), blob: await seal(this.keys!, e) })),
      );
      await this.call(meta, "/v1/push", { method: "POST", body: JSON.stringify({ items }) });
      for (const e of envs) {
        if (e.value === null) delete meta.known[e.key];
        else meta.known[e.key] = { h: hash(e.value), t: e.t, d: e.device };
      }
      this.host.save(meta);
    }
  }
}
