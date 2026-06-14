use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    os::unix::net::{UnixListener, UnixStream},
    path::{Path, PathBuf},
    sync::{
        mpsc::{self, Receiver, RecvTimeoutError, Sender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use notify::{
    event::{CreateKind, ModifyKind, RemoveKind, RenameMode},
    Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};

use crate::{
    core::{
        db,
        error::{AppError, AppResult},
        exclusions::ExclusionMatcher,
        query,
        scanner,
        state::{ExcludeRule, IndexStatus, RootRecord},
    },
    services::rpc::{DaemonRequest, DaemonResponse},
};

pub fn run(socket_path: PathBuf, db_path: PathBuf) -> AppResult<()> {
    if let Some(parent) = socket_path.parent() {
        fs::create_dir_all(parent)?;
    }
    if socket_path.exists() {
        match UnixStream::connect(&socket_path) {
            Ok(_) => {
                return Ok(());
            }
            Err(_) => {
                let _ = fs::remove_file(&socket_path);
            }
        }
    }

    db::initialize(&db_path)?;
    db::ensure_fts_ready(&db_path)?;

    let service = Arc::new(DaemonService::new(db_path)?);
    service.refresh_watchers();
    service.spawn_background_threads();

    let listener = UnixListener::bind(&socket_path)?;
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let service = service.clone();
                thread::spawn(move || {
                    let _ = handle_connection(stream, service);
                });
            }
            Err(error) => {
                eprintln!("daemon socket accept failed: {error}");
            }
        }
    }

    Ok(())
}

struct DaemonService {
    db_path: PathBuf,
    status: Arc<Mutex<IndexStatus>>,
    watchers: Mutex<Vec<RecommendedWatcher>>,
    watch_tx: Sender<WatchChange>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WatchOp {
    Upsert,
    RescanDir,
    Remove,
}

#[derive(Clone, Debug)]
struct WatchChange {
    path: PathBuf,
    op: WatchOp,
}

impl DaemonService {
    fn new(db_path: PathBuf) -> AppResult<Self> {
        let mut status = db::status_snapshot(&db_path)?;
        status.daemon_connected = true;
        status.daemon_state = "ready".to_string();
        status.watcher_state = "starting".to_string();

        let (watch_tx, watch_rx) = mpsc::channel();
        let service = Self {
            db_path,
            status: Arc::new(Mutex::new(status)),
            watchers: Mutex::new(Vec::new()),
            watch_tx,
        };
        service.start_watch_processor(watch_rx);
        Ok(service)
    }

