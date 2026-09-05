/**
 * A checksum over a backup payload, so a truncated or edited file is caught
 * before anything is written.
 *
 * FNV-1a rather than SHA-256: SubtleCrypto is async and unavailable on
 * insecure origins, and this guards against a half-written file or a mangled
 * transfer, not against forgery. A hash that always works is worth more here
 * than a stronger one that sometimes cannot run.
 *
 * Its own module so it can be tested without dragging in the IndexedDB photo
 * store that backup.ts depends on.
 */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
