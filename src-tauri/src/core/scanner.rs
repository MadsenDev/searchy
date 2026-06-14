use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use jwalk::WalkDir;

use crate::core::{
    db,
    error::AppResult,
    exclusions::ExclusionMatcher,
    state::{ExcludeRule, IndexStatus},
};

pub fn scan_single_root(
    db_path: &Path,
    status: Arc<Mutex<IndexStatus>>,
    root: &str,
) -> AppResult<()> {
    let roots = vec![root.to_string()];
    let rules = db::list_exclude_rules(db_path)?;
    let result = scan_roots(db_path, status, &roots, false, &rules);
    match &result {
        Ok(()) => {
            let _ = db::set_root_scan_success(db_path, root);
        }
        Err(error) => {
            let _ = db::set_root_scan_error(db_path, root, &error.to_string());
        }
    }
    result
}

pub fn rebuild_all_roots(db_path: &Path, status: Arc<Mutex<IndexStatus>>) -> AppResult<()> {
    let roots = db::list_enabled_root_paths(db_path)?;
    let rules = db::list_exclude_rules(db_path)?;
    scan_roots(db_path, status, &roots, true, &rules)
}

fn scan_roots(
    db_path: &Path,
    status: Arc<Mutex<IndexStatus>>,
    roots: &[String],
    clear_existing: bool,
    exclude_rules: &[ExcludeRule],
) -> AppResult<()> {
    let matcher = ExclusionMatcher::new(exclude_rules.to_vec())?;
    update_status(
        &status,
        "scanning",
        format!("Scanning {} root(s)…", roots.len()),
        0,
        roots.len() as i64,
        None,
    );

    let mut connection = db::open(db_path)?;
    let tx = connection.transaction()?;
    let scan_id = db::begin_scan(&tx)?;

    if clear_existing {
        db::clear_entries(&tx)?;
    }

    let mut files_seen = 0_i64;
    let mut dirs_seen = 0_i64;
    let mut errors_count = 0_i64;

    for root in roots {
        let root_path = Path::new(root);
        if !root_path.exists() {
            errors_count += 1;
            let _ = db::set_root_scan_error(db_path, root, "root path is unavailable");
            continue;
        }

        for entry in WalkDir::new(root_path).skip_hidden(false) {
            match entry {
                Ok(entry) => {
                    let path = entry.path();

                    if should_skip(&path) {
                        continue;
                    }

                    if matcher.is_excluded(&path, entry.file_type().is_dir()) {
                        continue;
                    }

                    match entry.metadata() {
                        Ok(metadata) => {
                            if metadata.is_dir() {
                                dirs_seen += 1;
                            } else {
                                files_seen += 1;
                            }
                            db::insert_or_replace_entry(&tx, scan_id, &path, &metadata)?;
                        }
                        Err(_) => {
                            errors_count += 1;
                        }
                    }
                }
                Err(_) => {
                    errors_count += 1;
                }
            }
        }

        let _ = db::set_root_scan_success(db_path, root);
    }

    db::finish_scan(
        &tx,
        scan_id,
        "completed",
        files_seen,
        dirs_seen,
        errors_count,
    )?;
    tx.commit()?;

    let indexed_entries = files_seen + dirs_seen;
    update_status(
        &status,
        "ready",
        format!(
            "Indexed {} items across {} root(s)",
            indexed_entries,
            roots.len()
        ),
        indexed_entries,
        roots.len() as i64,
        Some(db::now_unix()),
    );

    Ok(())
}

pub fn scan_path_recursive(db_path: &Path, path: &Path) -> AppResult<()> {
    let rules = db::list_exclude_rules(db_path)?;
    let matcher = ExclusionMatcher::new(rules)?;
    let connection = db::open(db_path)?;

    if path.is_file() {
        let metadata = path.metadata()?;
        if !matcher.is_excluded(path, metadata.is_dir()) {
            db::upsert_entry(&connection, path, &metadata)?;
        }
        return Ok(());
    }

    for entry in WalkDir::new(path).skip_hidden(false) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let entry_path = entry.path();
        if should_skip(&entry_path) || matcher.is_excluded(&entry_path, entry.file_type().is_dir()) {
            continue;
        }
        if let Ok(metadata) = entry.metadata() {
            db::upsert_entry(&connection, &entry_path, &metadata)?;
        }
    }

    Ok(())
}

fn should_skip(path: &Path) -> bool {
    path.file_name()
        .and_then(|part| part.to_str())
        .map(|name| name == "." || name == "..")
        .unwrap_or(false)
}

fn update_status(
    status: &Arc<Mutex<IndexStatus>>,
    phase: &str,
    message: String,
    indexed_entries: i64,
    indexed_roots: i64,
    last_scan_finished_unix: Option<i64>,
) {
    if let Ok(mut current) = status.lock() {
        let launcher_shortcut_enabled = current.launcher_shortcut_enabled;
        let session_type = current.session_type.clone();
        let desktop = current.desktop.clone();
        current.phase = phase.to_string();
        current.message = message;
        current.indexed_entries = indexed_entries;
        current.indexed_roots = indexed_roots;
        current.last_scan_finished_unix = last_scan_finished_unix;
        current.launcher_shortcut_enabled = launcher_shortcut_enabled;
        current.session_type = session_type;
        current.desktop = desktop;
    }
}