    fn spawn_background_threads(self: &Arc<Self>) {
        let service = self.clone();
        thread::spawn(move || {
            let _ = service.rebuild_all();
        });

        let service = self.clone();
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(600));
            let _ = service.rebuild_all();
        });
    }

    fn start_watch_processor(&self, receiver: Receiver<WatchChange>) {
        let db_path = self.db_path.clone();
        let status = self.status.clone();
        thread::spawn(move || loop {
            let first = match receiver.recv() {
                Ok(change) => change,
                Err(_) => break,
            };

            let mut pending = HashMap::from([(first.path, first.op)]);
            loop {
                match receiver.recv_timeout(Duration::from_millis(350)) {
                    Ok(change) => {
                        pending
                            .entry(change.path)
                            .and_modify(|current| *current = merge_watch_ops(*current, change.op))
                            .or_insert(change.op);
                    }
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }

            let rules = db::list_exclude_rules(&db_path).unwrap_or_default();
            let matcher = match ExclusionMatcher::new(rules) {
                Ok(matcher) => matcher,
                Err(error) => {
                    update_runtime_status(&status, "error", &format!("Exclude rule error: {error}"));
                    continue;
                }
            };

            if let Ok(mut current) = status.lock() {
                current.phase = "scanning".to_string();
                current.message = format!("Applying {} live filesystem update(s)…", pending.len());
                current.daemon_connected = true;
                current.daemon_state = "ready".to_string();
                if current.watcher_state == "healthy" {
                    current.watcher_state = "updating".to_string();
                }
            }

            for (path, op) in pending {
                let _ = reconcile_change(&db_path, &matcher, &path, op);
            }

            if let Ok(mut current) = status.lock() {
                current.phase = "ready".to_string();
                current.watcher_state = if current.watcher_error_count > 0 {
                    "degraded".to_string()
                } else {
                    "healthy".to_string()
                };
                current.message = "Index updated from live filesystem events".to_string();
            }

            let snapshot = status_snapshot_for_daemon(&db_path, &status);
            if let Ok(mut current) = status.lock() {
                *current = snapshot;
            }
        });
    }

    fn refresh_watchers(&self) {
        let roots = match db::list_roots(&self.db_path) {
            Ok(roots) => roots,
            Err(error) => {
                update_runtime_status(&self.status, "error", &format!("Failed to load roots: {error}"));
                return;
            }
        };
        let mut watchers = Vec::new();
        let mut watcher_errors = Vec::new();

        for root in roots
            .into_iter()
            .filter(|root| root.enabled && root.watch_enabled && Path::new(&root.path).exists())
        {
            let tx = self.watch_tx.clone();
            let watcher = notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
                if let Ok(event) = result {
                    for change in classify_event(event) {
                        let _ = tx.send(change);
                    }
                }
            });

            let mut watcher = match watcher {
                Ok(watcher) => watcher,
                Err(error) => {
                    let _ = db::set_root_watcher_error(&self.db_path, &root.path, Some(&error.to_string()));
                    watcher_errors.push(format!("{} ({error})", root.path));
                    continue;
                }
            };

            if let Err(error) = watcher.watch(Path::new(&root.path), RecursiveMode::Recursive) {
                let _ = db::set_root_watcher_error(&self.db_path, &root.path, Some(&error.to_string()));
                watcher_errors.push(format!("{} ({error})", root.path));
                continue;
            }

            let _ = db::set_root_watcher_error(&self.db_path, &root.path, None);
            watchers.push(watcher);
        }

        if let Ok(mut current_watchers) = self.watchers.lock() {
            *current_watchers = watchers;
        }
        if let Ok(mut status) = self.status.lock() {
            if watcher_errors.is_empty() {
                status.watcher_state = "healthy".to_string();
                status.watcher_error_count = 0;
            } else {
                status.watcher_state = "degraded".to_string();
                status.watcher_error_count = watcher_errors.len() as i64;
                status.message = format!(
                    "Live watchers degraded on {} root(s); indexing still works",
                    watcher_errors.len()
                );
            }
        }
    }

    fn rebuild_all(&self) -> AppResult<()> {
        if let Ok(mut status) = self.status.lock() {
            status.phase = "scanning".to_string();
            status.message = "Reconciling indexed roots…".to_string();
            status.daemon_state = "ready".to_string();
            status.watcher_state = "rebuilding".to_string();
        }

        scanner::rebuild_all_roots(&self.db_path, self.status.clone())?;
        self.refresh_watchers();

        let snapshot = status_snapshot_for_daemon(&self.db_path, &self.status);
        if let Ok(mut status) = self.status.lock() {
            *status = snapshot;
        }

        Ok(())
    }

    fn handle_request(&self, request: DaemonRequest) -> DaemonResponse {
        match request {
            DaemonRequest::Search { query: raw_query, max_results } => {
                let rules = match db::list_exclude_rules(&self.db_path)
                    .and_then(ExclusionMatcher::new)
                {
                    Ok(matcher) => matcher,
                    Err(error) => return DaemonResponse::Error(error.to_string()),
                };
                match query::search(&self.db_path, &raw_query, max_results) {
                    Ok(results) => {
                        let filtered = results
                            .into_iter()
                            .filter(|result| !rules.is_excluded(Path::new(&result.path), result.is_dir))
                            .take(max_results)
                            .collect();
                        DaemonResponse::SearchResults(filtered)
                    }
                    Err(error) => DaemonResponse::Error(error.to_string()),
                }
            }
            DaemonRequest::GetStatus => {
                if let Ok(status) = self.status.lock() {
                    DaemonResponse::Status(status.clone())
                } else {
                    DaemonResponse::Error("failed to read daemon status".to_string())
                }
            }
            DaemonRequest::GetRoots => match db::list_roots(&self.db_path) {
                Ok(roots) => DaemonResponse::Roots(roots),
                Err(error) => DaemonResponse::Error(error.to_string()),
            },
            DaemonRequest::AddRoot { path } => {
                let root_path = Path::new(&path);
                if !root_path.exists() || !root_path.is_dir() {
                    return DaemonResponse::Error(format!("'{}' is not an existing directory", path));
                }

                match db::insert_root(&self.db_path, &path) {
                    Ok(()) => {
                        self.refresh_watchers();
                        if let Ok(mut status) = self.status.lock() {
                            status.phase = "scanning".to_string();
                            status.message = format!("Scanning {}…", path);
                            status.daemon_connected = true;
                            status.daemon_state = "ready".to_string();
                        }

                        let db_path = self.db_path.clone();
                        let status = self.status.clone();
                        let path_for_scan = path.clone();
                        thread::spawn(move || {
                            if let Err(error) = scanner::scan_single_root(&db_path, status.clone(), &path_for_scan) {
                                update_runtime_status(&status, "error", &format!("Failed to scan '{}': {error}", path_for_scan));
                                return;
                            }

                            let snapshot = status_snapshot_for_daemon(&db_path, &status);
                            if let Ok(mut current) = status.lock() {
                                *current = snapshot;
                            }
                        });

                        DaemonResponse::Ack
                    }
                    Err(error) => DaemonResponse::Error(error.to_string()),
                }
            }
            DaemonRequest::UpdateRoot {
                path,
                enabled,
                watch_enabled,
                recursive,
            } => match db::update_root(&self.db_path, &path, enabled, watch_enabled, recursive) {
                Ok(()) => {
                    self.refresh_watchers();
                    if !enabled {
                        let _ = db::remove_entries_for_prefix(&self.db_path, &path);
                    }
                    let snapshot = status_snapshot_for_daemon(&self.db_path, &self.status);
                    if let Ok(mut status) = self.status.lock() {
                        *status = snapshot;
                    }
                    DaemonResponse::Ack
                }
                Err(error) => DaemonResponse::Error(error.to_string()),
            },
            DaemonRequest::RescanRoot { path } => {
                let root_path = Path::new(&path);
                if !root_path.exists() || !root_path.is_dir() {
                    return DaemonResponse::Error(format!("'{}' is not an existing directory", path));
                }

                if let Ok(mut status) = self.status.lock() {
                    status.phase = "scanning".to_string();
                    status.message = format!("Rescanning {}…", path);
                    status.daemon_connected = true;
                    status.daemon_state = "ready".to_string();
                }

                let db_path = self.db_path.clone();
                let status = self.status.clone();
                thread::spawn(move || {
                    let _ = db::remove_entries_for_prefix(&db_path, &path);
                    if let Err(error) = scanner::scan_single_root(&db_path, status.clone(), &path) {
                        update_runtime_status(&status, "error", &format!("Failed to rescan '{}': {error}", path));
                        return;
                    }
                    let snapshot = status_snapshot_for_daemon(&db_path, &status);
                    if let Ok(mut current) = status.lock() {
                        *current = snapshot;
                    }
                });

                DaemonResponse::Ack
            }
            DaemonRequest::RemoveRoot { path } => match db::remove_root(&self.db_path, &path)
                .and_then(|_| db::remove_entries_for_prefix(&self.db_path, &path))
            {
                Ok(()) => {
                    self.refresh_watchers();
                    let snapshot = status_snapshot_for_daemon(&self.db_path, &self.status);
                    if let Ok(mut status) = self.status.lock() {
                        *status = snapshot;
                    }
                    DaemonResponse::Ack
                }
                Err(error) => DaemonResponse::Error(error.to_string()),
            },
            DaemonRequest::GetSettings => match db::get_settings(&self.db_path) {
                Ok(settings) => DaemonResponse::Settings(settings),
                Err(error) => DaemonResponse::Error(error.to_string()),
            },
            DaemonRequest::UpdateSetting { key, value } => {
                match db::update_setting(&self.db_path, &key, &value) {
                    Ok(()) => {
                        self.refresh_watchers();
                        DaemonResponse::Ack
                    }
                    Err(error) => DaemonResponse::Error(error.to_string()),
                }
            }
            DaemonRequest::RebuildIndex => match self.rebuild_all() {
                Ok(()) => DaemonResponse::Ack,
                Err(error) => DaemonResponse::Error(error.to_string()),
            },
            DaemonRequest::ListExcludeRules => match db::list_exclude_rules(&self.db_path) {
                Ok(rules) => DaemonResponse::ExcludeRules(rules),
                Err(error) => DaemonResponse::Error(error.to_string()),
            },
            DaemonRequest::AddExcludeRule { pattern, rule_type, applies_to, enabled } => {
                if let Err(error) = validate_exclude_rule(&pattern, &rule_type, &applies_to, enabled) {
                    return DaemonResponse::Error(error.to_string());
                }
                let result = db::insert_exclude_rule(&self.db_path, &pattern, &rule_type, &applies_to, enabled)
                    .and_then(|_| self.rebuild_all());
                match result {
                    Ok(()) => DaemonResponse::Ack,
                    Err(error) => DaemonResponse::Error(error.to_string()),
                }
            }
            DaemonRequest::UpdateExcludeRule { id, pattern, rule_type, applies_to, enabled } => {
                if let Err(error) = validate_exclude_rule(&pattern, &rule_type, &applies_to, enabled) {
                    return DaemonResponse::Error(error.to_string());
                }
                let result = db::update_exclude_rule(
                    &self.db_path,
                    id,
                    &pattern,
                    &rule_type,
                    &applies_to,
                    enabled,
                )
                .and_then(|_| self.rebuild_all());
                match result {
                    Ok(()) => DaemonResponse::Ack,
                    Err(error) => DaemonResponse::Error(error.to_string()),
                }
            }
            DaemonRequest::RemoveExcludeRule { id } => match db::remove_exclude_rule(&self.db_path, id)
                .and_then(|_| self.rebuild_all())
            {
                Ok(()) => DaemonResponse::Ack,
                Err(error) => DaemonResponse::Error(error.to_string()),
            },
        }
    }
}

