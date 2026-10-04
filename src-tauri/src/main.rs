// SOMA for Windows: a native window around the web app.
//
// The window loads SOMA from GitHub Pages, so every push to main reaches the
// PC with no reinstall (the page's service worker keeps it working offline).
// Data lives in this app's own WebView2 profile and syncs with the phone
// through Settings › Device sync.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // A second launch focuses the window that is already open.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // Comes back where you left it: size, position, maximised or not.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("SOMA failed to start");
}
