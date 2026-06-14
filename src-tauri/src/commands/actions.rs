use tauri::{async_runtime::spawn_blocking, State};

use crate::{
    core::state::AppState,
    platform::linux,
    services::{bootstrap, client},
};

#[tauri::command]
pub async fn open_path(path: String, _state: State<'_, AppState>) -> Result<(), String> {
    linux::open_path(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn reveal_path(path: String, _state: State<'_, AppState>) -> Result<(), String> {
    linux::reveal_path(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn record_open(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::record_open(&socket_path, path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}