fn handle_connection(stream: UnixStream, service: Arc<DaemonService>) -> AppResult<()> {
    let mut line = String::new();
    let mut reader = BufReader::new(stream.try_clone()?);
    reader.read_line(&mut line)?;
    if line.trim().is_empty() {
        return Ok(());
    }

    let request = serde_json::from_str::<DaemonRequest>(&line)
        .map_err(|error| AppError::Message(format!("invalid daemon request: {error}")))?;
    let response = service.handle_request(request);

    let mut stream = stream;
    let payload = serde_json::to_string(&response)
        .map_err(|error| AppError::Message(format!("failed to encode daemon response: {error}")))?;
    stream.write_all(payload.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()?;
    Ok(())
}

fn merge_watch_ops(current: WatchOp, incoming: WatchOp) -> WatchOp {
    match (current, incoming) {
        (WatchOp::Remove, _) | (_, WatchOp::Remove) => WatchOp::Remove,
        (WatchOp::RescanDir, _) | (_, WatchOp::RescanDir) => WatchOp::RescanDir,
        _ => WatchOp::Upsert,
    }
}

fn classify_event(event: Event) -> Vec<WatchChange> {
    match event.kind {
        EventKind::Access(_) => Vec::new(),
        EventKind::Create(CreateKind::Folder) => event
            .paths
            .into_iter()
            .map(|path| WatchChange {
                path,
                op: WatchOp::RescanDir,
            })
            .collect(),
        EventKind::Create(_) => event
            .paths
            .into_iter()
            .map(|path| WatchChange {
                path,
                op: WatchOp::Upsert,
            })
            .collect(),
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
            if event.paths.len() >= 2 {
                vec![
                    WatchChange {
                        path: event.paths[0].clone(),
                        op: WatchOp::Remove,
                    },
                    WatchChange {
                        path: event.paths[1].clone(),
                        op: WatchOp::Upsert,
                    },
                ]
            } else {
                event
                    .paths
                    .into_iter()
                    .map(|path| WatchChange {
                        path,
                        op: WatchOp::Upsert,
                    })
                    .collect()
            }
        }
        EventKind::Modify(ModifyKind::Name(RenameMode::From)) => event
            .paths
            .into_iter()
            .map(|path| WatchChange {
                path,
                op: WatchOp::Remove,
            })
            .collect(),
        EventKind::Modify(ModifyKind::Name(RenameMode::To)) => event
            .paths
            .into_iter()
            .map(|path| WatchChange {
                path,
                op: WatchOp::Upsert,
            })
            .collect(),
        EventKind::Modify(ModifyKind::Name(_)) => event
            .paths
            .into_iter()
            .map(|path| WatchChange {
                path,
                op: WatchOp::Upsert,
            })
            .collect(),
        EventKind::Modify(_) => event
            .paths
            .into_iter()
            .map(|path| {
                let op = if path.is_dir() {
                    WatchOp::RescanDir
                } else {
                    WatchOp::Upsert
                };
                WatchChange { path, op }
            })
            .collect(),
        EventKind::Remove(RemoveKind::File)
        | EventKind::Remove(RemoveKind::Folder)
        | EventKind::Remove(_) => event
            .paths
            .into_iter()
            .map(|path| WatchChange {
                path,
                op: WatchOp::Remove,
            })
            .collect(),
        EventKind::Other | EventKind::Any => event
            .paths
            .into_iter()
            .map(|path| WatchChange {
                path,
                op: WatchOp::RescanDir,
            })
            .collect(),
    }
}

