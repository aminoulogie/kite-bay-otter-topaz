/**
 * End-to-end encryption for sync.
 *
 * One 256-bit secret, made on the first device and copied to the others by QR
 * code or a typed recovery code. It never leaves your devices. From it come two
 * keys:
 *
 *   - an AES-256-GCM key that locks every record before it is uploaded, and
 *   - an HMAC key that turns a record's name ("nutrition/2026-10-04") into an
 *     opaque id, so the server cannot even see WHAT changed, only that
 *     something did.
 *
 * The server stores ids and ciphertext. Without the secret neither means
 * anything, which is why the server can be anyone's — the host's security
 * protects availability, not privacy.
 *
 * WebCrypto only: no library, the same code in the app and in Node's tests.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

/** Crockford base32: no I, L, O or U, so a hand-typed code has no lookalikes. */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newSecret(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

/** The secret as a recovery code: 52 characters in groups of four, plus a 4-character check. */
export function secretToCode(secret: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of secret) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  out += checksum(out);
  return out.match(/.{1,4}/g)!.join("-");
}

function checksum(s: string): string {
  // Two positions-weighted sums mod 32 — catches a typo or two swapped characters.
  let a = 7;
  let b = 3;
  for (let i = 0; i < s.length; i++) {
    const v = B32.indexOf(s[i]!);
    a = (a + v * (i + 1)) % 1021;
    b = (b * 31 + v) % 1021;
  }
  return B32[a % 32]! + B32[(a >> 5) % 32]! + B32[b % 32]! + B32[(b >> 5) % 32]!;
}

/** The secret back from a recovery code, or null if it was mistyped. */
export function codeToSecret(code: string): Uint8Array | null {
  const clean = code.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== 56) return null;
  const body = clean.slice(0, 52);
  if (checksum(body) !== clean.slice(52)) return null;
  const out = new Uint8Array(32);
  let bits = 0;
  let acc = 0;
  let i = 0;
  for (const ch of body) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      if (i < 32) out[i++] = (acc >>> (bits - 8)) & 255;
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  return i === 32 ? out : null;
}

export interface SyncKeys {
  aes: CryptoKey;
  mac: CryptoKey;
}

/** The two working keys, derived from the secret with HKDF so neither reveals the other. */
export async function deriveKeys(secret: Uint8Array): Promise<SyncKeys> {
  const base = await subtle().importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: enc.encode("soma-sync-v1"), info: enc.encode(info) });
  const aes = await subtle().deriveKey(hkdf("records"), base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const mac = await subtle().deriveKey(hkdf("ids"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  return { aes, mac };
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The opaque id the server knows a record by. Same name, same id, on every device. */
export async function recordId(keys: SyncKeys, name: string): Promise<string> {
  const sig = new Uint8Array(await subtle().sign("HMAC", keys.mac, enc.encode(name)));
  return b64(sig.slice(0, 16));
}

/** What is actually encrypted: the record, when it changed, and on which device. */
export interface Envelope {
  key: string;
  value: string | null;
  /** Milliseconds; the newest edit to a record wins. */
  t: number;
  device: string;
}

export async function seal(keys: SyncKeys, env: Envelope): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, keys.aes, enc.encode(JSON.stringify(env))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

/** The envelope back, or null if the blob was tampered with or locked with another key. */
export async function open(keys: SyncKeys, blob: string): Promise<Envelope | null> {
  try {
    const raw = unb64(blob);
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, keys.aes, raw.slice(12));
    return JSON.parse(dec.decode(pt)) as Envelope;
  } catch {
    return null;
  }
}

/**
 * Which incoming envelopes to apply: newest per record wins; ties go to the
 * higher device id so every device settles on the same answer.
 */
export function newerThan(
  incoming: Envelope[],
  seen: Map<string, { t: number; device: string }>,
): Envelope[] {
  const best = new Map<string, Envelope>();
  for (const e of incoming) {
    const cur = best.get(e.key) ?? (seen.has(e.key) ? ({ ...seen.get(e.key)!, key: e.key, value: null } as Envelope) : undefined);
    if (!cur || e.t > cur.t || (e.t === cur.t && e.device > cur.device)) best.set(e.key, e);
  }
  return [...best.values()].filter((e) => {
    const s = seen.get(e.key);
    return !s || e.t > s.t || (e.t === s.t && e.device > s.device);
  });
}
