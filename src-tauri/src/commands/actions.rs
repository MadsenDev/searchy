use tauri::State;

use crate::{core::state::AppState, platform::linux};

#[tauri::command]
pub async fn open_path(path: String, _state: State<'_, AppState>) -> Result<(), String> {
    linux::open_path(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn reveal_path(path: String, _state: State<'_, AppState>) -> Result<(), String> {
    linux::reveal_path(&path).map_err(|error| error.to_string())
}
