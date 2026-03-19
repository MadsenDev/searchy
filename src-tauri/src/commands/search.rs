use tauri::{State, async_runtime::spawn_blocking};

use crate::core::{
    state::{AppState, SearchResult},
};
use crate::services::{bootstrap, client};

#[tauri::command]
pub async fn search(
    query: String,
    max_results: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let db_path = state.db_path.clone();
    let socket_path = state.socket_path.clone();
    let limit = max_results.unwrap_or(50);

    spawn_blocking(move || {
        bootstrap::ensure_daemon_running_app(&socket_path, &db_path)?;
        client::search(&socket_path, query, limit)
    })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}
