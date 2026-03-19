mod commands;
mod core;
mod platform;
mod services;

use std::{
    env, fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use directories::ProjectDirs;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WindowEvent};

use crate::core::{
    state::{AppState, IndexStatus},
};
use crate::services::{bootstrap, client, daemon};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::ShortcutState;

fn app_db_path() -> PathBuf {
    let dirs = ProjectDirs::from("dev", "Searchy", "Searchy")
        .expect("project directories must be available");
    let data_dir = dirs.data_local_dir();
    fs::create_dir_all(data_dir).expect("failed to create app data directory");
    data_dir.join("searchy.db")
}

fn app_socket_path() -> PathBuf {
    let dirs = ProjectDirs::from("dev", "Searchy", "Searchy")
        .expect("project directories must be available");
    let runtime_dir = dirs.runtime_dir().unwrap_or_else(|| dirs.data_local_dir());
    fs::create_dir_all(runtime_dir).expect("failed to create app runtime directory");
    runtime_dir.join("searchy.sock")
}

fn show_launcher(window: &WebviewWindow) -> tauri::Result<()> {
    window.center()?;
    window.show()?;
    window.set_focus()?;
    window.emit("searchy://launcher-shown", ())?;
    Ok(())
}

fn toggle_launcher(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible()? {
            window.hide()?;
        } else {
            show_launcher(&window)?;
        }
    }

    Ok(())
}

fn session_type() -> String {
    env::var("XDG_SESSION_TYPE").unwrap_or_default()
}

fn current_desktop() -> String {
    env::var("XDG_CURRENT_DESKTOP").unwrap_or_default()
}

fn shortcut_supported_in_session() -> bool {
    session_type() != "wayland"
}

fn daemon_arg_value(args: &[String], key: &str) -> Option<PathBuf> {
    args.windows(2)
        .find(|pair| pair[0] == key)
        .map(|pair| PathBuf::from(&pair[1]))
}

#[cfg(desktop)]
fn register_launcher_shortcut(app: &AppHandle) -> Result<(), String> {
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts(["Ctrl+Space"])
        .map_err(|error| error.to_string())?
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = toggle_launcher(app);
            }
        })
        .build();

    app.plugin(plugin).map_err(|error| error.to_string())
}

fn main() {
    let args = env::args().collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "--daemon") {
        let socket_path = daemon_arg_value(&args, "--socket").unwrap_or_else(app_socket_path);
        let db_path = daemon_arg_value(&args, "--db").unwrap_or_else(app_db_path);
        if let Err(error) = daemon::run(socket_path, db_path) {
            eprintln!("failed to run Searchy daemon: {error}");
            std::process::exit(1);
        }
        return;
    }

    let db_path = app_db_path();
    let socket_path = app_socket_path();
    let session_type = session_type();
    let desktop = current_desktop();
    let launcher_shortcut_enabled = shortcut_supported_in_session();

    let daemon_boot_error = bootstrap::ensure_daemon_running(&socket_path, &db_path).err();

    let state = AppState {
        db_path,
        socket_path,
        status: Arc::new(Mutex::new(IndexStatus {
            phase: if daemon_boot_error.is_some() {
                "error".to_string()
            } else {
                "idle".to_string()
            },
            message: daemon_boot_error
                .clone()
                .unwrap_or_else(|| "Connecting to Searchy daemon…".to_string()),
            daemon_connected: daemon_boot_error.is_none(),
            daemon_state: if daemon_boot_error.is_some() {
                "unavailable".to_string()
            } else {
                "starting".to_string()
            },
            watcher_state: "starting".to_string(),
            launcher_shortcut_enabled,
            session_type: session_type.clone(),
            desktop: desktop.clone(),
            ..IndexStatus::default()
        })),
        launcher_shortcut_enabled,
        session_type,
        desktop,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_launcher(
                &app.get_webview_window("main")
                    .expect("main window should exist for single-instance activation"),
            );
        }))
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::search::search,
            commands::status::get_status,
            commands::roots::get_roots,
            commands::roots::add_root,
            commands::roots::update_root,
            commands::roots::rescan_root,
            commands::roots::remove_root,
            commands::settings::get_settings,
            commands::settings::update_setting,
            commands::settings::get_exclude_rules,
            commands::settings::add_exclude_rule,
            commands::settings::update_exclude_rule,
            commands::settings::remove_exclude_rule,
            commands::actions::open_path,
            commands::actions::reveal_path,
            commands::status::rebuild_index,
        ])
        .on_window_event(|window, event| {
            let state = window.state::<AppState>();
            if state.launcher_shortcut_enabled
                && window.label() == "main"
                && matches!(event, WindowEvent::CloseRequested { .. })
            {
                window.hide().ok();
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            let state = app.state::<AppState>();
            let mut snapshot = client::get_status(&state.socket_path).unwrap_or_else(|_| IndexStatus {
                phase: "error".to_string(),
                message: "Searchy daemon unavailable".to_string(),
                indexed_entries: 0,
                indexed_roots: 0,
                last_scan_finished_unix: None,
                last_reconcile_unix: None,
                daemon_connected: false,
                daemon_state: "unavailable".to_string(),
                watcher_state: "unknown".to_string(),
                watcher_error_count: 0,
                offline_roots: Vec::new(),
                launcher_shortcut_enabled: false,
                session_type: String::new(),
                desktop: String::new(),
            });
            snapshot.launcher_shortcut_enabled = state.launcher_shortcut_enabled;
            snapshot.session_type = state.session_type.clone();
            snapshot.desktop = state.desktop.clone();
            if let Ok(mut status) = state.status.lock() {
                *status = snapshot;
            }

            #[cfg(desktop)]
            if state.launcher_shortcut_enabled {
                if let Err(error) = register_launcher_shortcut(app.handle()) {
                    eprintln!("failed to register Ctrl+Space launcher shortcut: {error}");
                    if let Some(window) = app.get_webview_window("main") {
                        show_launcher(&window)?;
                    }
                }
            } else {
                eprintln!(
                    "global launcher shortcut disabled for session type '{}' on desktop '{}'",
                    state.session_type, state.desktop
                );
                if let Some(window) = app.get_webview_window("main") {
                    show_launcher(&window)?;
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Searchy");
}