fn reconcile_change(
    db_path: &Path,
    matcher: &ExclusionMatcher,
    path: &Path,
    op: WatchOp,
) -> AppResult<()> {
    match op {
        WatchOp::Remove => {
            db::remove_entries_for_prefix(db_path, &path.to_string_lossy())?;
            Ok(())
        }
        WatchOp::RescanDir => {
            if !path.exists() {
                db::remove_entries_for_prefix(db_path, &path.to_string_lossy())?;
                return Ok(());
            }
            if let Ok(metadata) = fs::metadata(path) {
                if matcher.is_excluded(path, metadata.is_dir()) {
                    db::remove_entries_for_prefix(db_path, &path.to_string_lossy())?;
                    return Ok(());
                }
            }
            scanner::scan_path_recursive(db_path, path)
        }
        WatchOp::Upsert => {
            if !path.exists() {
                db::remove_entries_for_prefix(db_path, &path.to_string_lossy())?;
                return Ok(());
            }

            let metadata = fs::metadata(path)?;
            if matcher.is_excluded(path, metadata.is_dir()) {
                db::remove_entries_for_prefix(db_path, &path.to_string_lossy())?;
                return Ok(());
            }
            if metadata.is_dir() {
                scanner::scan_path_recursive(db_path, path)?;
            } else {
                let connection = db::open(db_path)?;
                db::upsert_entry(&connection, path, &metadata)?;
            }
            Ok(())
        }
    }
}

