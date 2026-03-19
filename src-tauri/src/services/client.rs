use std::{
    io::{BufRead, BufReader, Write},
    os::unix::net::UnixStream,
    path::Path,
};

use crate::{
    core::{
        error::{AppError, AppResult},
        state::{AppSettings, ExcludeRule, IndexStatus, RootRecord, SearchResult},
    },
    services::rpc::{DaemonRequest, DaemonResponse},
};

fn send_request(socket_path: &Path, request: &DaemonRequest) -> AppResult<DaemonResponse> {
    let mut stream = UnixStream::connect(socket_path)?;
    let payload = serde_json::to_string(request)
        .map_err(|error| AppError::Message(format!("failed to encode daemon request: {error}")))?;
    stream.write_all(payload.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()?;

    let mut response_line = String::new();
    let mut reader = BufReader::new(stream);
    reader.read_line(&mut response_line)?;

    serde_json::from_str::<DaemonResponse>(&response_line)
        .map_err(|error| AppError::Message(format!("failed to decode daemon response: {error}")))
}

pub fn search(socket_path: &Path, query: String, max_results: usize) -> AppResult<Vec<SearchResult>> {
    match send_request(socket_path, &DaemonRequest::Search { query, max_results })? {
        DaemonResponse::SearchResults(results) => Ok(results),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for search".to_string())),
    }
}

pub fn get_status(socket_path: &Path) -> AppResult<IndexStatus> {
    match send_request(socket_path, &DaemonRequest::GetStatus)? {
        DaemonResponse::Status(status) => Ok(status),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for status".to_string())),
    }
}

pub fn get_roots(socket_path: &Path) -> AppResult<Vec<RootRecord>> {
    match send_request(socket_path, &DaemonRequest::GetRoots)? {
        DaemonResponse::Roots(roots) => Ok(roots),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for roots".to_string())),
    }
}

pub fn add_root(socket_path: &Path, path: String) -> AppResult<()> {
    match send_request(socket_path, &DaemonRequest::AddRoot { path })? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for add_root".to_string())),
    }
}

pub fn update_root(
    socket_path: &Path,
    path: String,
    enabled: bool,
    watch_enabled: bool,
    recursive: bool,
) -> AppResult<()> {
    match send_request(
        socket_path,
        &DaemonRequest::UpdateRoot {
            path,
            enabled,
            watch_enabled,
            recursive,
        },
    )? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for update_root".to_string())),
    }
}

pub fn rescan_root(socket_path: &Path, path: String) -> AppResult<()> {
    match send_request(socket_path, &DaemonRequest::RescanRoot { path })? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for rescan_root".to_string())),
    }
}

pub fn remove_root(socket_path: &Path, path: String) -> AppResult<()> {
    match send_request(socket_path, &DaemonRequest::RemoveRoot { path })? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for remove_root".to_string())),
    }
}

pub fn get_settings(socket_path: &Path) -> AppResult<AppSettings> {
    match send_request(socket_path, &DaemonRequest::GetSettings)? {
        DaemonResponse::Settings(settings) => Ok(settings),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for settings".to_string())),
    }
}

pub fn update_setting(socket_path: &Path, key: String, value: String) -> AppResult<()> {
    match send_request(socket_path, &DaemonRequest::UpdateSetting { key, value })? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for update_setting".to_string())),
    }
}

pub fn rebuild_index(socket_path: &Path) -> AppResult<()> {
    match send_request(socket_path, &DaemonRequest::RebuildIndex)? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for rebuild".to_string())),
    }
}

pub fn list_exclude_rules(socket_path: &Path) -> AppResult<Vec<ExcludeRule>> {
    match send_request(socket_path, &DaemonRequest::ListExcludeRules)? {
        DaemonResponse::ExcludeRules(rules) => Ok(rules),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for exclude rules".to_string())),
    }
}

pub fn add_exclude_rule(
    socket_path: &Path,
    pattern: String,
    rule_type: String,
    applies_to: String,
    enabled: bool,
) -> AppResult<()> {
    match send_request(
        socket_path,
        &DaemonRequest::AddExcludeRule {
            pattern,
            rule_type,
            applies_to,
            enabled,
        },
    )? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for add_exclude_rule".to_string())),
    }
}

pub fn update_exclude_rule(
    socket_path: &Path,
    id: i64,
    pattern: String,
    rule_type: String,
    applies_to: String,
    enabled: bool,
) -> AppResult<()> {
    match send_request(
        socket_path,
        &DaemonRequest::UpdateExcludeRule {
            id,
            pattern,
            rule_type,
            applies_to,
            enabled,
        },
    )? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for update_exclude_rule".to_string())),
    }
}

pub fn remove_exclude_rule(socket_path: &Path, id: i64) -> AppResult<()> {
    match send_request(socket_path, &DaemonRequest::RemoveExcludeRule { id })? {
        DaemonResponse::Ack => Ok(()),
        DaemonResponse::Error(error) => Err(AppError::Message(error)),
        _ => Err(AppError::Message("unexpected daemon response for remove_exclude_rule".to_string())),
    }
}
