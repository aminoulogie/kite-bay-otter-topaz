/**
 * The slice of the File System Access API TypeScript's own DOM lib does not
 * ship yet. `FileSystemDirectoryHandle`/`FileSystemFileHandle` themselves are
 * already typed (used for drag-and-drop); permissions and the picker are not.
 * See lib/vault-sync.ts, the only caller.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
  mode?: "read" | "readwrite";
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
