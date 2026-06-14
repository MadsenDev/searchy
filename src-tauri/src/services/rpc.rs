use serde::{Deserialize, Serialize};

use crate::core::state::{AppSettings, ExcludeRule, IndexStatus, RootRecord, SearchResult};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "method", content = "params", rename_all = "snake_case")]
pub enum DaemonRequest {
    Search { query: String, max_results: usize, root: Option<String> },
    GetStatus,
    GetRoots,
    AddRoot { path: String },
    UpdateRoot {
        path: String,
        enabled: bool,
        watch_enabled: bool,
        recursive: bool,
    },
    RescanRoot { path: String },
    RemoveRoot { path: String },
    GetSettings,
    UpdateSetting { key: String, value: String },
    RebuildIndex,
    ListExcludeRules,
    AddExcludeRule {
        pattern: String,
        rule_type: String,
        applies_to: String,
        enabled: bool,
    },
    UpdateExcludeRule {
        id: i64,
        pattern: String,
        rule_type: String,
        applies_to: String,
        enabled: bool,
    },
    RemoveExcludeRule { id: i64 },
    RecordOpen { path: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum DaemonResponse {
    SearchResults(Vec<SearchResult>),
    Status(IndexStatus),
    Roots(Vec<RootRecord>),
    Settings(AppSettings),
    ExcludeRules(Vec<ExcludeRule>),
    Ack,
    Error(String),
}
