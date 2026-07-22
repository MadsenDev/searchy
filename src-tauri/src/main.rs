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
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent,
};

use crate::core::state::{AppState, IndexStatus};
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

/// Registers the global launcher shortcut via the XDG Desktop Portal on Wayland.
/// Shows a compositor-native permission dialog on first use. Supported by
/// KDE Plasma 5.27+, GNOME 48+, and Hyprland; degrades silently on Sway/wlroots.
#[cfg(target_os = "linux")]
async fn setup_wayland_shortcut(app: AppHandle) -> Result<(), ashpd::Error> {
    use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut};
    use futures_util::StreamExt;

    let proxy = GlobalShortcuts::new().await?;
    let session = proxy.create_session(Default::default()).await?;

    proxy
        .bind_shortcuts(
            &session,
            &[NewShortcut::new("toggle-launcher", "Toggle Searchy launcher")
                .preferred_trigger(Some("ctrl+space"))],
            None,
            Default::default(),
        )
        .await?;

    let mut stream = proxy.receive_activated().await?;
    while let Some(_activation) = stream.next().await {
        let _ = toggle_launcher(&app);
    }

    Ok(())
}

fn main() {
    // Work around a WebKitGTK DMABUF/GBM renderer bug that fails on some Linux
    // GPU drivers ("Failed to create GBM buffer of size WxH: Invalid argument"),
    // leaving the launcher window blank or unshowable. Disabling the DMABUF
    // renderer forces a software-composited path that allocates reliably.
    // Respect an explicit value if the user already set one.
    #[cfg(target_os = "linux")]
    if env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: set at the very start of main(), before any WebKitGTK or
        // thread initialization, so no other thread can be reading the env.
        unsafe {
            env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

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
            launcher_shortcut_enabled: true,
            session_type: session_type.clone(),
            desktop: desktop.clone(),
            ..IndexStatus::default()
        })),
        launcher_shortcut_enabled: true,
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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
            commands::actions::record_open,
            commands::status::rebuild_index,
            commands::system::get_autostart_enabled,
            commands::system::set_autostart_enabled,
        ])
        .on_window_event(|window, event| {
            // Always hide to tray instead of closing — quit via the tray menu.
            if window.label() == "main"
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
                launcher_shortcut_enabled: true,
                session_type: String::new(),
                desktop: String::new(),
                inotify_limit_warning: false,
            });
            snapshot.launcher_shortcut_enabled = true;
            snapshot.session_type = state.session_type.clone();
            snapshot.desktop = state.desktop.clone();
            if let Ok(mut status) = state.status.lock() {
                *status = snapshot;
            }

            // System tray
            let show_i = MenuItem::with_id(app, "show", "Show Searchy", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Searchy", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &sep, &quit_i])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app icon should be bundled").clone())
                .tooltip("Searchy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = show_launcher(&w);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = toggle_launcher(tray.app_handle());
                    }
                })
                .build(app)?;

            let is_wayland = state.session_type == "wayland";

            // X11 / non-Wayland: register Ctrl+Space via global-shortcut plugin
            #[cfg(desktop)]
            if !is_wayland {
                if let Err(error) = register_launcher_shortcut(app.handle()) {
                    eprintln!("failed to register Ctrl+Space launcher shortcut: {error}");
                }
            }

            // Wayland: register via XDG GlobalShortcuts portal (async, compositor dialog)
            #[cfg(target_os = "linux")]
            if is_wayland {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = setup_wayland_shortcut(app_handle).await {
                        eprintln!("Wayland global shortcut portal failed: {e}");
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Searchy");
}
