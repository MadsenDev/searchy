use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct AppState {
    pub db_path: std::path::PathBuf,
    pub socket_path: std::path::PathBuf,
    pub status: Arc<Mutex<IndexStatus>>,
    pub launcher_shortcut_enabled: bool,
    pub session_type: String,
    pub desktop: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub parent_path: String,
    pub name: String,
    pub extension: Option<String>,
    pub is_dir: bool,
    pub modified_unix: Option<i64>,
    pub score: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootRecord {
    pub id: i64,
    pub path: String,
    pub enabled: bool,
    pub watch_enabled: bool,
    pub recursive: bool,
    pub is_offline: bool,
    pub health: String,
    pub last_scan_unix: Option<i64>,
    pub last_error: Option<String>,
    pub watcher_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub show_hidden_files: bool,
    pub max_results: usize,
    pub prefer_exact_prefix_matches: bool,
    pub follow_symlinks: bool,
    pub directories_first: bool,
    pub theme: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub phase: String,
    pub message: String,
    pub indexed_entries: i64,
    pub indexed_roots: i64,
    pub last_scan_finished_unix: Option<i64>,
    pub last_reconcile_unix: Option<i64>,
    pub daemon_connected: bool,
    pub daemon_state: String,
    pub watcher_state: String,
    pub watcher_error_count: i64,
    pub offline_roots: Vec<String>,
    pub launcher_shortcut_enabled: bool,
    pub session_type: String,
    pub desktop: String,
    pub inotify_limit_warning: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcludeRule {
    pub id: i64,
    pub pattern: String,
    pub rule_type: String,
    pub applies_to: String,
    pub enabled: bool,
}
