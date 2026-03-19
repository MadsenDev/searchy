use tauri::{State, async_runtime::spawn_blocking};

use crate::core::{
    state::{AppSettings, AppState, ExcludeRule},
};
use crate::services::{bootstrap, client};

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::get_settings(&socket_path)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_setting(
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::update_setting(&socket_path, key, value)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_exclude_rules(state: State<'_, AppState>) -> Result<Vec<ExcludeRule>, String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::list_exclude_rules(&socket_path)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn add_exclude_rule(
    pattern: String,
    rule_type: String,
    applies_to: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::add_exclude_rule(&socket_path, pattern, rule_type, applies_to, enabled)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_exclude_rule(
    id: i64,
    pattern: String,
    rule_type: String,
    applies_to: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::update_exclude_rule(&socket_path, id, pattern, rule_type, applies_to, enabled)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn remove_exclude_rule(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::remove_exclude_rule(&socket_path, id)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}
