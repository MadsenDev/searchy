use tauri::{State, async_runtime::spawn_blocking};

use crate::core::{
    state::{AppState, RootRecord},
};
use crate::services::{bootstrap, client};

#[tauri::command]
pub async fn get_roots(state: State<'_, AppState>) -> Result<Vec<RootRecord>, String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::get_roots(&socket_path)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn add_root(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::add_root(&socket_path, path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_root(
    path: String,
    enabled: bool,
    watch_enabled: bool,
    recursive: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::update_root(&socket_path, path, enabled, watch_enabled, recursive)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn rescan_root(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::rescan_root(&socket_path, path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn remove_root(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::remove_root(&socket_path, path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}
