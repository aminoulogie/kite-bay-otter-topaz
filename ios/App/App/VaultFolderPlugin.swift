import Capacitor
import Foundation
import UIKit
import UniformTypeIdentifiers

/**
 * A folder you pick in Files — normally the iCloud Drive folder your PC's
 * SOMA vault already lives in — that the app can read and write afterwards.
 *
 * iOS gives a web view no folder access at all, so this is the native half of
 * the vault: pick() shows the system folder picker and keeps a bookmark to
 * the choice, and the rest are plain file operations relative to that folder.
 * The web side wraps them to look like the desktop's File System Access
 * handles (lib/native/vault-folder.ts), so one sync routine serves both.
 *
 * Reads and writes go through NSFileCoordinator: the folder is iCloud's, and
 * iCloud may be uploading, downloading or replacing a file at the same moment.
 * A file iCloud has not downloaded yet is asked for and waited on.
 */
@objc(VaultFolderPlugin)
public class VaultFolderPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "VaultFolderPlugin"
    public let jsName = "VaultFolder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "current", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mkdir", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
    ]

    private static let bookmarkKey = "soma.vault.bookmark"
    private var pickCall: CAPPluginCall?

    // MARK: picking

    @objc func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let picker: UIDocumentPickerViewController
            if #available(iOS 14.0, *) {
                picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
            } else {
                picker = UIDocumentPickerViewController(documentTypes: ["public.folder"], in: .open)
            }
            picker.delegate = self
            picker.allowsMultipleSelection = false
            self.pickCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickCall else { return }
        pickCall = nil
        guard let url = urls.first else {
            call.resolve(["picked": false])
            return
        }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(data, forKey: Self.bookmarkKey)
            call.resolve(["picked": true, "name": url.lastPathComponent])
        } catch {
            call.reject("Could not keep access to that folder: \(error.localizedDescription)")
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pickCall?.resolve(["picked": false])
        pickCall = nil
    }

    @objc func current(_ call: CAPPluginCall) {
        guard let root = resolveRoot() else {
            call.resolve(["picked": false])
            return
        }
        call.resolve(["picked": true, "name": root.lastPathComponent])
    }

    @objc func forget(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
        call.resolve()
    }

    private func resolveRoot() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else { return nil }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else {
            return nil
        }
        if stale, url.startAccessingSecurityScopedResource() {
            if let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
                UserDefaults.standard.set(fresh, forKey: Self.bookmarkKey)
            }
            url.stopAccessingSecurityScopedResource()
        }
        return url
    }

    /// Runs `work` with the folder open, and a URL for `path` inside it.
    /// Paths are relative, "/"-separated, and may not climb out with "..".
    private func withPath(_ call: CAPPluginCall, _ work: (URL) throws -> Void) {
        guard let root = resolveRoot() else {
            call.reject("No vault folder chosen", "NO_FOLDER")
            return
        }
        let path = call.getString("path") ?? ""
        if path.split(separator: "/").contains("..") {
            call.reject("Bad path", "BAD_PATH")
            return
        }
        let scoped = root.startAccessingSecurityScopedResource()
        defer { if scoped { root.stopAccessingSecurityScopedResource() } }
        let url = path.isEmpty ? root : root.appendingPathComponent(path)
        do {
            try work(url)
        } catch let e as VaultError {
            call.reject(e.message, e.code)
        } catch {
            call.reject(error.localizedDescription, "IO")
        }
    }

    struct VaultError: Error {
        let message: String
        let code: String
    }

    /// iCloud keeps a file it has not downloaded as ".name.icloud".
    private func placeholder(for url: URL) -> URL {
        url.deletingLastPathComponent().appendingPathComponent(".\(url.lastPathComponent).icloud")
    }

    private func exists(_ url: URL, isDir: inout ObjCBool) -> Bool {
        FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)
    }

    // MARK: file operations

    @objc func list(_ call: CAPPluginCall) {
        withPath(call) { url in
            var isDir: ObjCBool = false
            guard exists(url, isDir: &isDir), isDir.boolValue else {
                throw VaultError(message: "Not found", code: "NOT_FOUND")
            }
            let items = try FileManager.default.contentsOfDirectory(
                at: url, includingPropertiesForKeys: [.isDirectoryKey], options: []
            )
            var out: [[String: Any]] = []
            for item in items {
                var name = item.lastPathComponent
                // A not-yet-downloaded file is listed under its real name, as
                // Files shows it; reading it fetches it.
                if name.hasPrefix("."), name.hasSuffix(".icloud") {
                    name = String(name.dropFirst().dropLast(".icloud".count))
                } else if name.hasPrefix(".") {
                    continue
                }
                let dir = (try? item.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
                out.append(["name": name, "dir": dir == true])
            }
            call.resolve(["entries": out])
        }
    }

    @objc func stat(_ call: CAPPluginCall) {
        withPath(call) { url in
            var isDir: ObjCBool = false
            if exists(url, isDir: &isDir) {
                let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
                let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
                let modified = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
                call.resolve(["exists": true, "dir": isDir.boolValue, "size": size, "modified": modified * 1000])
            } else if exists(placeholder(for: url), isDir: &isDir) {
                // In iCloud but not on this phone: it exists, size unknown.
                call.resolve(["exists": true, "dir": false, "size": -1, "modified": 0])
            } else {
                call.resolve(["exists": false])
            }
        }
    }

    @objc func mkdir(_ call: CAPPluginCall) {
        withPath(call) { url in
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            call.resolve()
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        withPath(call) { url in
            var isDir: ObjCBool = false
            if !exists(url, isDir: &isDir) {
                if exists(placeholder(for: url), isDir: &isDir) {
                    try? FileManager.default.startDownloadingUbiquitousItem(at: url)
                } else {
                    throw VaultError(message: "Not found", code: "NOT_FOUND")
                }
            }
            // Coordinated reading waits for iCloud to finish downloading.
            var coordError: NSError?
            var result: Data?
            var readError: Error?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordError) { u in
                do { result = try Data(contentsOf: u) } catch { readError = error }
            }
            if let e = coordError ?? (readError as NSError?) { throw e }
            guard let data = result else { throw VaultError(message: "Not found", code: "NOT_FOUND") }
            let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
            let modified = (attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
            call.resolve(["data": data.base64EncodedString(), "modified": modified * 1000])
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        withPath(call) { url in
            guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
                throw VaultError(message: "No data", code: "BAD_DATA")
            }
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            var coordError: NSError?
            var writeError: Error?
            NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordError) { u in
                do { try data.write(to: u, options: .atomic) } catch { writeError = error }
            }
            if let e = coordError ?? (writeError as NSError?) { throw e }
            call.resolve()
        }
    }
}
