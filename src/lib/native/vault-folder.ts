import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * The vault folder on iPhone.
 *
 * A web view on iOS has no folder access at all, so the folder is picked and
 * read natively (ios/App/App/VaultFolderPlugin.swift). This wraps that plugin
 * in the same shape as the desktop's File System Access handles — the few
 * methods lib/vault-sync.ts actually calls — so the one sync routine, with its
 * merge rules and its photo files, runs unchanged on both. Pick the iCloud
 * Drive folder your PC's vault is already in and the two share it.
 */

interface Entry {
  name: string;
  dir: boolean;
}

const Vault = registerPlugin<{
  pick(): Promise<{ picked: boolean; name?: string }>;
  current(): Promise<{ picked: boolean; name?: string }>;
  forget(): Promise<void>;
  list(o: { path: string }): Promise<{ entries: Entry[] }>;
  stat(o: { path: string }): Promise<{ exists: boolean; dir?: boolean; size?: number; modified?: number }>;
  mkdir(o: { path: string }): Promise<void>;
  read(o: { path: string }): Promise<{ data: string; modified: number }>;
  write(o: { path: string; data: string }): Promise<void>;
}>("VaultFolder");

export function isNativeVault(): boolean {
  return Capacitor.getPlatform() === "ios";
}

const notFound = () => new DOMException("Not found", "NotFoundError");

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const blobToBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsDataURL(b);
  });

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

class NativeFile {
  readonly kind = "file" as const;
  constructor(
    readonly path: string,
    readonly name: string,
  ) {}

  async getFile(): Promise<File> {
    const r = await Vault.read({ path: this.path }).catch(() => {
      throw notFound();
    });
    return new File([base64ToBytes(r.data)], this.name, { lastModified: r.modified || Date.now() });
  }

  /** The file's size without reading it; -1 when iCloud has not downloaded it. */
  async sizeHint(): Promise<number> {
    const s = await Vault.stat({ path: this.path });
    return s.exists ? (s.size ?? -1) : -2;
  }

  async createWritable() {
    const parts: BlobPart[] = [];
    const path = this.path;
    return {
      async write(data: BlobPart) {
        parts.push(data);
      },
      async close() {
        await Vault.write({ path, data: await blobToBase64(new Blob(parts)) });
      },
    };
  }
}

class NativeDir {
  readonly kind = "directory" as const;
  constructor(
    readonly path: string,
    readonly name: string,
  ) {}

  async getDirectoryHandle(name: string, opts: { create?: boolean } = {}): Promise<NativeDir> {
    const path = join(this.path, name);
    const s = await Vault.stat({ path });
    if (!s.exists) {
      if (!opts.create) throw notFound();
      await Vault.mkdir({ path });
    } else if (!s.dir) {
      throw new DOMException("Not a folder", "TypeMismatchError");
    }
    return new NativeDir(path, name);
  }

  async getFileHandle(name: string, opts: { create?: boolean } = {}): Promise<NativeFile> {
    const path = join(this.path, name);
    if (!opts.create) {
      const s = await Vault.stat({ path });
      if (!s.exists) throw notFound();
    }
    return new NativeFile(path, name);
  }

  async *entries(): AsyncGenerator<[string, NativeDir | NativeFile]> {
    const { entries } = await Vault.list({ path: this.path });
    for (const e of entries) {
      const path = join(this.path, e.name);
      yield [e.name, e.dir ? new NativeDir(path, e.name) : new NativeFile(path, e.name)];
    }
  }
}

/** Handed to lib/vault-sync.ts, which only uses what NativeDir provides. */
const asHandle = (name: string) => new NativeDir("", name) as unknown as FileSystemDirectoryHandle;

/** Shows the Files folder picker; null when cancelled. */
export async function pickNativeVault(): Promise<FileSystemDirectoryHandle | null> {
  const r = await Vault.pick();
  return r.picked ? asHandle(r.name ?? "Vault") : null;
}

/** The folder chosen before, if it can still be reached. */
export async function storedNativeVault(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const r = await Vault.current();
    return r.picked ? asHandle(r.name ?? "Vault") : null;
  } catch {
    // A build without the plugin.
    return null;
  }
}

export async function forgetNativeVault(): Promise<void> {
  await Vault.forget().catch(() => undefined);
}
