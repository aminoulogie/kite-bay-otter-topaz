// SOMA for Windows: a native window around the web app.
//
// The window loads SOMA from GitHub Pages, so every push to main reaches the
// PC with no reinstall (the page's service worker keeps it working offline).
// Data lives in this app's own WebView2 profile and syncs with the phone
// through Settings › Device sync.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindowBuilder};

/// WebView2's own defaults, which any extra browser argument would replace.
const WEBVIEW2_DEFAULT_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

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
        // The window is made here rather than from the config alone so that
        // SOMA_DEBUG_PORT can open WebView2's debugging port: the Windows
        // check (.github/workflows/windows-check.yml) drives the installed
        // app through it. Unset, nothing is opened.
        .setup(|app| {
            let config = app.config().app.windows[0].clone();
            let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?;
            if let Ok(port) = std::env::var("SOMA_DEBUG_PORT") {
                if let Ok(port) = port.parse::<u16>() {
                    builder = builder.additional_browser_args(&format!(
                        "{WEBVIEW2_DEFAULT_ARGS} --remote-debugging-port={port}"
                    ));
                }
            }
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("SOMA failed to start");
}