fn status_snapshot_for_daemon(db_path: &Path, status: &Arc<Mutex<IndexStatus>>) -> IndexStatus {
    let mut snapshot = db::status_snapshot(db_path).unwrap_or_default();
    snapshot.daemon_connected = true;
    snapshot.daemon_state = "ready".to_string();
    snapshot.offline_roots = list_offline_roots(db_path).unwrap_or_default();
    snapshot.last_reconcile_unix = Some(db::now_unix());

    if let Ok(current) = status.lock() {
        snapshot.watcher_state = if current.watcher_state.is_empty() {
            "healthy".to_string()
        } else {
            current.watcher_state.clone()
        };
        snapshot.watcher_error_count = current.watcher_error_count;
        snapshot.phase = if current.phase == "scanning" || current.phase == "error" {
            current.phase.clone()
        } else {
            "ready".to_string()
        };
        if !current.message.is_empty() {
            snapshot.message = current.message.clone();
        }
        if current.phase == "error" {
            snapshot.phase = current.phase.clone();
            snapshot.message = current.message.clone();
        }
    }

    if snapshot.watcher_state == "updating" || snapshot.watcher_state == "rebuilding" {
        return snapshot;
    }

    if snapshot.watcher_error_count == 0 && snapshot.watcher_state.is_empty() {
        snapshot.watcher_state = "healthy".to_string();
    }

    snapshot
}

fn list_offline_roots(db_path: &Path) -> AppResult<Vec<String>> {
    Ok(db::list_roots(db_path)?
        .into_iter()
        .filter(|root: &RootRecord| root.enabled && !Path::new(&root.path).exists())
        .map(|root| root.path)
        .collect())
}

fn update_runtime_status(status: &Arc<Mutex<IndexStatus>>, phase: &str, message: &str) {
    if let Ok(mut current) = status.lock() {
        current.phase = phase.to_string();
        current.message = message.to_string();
        current.daemon_connected = true;
        current.daemon_state = "ready".to_string();
    }
}

fn validate_exclude_rule(pattern: &str, rule_type: &str, applies_to: &str, enabled: bool) -> AppResult<()> {
    ExclusionMatcher::new(vec![ExcludeRule {
        id: 0,
        pattern: pattern.to_string(),
        rule_type: rule_type.to_string(),
        applies_to: applies_to.to_string(),
        enabled,
    }])?;
    Ok(())
}
