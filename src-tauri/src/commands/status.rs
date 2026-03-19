use tauri::{State, async_runtime::spawn_blocking};

use crate::core::{
    state::{AppState, IndexStatus},
};
use crate::services::{bootstrap, client};

#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> Result<IndexStatus, String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    let launcher_shortcut_enabled = state.launcher_shortcut_enabled;
    let session_type = state.session_type.clone();
    let desktop = state.desktop.clone();

    let mut status = spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::get_status(&socket_path)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;
    status.launcher_shortcut_enabled = launcher_shortcut_enabled;
    status.session_type = session_type;
    status.desktop = desktop;
    Ok(status)
}

#[tauri::command]
pub async fn rebuild_index(state: State<'_, AppState>) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::rebuild_index(&socket_path)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}
