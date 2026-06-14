use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};

use crate::core::{
    error::{AppError, AppResult},
    query_syntax::{parse_query, EntryTypeFilter, ParsedQuery, QueryFilter},
    state::{AppSettings, ExcludeRule, IndexStatus, RootRecord, SearchResult},
};

const FTS_TABLE: &str = "indexed_entries_fts";
const FTS_SCHEMA_VERSION: &str = "1";

pub fn initialize(db_path: &Path) -> AppResult<()> {
    let connection = Connection::open(db_path)?;
    connection.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS indexed_entries (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            parent_path TEXT NOT NULL,
            name TEXT NOT NULL,
            name_lower TEXT NOT NULL,
            extension TEXT,
            is_dir INTEGER NOT NULL,
            size_bytes INTEGER,
            modified_unix INTEGER,
            created_unix INTEGER,
            inode INTEGER,
            dev INTEGER,
            last_seen_scan_id INTEGER,
            status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE INDEX IF NOT EXISTS idx_indexed_entries_name_lower ON indexed_entries(name_lower);
        CREATE INDEX IF NOT EXISTS idx_indexed_entries_parent_path ON indexed_entries(parent_path);
        CREATE INDEX IF NOT EXISTS idx_indexed_entries_extension ON indexed_entries(extension);
        CREATE INDEX IF NOT EXISTS idx_indexed_entries_name_dir ON indexed_entries(name_lower, is_dir);

        CREATE VIRTUAL TABLE IF NOT EXISTS indexed_entries_fts USING fts5(
            path,
            name,
            parent_path,
            content='indexed_entries',
            content_rowid='id',
            tokenize='trigram'
        );

        CREATE TRIGGER IF NOT EXISTS indexed_entries_ai AFTER INSERT ON indexed_entries BEGIN
            INSERT INTO indexed_entries_fts(rowid, path, name, parent_path)
            VALUES (new.id, new.path, new.name_lower, new.parent_path);
        END;

        CREATE TRIGGER IF NOT EXISTS indexed_entries_ad AFTER DELETE ON indexed_entries BEGIN
            INSERT INTO indexed_entries_fts(indexed_entries_fts, rowid, path, name, parent_path)
            VALUES ('delete', old.id, old.path, old.name_lower, old.parent_path);
        END;

        CREATE TRIGGER IF NOT EXISTS indexed_entries_au AFTER UPDATE ON indexed_entries BEGIN
            INSERT INTO indexed_entries_fts(indexed_entries_fts, rowid, path, name, parent_path)
            VALUES ('delete', old.id, old.path, old.name_lower, old.parent_path);
            INSERT INTO indexed_entries_fts(rowid, path, name, parent_path)
            VALUES (new.id, new.path, new.name_lower, new.parent_path);
        END;

        CREATE TABLE IF NOT EXISTS roots (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            watch_enabled INTEGER NOT NULL DEFAULT 1,
            recursive INTEGER NOT NULL DEFAULT 1,
            last_scan_unix INTEGER,
            last_error TEXT,
            watcher_error TEXT,
            created_unix INTEGER NOT NULL,
            updated_unix INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exclude_rules (
            id INTEGER PRIMARY KEY,
            pattern TEXT NOT NULL,
            type TEXT NOT NULL,
            applies_to TEXT NOT NULL DEFAULT 'both',
            enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS scan_runs (
            id INTEGER PRIMARY KEY,
            started_unix INTEGER NOT NULL,
            finished_unix INTEGER,
            status TEXT NOT NULL,
            files_seen INTEGER NOT NULL DEFAULT 0,
            dirs_seen INTEGER NOT NULL DEFAULT 0,
            errors_count INTEGER NOT NULL DEFAULT 0
        );
        ",
    )?;
    connection.execute(
        "ALTER TABLE roots ADD COLUMN last_scan_unix INTEGER",
        [],
    ).ok();
    connection.execute("ALTER TABLE roots ADD COLUMN last_error TEXT", []).ok();
    connection.execute("ALTER TABLE roots ADD COLUMN watcher_error TEXT", []).ok();

    connection.execute("ALTER TABLE indexed_entries ADD COLUMN name_initials TEXT", []).ok();
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_indexed_entries_name_initials ON indexed_entries(name_initials)",
        [],
    ).ok();
    connection.execute(
        "ALTER TABLE indexed_entries ADD COLUMN open_count INTEGER NOT NULL DEFAULT 0",
        [],
    ).ok();

    seed_default_settings(&connection)?;
    Ok(())
}

pub fn open(db_path: &Path) -> AppResult<Connection> {
    Ok(Connection::open(db_path)?)
}

fn compute_initials(name: &str) -> String {
    use std::path::Path as StdPath;
    let stem = StdPath::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);

    let mut result = String::new();
    let mut at_word_start = true;
    let mut prev_lower = false;

    for ch in stem.chars() {
        if ch == '_' || ch == '-' || ch == '.' || ch == ' ' {
            at_word_start = true;
            prev_lower = false;
            continue;
        }
        if ch.is_ascii_alphabetic() {
            let is_upper = ch.is_ascii_uppercase();
            let camel_boundary = is_upper && prev_lower;
            if at_word_start || camel_boundary {
                result.push(ch.to_ascii_lowercase());
                at_word_start = false;
            }
            prev_lower = !is_upper;
        } else {
            at_word_start = false;
            prev_lower = false;
        }
    }

    result
}

pub fn record_open(db_path: &Path, path: &str) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "UPDATE indexed_entries SET open_count = open_count + 1 WHERE path = ?1",
        params![path],
    )?;
    Ok(())
}

pub fn list_roots(db_path: &Path) -> AppResult<Vec<RootRecord>> {
    let connection = open(db_path)?;
    let mut statement = connection.prepare(
        "SELECT id, path, enabled, watch_enabled, recursive, last_scan_unix, last_error, watcher_error FROM roots ORDER BY path ASC",
    )?;

    let rows = statement.query_map([], |row| {
        let path = row.get::<_, String>(1)?;
        let enabled = row.get::<_, i64>(2)? != 0;
        let watch_enabled = row.get::<_, i64>(3)? != 0;
        let recursive = row.get::<_, i64>(4)? != 0;
        let last_scan_unix = row.get(5)?;
        let last_error = row.get(6)?;
        let watcher_error: Option<String> = row.get(7)?;
        let is_offline = enabled && !Path::new(&path).exists();
        Ok(RootRecord {
            id: row.get(0)?,
            path,
            enabled,
            watch_enabled,
            recursive,
            is_offline,
            health: if !enabled {
                "disabled".to_string()
            } else if is_offline {
                "offline".to_string()
            } else if watcher_error.as_ref().is_some_and(|value| !value.is_empty()) {
                "degraded".to_string()
            } else if watch_enabled {
                "watching".to_string()
            } else {
                "indexed".to_string()
            },
            last_scan_unix,
            last_error,
            watcher_error,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

pub fn insert_root(db_path: &Path, path: &str) -> AppResult<()> {
    let connection = open(db_path)?;
    let now = now_unix();
    connection.execute(
        "
        INSERT INTO roots (path, enabled, watch_enabled, recursive, created_unix, updated_unix)
        VALUES (?1, 1, 1, 1, ?2, ?2)
        ON CONFLICT(path) DO UPDATE SET updated_unix = excluded.updated_unix
        ",
        params![path, now],
    )?;
    Ok(())
}

pub fn remove_root(db_path: &Path, path: &str) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute("DELETE FROM roots WHERE path = ?1", params![path])?;
    Ok(())
}

pub fn update_root(
    db_path: &Path,
    path: &str,
    enabled: bool,
    watch_enabled: bool,
    recursive: bool,
) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "
        UPDATE roots
        SET enabled = ?2, watch_enabled = ?3, recursive = ?4, updated_unix = ?5
        WHERE path = ?1
        ",
        params![
            path,
            if enabled { 1 } else { 0 },
            if watch_enabled { 1 } else { 0 },
            if recursive { 1 } else { 0 },
            now_unix()
        ],
    )?;
    Ok(())
}

pub fn set_root_scan_success(db_path: &Path, path: &str) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "
        UPDATE roots
        SET last_scan_unix = ?2, last_error = NULL, updated_unix = ?2
        WHERE path = ?1
        ",
        params![path, now_unix()],
    )?;
    Ok(())
}

pub fn set_root_scan_error(db_path: &Path, path: &str, error: &str) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "
        UPDATE roots
        SET last_error = ?2, updated_unix = ?3
        WHERE path = ?1
        ",
        params![path, error, now_unix()],
    )?;
    Ok(())
}

pub fn set_root_watcher_error(db_path: &Path, path: &str, error: Option<&str>) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "
        UPDATE roots
        SET watcher_error = ?2, updated_unix = ?3
        WHERE path = ?1
        ",
        params![path, error, now_unix()],
    )?;
    Ok(())
}

pub fn get_settings(db_path: &Path) -> AppResult<AppSettings> {
    let connection = open(db_path)?;
    let mut statement = connection.prepare("SELECT key, value FROM settings")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut settings = AppSettings {
        show_hidden_files: true,
        max_results: 50,
        prefer_exact_prefix_matches: true,
        follow_symlinks: false,
        directories_first: true,
        theme: "midnight".to_string(),
    };

    for row in rows {
        let (key, value) = row?;
        match key.as_str() {
            "show_hidden_files" => settings.show_hidden_files = parse_bool(&value),
            "max_results" => settings.max_results = value.parse().unwrap_or(50),
            "prefer_exact_prefix_matches" => {
                settings.prefer_exact_prefix_matches = parse_bool(&value)
            }
            "follow_symlinks" => settings.follow_symlinks = parse_bool(&value),
            "directories_first" => settings.directories_first = parse_bool(&value),
            "theme" => settings.theme = value,
            _ => {}
        }
    }

    Ok(settings)
}

pub fn list_exclude_rules(db_path: &Path) -> AppResult<Vec<ExcludeRule>> {
    let connection = open(db_path)?;
    let mut statement = connection.prepare(
        "SELECT id, pattern, type, applies_to, enabled FROM exclude_rules ORDER BY enabled DESC, pattern ASC",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(ExcludeRule {
            id: row.get(0)?,
            pattern: row.get(1)?,
            rule_type: row.get(2)?,
            applies_to: row.get(3)?,
            enabled: row.get::<_, i64>(4)? != 0,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

pub fn insert_exclude_rule(
    db_path: &Path,
    pattern: &str,
    rule_type: &str,
    applies_to: &str,
    enabled: bool,
) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "
        INSERT INTO exclude_rules (pattern, type, applies_to, enabled)
        VALUES (?1, ?2, ?3, ?4)
        ",
        params![pattern, rule_type, applies_to, if enabled { 1 } else { 0 }],
    )?;
    Ok(())
}

pub fn update_exclude_rule(
    db_path: &Path,
    id: i64,
    pattern: &str,
    rule_type: &str,
    applies_to: &str,
    enabled: bool,
) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "
        UPDATE exclude_rules
        SET pattern = ?2, type = ?3, applies_to = ?4, enabled = ?5
        WHERE id = ?1
        ",
        params![id, pattern, rule_type, applies_to, if enabled { 1 } else { 0 }],
    )?;
    Ok(())
}

pub fn remove_exclude_rule(db_path: &Path, id: i64) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute("DELETE FROM exclude_rules WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_setting(db_path: &Path, key: &str, value: &str) -> AppResult<()> {
    let connection = open(db_path)?;
    connection.execute(
        "
        INSERT INTO settings (key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ",
        params![key, value],
    )?;
    Ok(())
}

pub fn status_snapshot(db_path: &Path) -> AppResult<IndexStatus> {
    let connection = open(db_path)?;
    let indexed_entries: i64 =
        connection.query_row("SELECT COUNT(*) FROM indexed_entries", [], |row| row.get(0))?;
    let indexed_roots: i64 =
        connection.query_row("SELECT COUNT(*) FROM roots WHERE enabled = 1", [], |row| {
            row.get(0)
        })?;
    let last_scan_finished_unix = connection
        .query_row(
            "SELECT finished_unix FROM scan_runs WHERE finished_unix IS NOT NULL ORDER BY finished_unix DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;

    Ok(IndexStatus {
        phase: if indexed_entries > 0 {
            "ready".to_string()
        } else {
            "idle".to_string()
        },
        message: if indexed_entries > 0 {
            "Index loaded".to_string()
        } else {
            "Add an indexed root to start scanning".to_string()
        },
        indexed_entries,
        indexed_roots,
        last_scan_finished_unix,
        last_reconcile_unix: last_scan_finished_unix,
        daemon_connected: false,
        daemon_state: "unknown".to_string(),
        watcher_state: "unknown".to_string(),
        watcher_error_count: 0,
        offline_roots: Vec::new(),
        launcher_shortcut_enabled: false,
        session_type: String::new(),
        desktop: String::new(),
        inotify_limit_warning: false,
    })
}

pub fn begin_scan(connection: &Connection) -> AppResult<i64> {
    let now = now_unix();
    connection.execute(
        "INSERT INTO scan_runs (started_unix, status, files_seen, dirs_seen, errors_count) VALUES (?1, 'running', 0, 0, 0)",
        params![now],
    )?;
    Ok(connection.last_insert_rowid())
}

pub fn finish_scan(
    connection: &Connection,
    scan_id: i64,
    status: &str,
    files_seen: i64,
    dirs_seen: i64,
    errors_count: i64,
) -> AppResult<()> {
    connection.execute(
        "
        UPDATE scan_runs
        SET finished_unix = ?2, status = ?3, files_seen = ?4, dirs_seen = ?5, errors_count = ?6
        WHERE id = ?1
        ",
        params![
            scan_id,
            now_unix(),
            status,
            files_seen,
            dirs_seen,
            errors_count
        ],
    )?;
    Ok(())
}

pub fn insert_or_replace_entry(
    connection: &Connection,
    scan_id: i64,
    path: &Path,
    metadata: &std::fs::Metadata,
) -> AppResult<()> {
    let canonical = path.to_string_lossy().to_string();
    let parent_path = path
        .parent()
        .map(|parent| parent.to_string_lossy().to_string())
        .unwrap_or_default();
    let name = path
        .file_name()
        .map(|part| part.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = path
        .extension()
        .map(|part| part.to_string_lossy().to_string());
    let name_lower = name.to_lowercase();
    let name_initials = compute_initials(&name);
    let modified_unix = metadata.modified().ok().and_then(system_time_to_unix);
    let created_unix = metadata.created().ok().and_then(system_time_to_unix);
    let size_bytes = i64::try_from(metadata.len()).ok();

    connection.execute(
        "
        INSERT INTO indexed_entries (
            path, parent_path, name, name_lower, name_initials, extension, is_dir, size_bytes,
            modified_unix, created_unix, inode, dev, last_seen_scan_id, status
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?11, 'active')
        ON CONFLICT(path) DO UPDATE SET
            parent_path = excluded.parent_path,
            name = excluded.name,
            name_lower = excluded.name_lower,
            name_initials = excluded.name_initials,
            extension = excluded.extension,
            is_dir = excluded.is_dir,
            size_bytes = excluded.size_bytes,
            modified_unix = excluded.modified_unix,
            created_unix = excluded.created_unix,
            last_seen_scan_id = excluded.last_seen_scan_id,
            status = 'active'
        ",
        params![
            canonical,
            parent_path,
            name,
            name_lower,
            name_initials,
            extension,
            if metadata.is_dir() { 1 } else { 0 },
            size_bytes,
            modified_unix,
            created_unix,
            scan_id
        ],
    )?;

    Ok(())
}

pub fn clear_entries(connection: &Connection) -> AppResult<()> {
    connection.execute("DELETE FROM indexed_entries", [])?;
    Ok(())
}

pub fn remove_entries_for_prefix(db_path: &Path, path: &str) -> AppResult<()> {
    let connection = open(db_path)?;
    remove_entries_for_prefix_connection(&connection, path)
}

pub fn remove_entries_for_prefix_connection(connection: &Connection, path: &str) -> AppResult<()> {
    let like_pattern = format!("{path}/%");
    connection.execute(
        "DELETE FROM indexed_entries WHERE path = ?1 OR path LIKE ?2",
        params![path, like_pattern],
    )?;
    Ok(())
}

pub fn upsert_entry(connection: &Connection, path: &Path, metadata: &std::fs::Metadata) -> AppResult<()> {
    let canonical = path.to_string_lossy().to_string();
    let parent_path = path
        .parent()
        .map(|parent| parent.to_string_lossy().to_string())
        .unwrap_or_default();
    let name = path
        .file_name()
        .map(|part| part.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = path
        .extension()
        .map(|part| part.to_string_lossy().to_string());
    let name_lower = name.to_lowercase();
    let name_initials = compute_initials(&name);
    let modified_unix = metadata.modified().ok().and_then(system_time_to_unix);
    let created_unix = metadata.created().ok().and_then(system_time_to_unix);
    let size_bytes = i64::try_from(metadata.len()).ok();

    connection.execute(
        "
        INSERT INTO indexed_entries (
            path, parent_path, name, name_lower, name_initials, extension, is_dir, size_bytes,
            modified_unix, created_unix, inode, dev, last_seen_scan_id, status
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, NULL, 'active')
        ON CONFLICT(path) DO UPDATE SET
            parent_path = excluded.parent_path,
            name = excluded.name,
            name_lower = excluded.name_lower,
            name_initials = excluded.name_initials,
            extension = excluded.extension,
            is_dir = excluded.is_dir,
            size_bytes = excluded.size_bytes,
            modified_unix = excluded.modified_unix,
            created_unix = excluded.created_unix,
            status = 'active'
        ",
        params![
            canonical,
            parent_path,
            name,
            name_lower,
            name_initials,
            extension,
            if metadata.is_dir() { 1 } else { 0 },
            size_bytes,
            modified_unix,
            created_unix
        ],
    )?;

    Ok(())
}

pub fn query_entries(
    db_path: &Path,
    query: &str,
    max_results: usize,
    root: Option<&str>,
) -> AppResult<Vec<SearchResult>> {
    let connection = open(db_path)?;
    let parsed = parse_query(query);
    if parsed.search_terms().is_empty() && !parsed.has_filters_only() {
        return Ok(Vec::new());
    }
    let max_results = i64::try_from(max_results)?;
    let search_terms = parsed.search_terms();
    let token_refs = search_terms.iter().map(String::as_str).collect::<Vec<_>>();

    let mut results = if !search_terms.is_empty() && fts_ready(&connection)? && token_refs.iter().all(|token| token.len() >= 3) {
        let prefers_path_search = parsed.prefers_path_search()
            || token_refs.iter().any(|token| token.contains('/'));
        let name_results = query_entries_with_fts(
            &connection,
            &parsed,
            &search_terms.join(" "),
            &token_refs,
            max_results,
            SearchScope::Name,
            root,
        )?;

        if prefers_path_search || name_results.is_empty() {
            let path_results = query_entries_with_fts(
                &connection,
                &parsed,
                &search_terms.join(" "),
                &token_refs,
                max_results,
                SearchScope::Path,
                root,
            )?;
            merge_results(name_results, path_results, max_results as usize)
        } else {
            name_results
        }
    } else {
        query_entries_with_like(
            &connection,
            &parsed,
            &search_terms.join(" "),
            &token_refs,
            max_results,
            root,
        )?
    };

    // Acronym/initials boost: merge initials results for short all-alpha queries
    let raw_query = search_terms.join(" ");
    if raw_query.len() <= 5 && raw_query.chars().all(|c| c.is_ascii_alphabetic()) {
        let initials_results = query_entries_by_initials(&connection, &raw_query, max_results, root)?;
        results = merge_results(results, initials_results, max_results as usize);
    }

    Ok(results)
}

fn query_entries_with_like(
    connection: &Connection,
    parsed: &ParsedQuery,
    normalized: &str,
    tokens: &[&str],
    max_results: i64,
    root: Option<&str>,
) -> AppResult<Vec<SearchResult>> {
    if tokens.is_empty() {
        return query_entries_filtered_only(connection, parsed, max_results, root);
    }

    let exact = normalized.to_string();
    let prefix = format!("{normalized}%");
    let contains = format!("%{normalized}%");
    let (hidden_filter_clauses, hidden_filter_params) = build_filter_sql(parsed, "indexed_entries", 4);

    let mut sql = String::from(
        "
        SELECT
            path,
            parent_path,
            name,
            extension,
            is_dir,
            modified_unix,
            (
                CASE
                    WHEN name_lower = ?1 THEN 1000
                    WHEN name_lower LIKE ?2 THEN 850
                    WHEN name_lower LIKE ?3 THEN 600
                    WHEN lower(path) LIKE ?3 THEN 320
                    ELSE 0
                END
        ",
    );

    let mut params = vec![exact, prefix, contains];
    params.extend(hidden_filter_params);
    let mut next_param = 4 + (params.len() as i32 - 3);

    for token in tokens {
        sql.push_str(&format!(
            "
                + CASE
                    WHEN name_lower = ?{0} THEN 180
                    WHEN name_lower LIKE ?{1} THEN 140
                    WHEN lower(path) LIKE ?{1} THEN 70
                    ELSE 0
                END
            ",
            next_param,
            next_param + 1
        ));
        params.push((*token).to_string());
        params.push(format!("%{token}%"));
        next_param += 2;
    }

    sql.push_str(
        "
                + CASE WHEN open_count > 10 THEN 100
                       WHEN open_count > 5  THEN 70
                       WHEN open_count > 0  THEN 40
                       ELSE 0 END
        ) AS score FROM indexed_entries WHERE status = 'active'"
    );
    for clause in hidden_filter_clauses {
        sql.push_str(" AND ");
        sql.push_str(&clause);
    }

    if parsed.exact && tokens.len() == 1 {
        sql.push_str(&format!(" AND name_lower = ?{next_param}"));
        params.push(tokens[0].to_string());
        next_param += 1;
    } else {
        for token in tokens {
            sql.push_str(&format!(
                " AND (name_lower LIKE ?{next_param} OR lower(path) LIKE ?{next_param})"
            ));
            params.push(format!("%{token}%"));
            next_param += 1;
        }
    }

    for token in parsed.negated_search_terms() {
        sql.push_str(&format!(
            " AND name_lower NOT LIKE ?{next_param} AND lower(path) NOT LIKE ?{}",
            next_param + 1
        ));
        params.push(format!("%{token}%"));
        params.push(format!("%{token}%"));
        next_param += 2;
    }

    if let Some(root_path) = root {
        sql.push_str(&format!(" AND (path = ?{next_param} OR path LIKE ?{})", next_param + 1));
        params.push(root_path.to_string());
        params.push(format!("{root_path}/%"));
        next_param += 2;
    }

    sql.push_str(&format!(
        " ORDER BY score DESC, is_dir DESC, LENGTH(name) ASC, COALESCE(modified_unix, 0) DESC LIMIT ?{next_param}"
    ));
    params.push(max_results.to_string());

    let mut statement = connection.prepare(&sql)?;

    let rows = statement.query_map(params_from_iter(params.iter()), |row| {
        Ok(SearchResult {
            path: row.get(0)?,
            parent_path: row.get(1)?,
            name: row.get(2)?,
            extension: row.get(3)?,
            is_dir: row.get::<_, i64>(4)? != 0,
            modified_unix: row.get(5)?,
            score: row.get(6)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn query_entries_with_fts(
    connection: &Connection,
    parsed: &ParsedQuery,
    normalized: &str,
    tokens: &[&str],
    max_results: i64,
    scope: SearchScope,
    root: Option<&str>,
) -> AppResult<Vec<SearchResult>> {
    let exact = normalized.to_string();
    let prefix = format!("{normalized}%");
    let contains = format!("%{normalized}%");
    let match_query = build_fts_match_query(tokens, scope);
    let (filter_clauses, filter_params) = build_filter_sql(parsed, "ie", 5);

    let mut sql = String::from(
        "
        SELECT
            ie.path,
            ie.parent_path,
            ie.name,
            ie.extension,
            ie.is_dir,
            ie.modified_unix,
            (
                CASE
                    WHEN ie.name_lower = ?1 THEN 1000
                    WHEN ie.name_lower LIKE ?2 THEN 850
                    WHEN ie.name_lower LIKE ?3 THEN 600
                    WHEN lower(ie.path) LIKE ?3 THEN 320
                    ELSE 0
                END
        ",
    );

    let mut params = vec![exact, prefix, contains, match_query];
    params.extend(filter_params);
    let mut next_param = 5 + (params.len() as i32 - 4);

    for token in tokens {
        sql.push_str(&format!(
            "
                + CASE
                    WHEN ie.name_lower = ?{0} THEN 180
                    WHEN ie.name_lower LIKE ?{1} THEN 140
                    WHEN lower(ie.path) LIKE ?{1} THEN 70
                    ELSE 0
                END
            ",
            next_param,
            next_param + 1
        ));
        params.push((*token).to_string());
        params.push(format!("%{token}%"));
        next_param += 2;
    }

    sql.push_str(
        "
                + CASE WHEN ie.open_count > 10 THEN 100
                       WHEN ie.open_count > 5  THEN 70
                       WHEN ie.open_count > 0  THEN 40
                       ELSE 0 END
            ) AS score
        FROM indexed_entries ie
        JOIN indexed_entries_fts fts ON fts.rowid = ie.id
        WHERE ie.status = 'active'
          AND indexed_entries_fts MATCH ?4
        ",
    );
    for clause in filter_clauses {
        sql.push_str(" AND ");
        sql.push_str(&clause);
    }

    for token in parsed.negated_search_terms() {
        sql.push_str(&format!(
            " AND ie.name_lower NOT LIKE ?{next_param} AND lower(ie.path) NOT LIKE ?{}",
            next_param + 1
        ));
        params.push(format!("%{token}%"));
        params.push(format!("%{token}%"));
        next_param += 2;
    }

    if let Some(root_path) = root {
        sql.push_str(&format!(" AND (ie.path = ?{next_param} OR ie.path LIKE ?{})", next_param + 1));
        params.push(root_path.to_string());
        params.push(format!("{root_path}/%"));
        next_param += 2;
    }

    sql.push_str(&format!(
        " ORDER BY score DESC, ie.is_dir DESC, LENGTH(ie.name) ASC, COALESCE(ie.modified_unix, 0) DESC LIMIT ?{next_param}"
    ));
    params.push(max_results.to_string());

    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(params.iter()), |row| {
        Ok(SearchResult {
            path: row.get(0)?,
            parent_path: row.get(1)?,
            name: row.get(2)?,
            extension: row.get(3)?,
            is_dir: row.get::<_, i64>(4)? != 0,
            modified_unix: row.get(5)?,
            score: row.get(6)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn build_fts_match_query(tokens: &[&str], scope: SearchScope) -> String {
    tokens
        .iter()
        .map(|token| {
            let quoted = token.replace('"', "\"\"");
            match scope {
                SearchScope::Name => format!("name : \"{quoted}\""),
                SearchScope::Path => format!("path : \"{quoted}\""),
            }
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn query_entries_by_initials(
    connection: &Connection,
    initials: &str,
    max_results: i64,
    root: Option<&str>,
) -> AppResult<Vec<SearchResult>> {
    let exact = initials.to_lowercase();
    let prefix = format!("{}%", exact);
    let mut sql = String::from(
        "SELECT path, parent_path, name, extension, is_dir, modified_unix,
                CASE WHEN name_initials = ?1 THEN 500
                     WHEN name_initials LIKE ?2 THEN 350
                     ELSE 0 END AS score
         FROM indexed_entries
         WHERE status = 'active' AND name_initials IS NOT NULL
           AND (name_initials = ?1 OR name_initials LIKE ?2)"
    );
    let mut params: Vec<String> = vec![exact, prefix];
    if let Some(root_path) = root {
        sql.push_str(" AND (path = ?3 OR path LIKE ?4)");
        params.push(root_path.to_string());
        params.push(format!("{root_path}/%"));
    }
    sql.push_str(" ORDER BY score DESC, is_dir DESC, LENGTH(name) ASC LIMIT ?");
    params.push(max_results.to_string());

    let mut stmt = connection.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(params.iter()), |row| {
        Ok(SearchResult {
            path: row.get(0)?,
            parent_path: row.get(1)?,
            name: row.get(2)?,
            extension: row.get(3)?,
            is_dir: row.get::<_, i64>(4)? != 0,
            modified_unix: row.get(5)?,
            score: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn merge_results(
    primary: Vec<SearchResult>,
    secondary: Vec<SearchResult>,
    max_results: usize,
) -> Vec<SearchResult> {
    let mut merged = primary;

    for candidate in secondary {
        if merged.iter().any(|existing| existing.path == candidate.path) {
            continue;
        }
        merged.push(candidate);
        if merged.len() >= max_results {
            break;
        }
    }

    merged
}

#[derive(Clone, Copy)]
enum SearchScope {
    Name,
    Path,
}

fn build_filter_sql(
    parsed: &ParsedQuery,
    table_alias: &str,
    start_index: i32,
) -> (Vec<String>, Vec<String>) {
    let mut clauses = Vec::new();
    let mut params = Vec::new();
    let mut next_param = start_index;

    for filter in &parsed.filters {
        let (clause, values, next) = build_single_filter_clause(filter, table_alias, next_param, false);
        clauses.push(clause);
        params.extend(values);
        next_param = next;
    }

    for filter in &parsed.negated_filters {
        let (clause, values, next) = build_single_filter_clause(filter, table_alias, next_param, true);
        clauses.push(clause);
        params.extend(values);
        next_param = next;
    }

    (clauses, params)
}

fn build_single_filter_clause(
    filter: &QueryFilter,
    table_alias: &str,
    start_index: i32,
    negated: bool,
) -> (String, Vec<String>, i32) {
    let prefix = if table_alias.is_empty() {
        String::new()
    } else {
        format!("{table_alias}.")
    };
    let hidden_expr = format!("({}path LIKE '.%' OR {}path LIKE '%/.%')", prefix, prefix);

    match filter {
        QueryFilter::Extension(value) => (
            format!(
                "lower(COALESCE({}extension, '')) {} ?{}",
                prefix,
                if negated { "!=" } else { "=" },
                start_index
            ),
            vec![value.to_string()],
            start_index + 1,
        ),
        QueryFilter::ParentPath(value) => (
            format!(
                "{}lower({}parent_path) LIKE ?{}",
                if negated { "NOT " } else { "" },
                prefix,
                start_index
            ),
            vec![format!("%{value}%")],
            start_index + 1,
        ),
        QueryFilter::FullPath(value) => (
            format!(
                "{}lower({}path) LIKE ?{}",
                if negated { "NOT " } else { "" },
                prefix,
                start_index
            ),
            vec![format!("%{value}%")],
            start_index + 1,
        ),
        QueryFilter::EntryType(EntryTypeFilter::File) => (
            format!("{}is_dir {} 0", prefix, if negated { "!=" } else { "=" }),
            Vec::new(),
            start_index,
        ),
        QueryFilter::EntryType(EntryTypeFilter::Folder) => (
            format!("{}is_dir {} 1", prefix, if negated { "!=" } else { "=" }),
            Vec::new(),
            start_index,
        ),
        QueryFilter::Hidden(value) => {
            let desired = if negated { !*value } else { *value };
            (
                if desired {
                    hidden_expr
                } else {
                    format!("NOT {hidden_expr}")
                },
                Vec::new(),
                start_index,
            )
        }
    }
}

fn query_entries_filtered_only(
    connection: &Connection,
    parsed: &ParsedQuery,
    max_results: i64,
    root: Option<&str>,
) -> AppResult<Vec<SearchResult>> {
    let (filter_clauses, params) = build_filter_sql(parsed, "indexed_entries", 1);
    let mut sql = String::from(
        "
        SELECT
            path,
            parent_path,
            name,
            extension,
            is_dir,
            modified_unix,
            (CASE WHEN open_count > 10 THEN 100
                  WHEN open_count > 5  THEN 70
                  WHEN open_count > 0  THEN 40
                  ELSE 0 END) AS score
        FROM indexed_entries
        WHERE status = 'active'
        ",
    );

    for clause in filter_clauses {
        sql.push_str(" AND ");
        sql.push_str(&clause);
    }

    let mut all_params = params;
    let mut next_param = all_params.len() as i32 + 1;
    for token in parsed.negated_search_terms() {
        sql.push_str(&format!(
            " AND name_lower NOT LIKE ?{next_param} AND lower(path) NOT LIKE ?{}",
            next_param + 1
        ));
        all_params.push(format!("%{token}%"));
        all_params.push(format!("%{token}%"));
        next_param += 2;
    }

    if let Some(root_path) = root {
        sql.push_str(&format!(" AND (path = ?{next_param} OR path LIKE ?{})", next_param + 1));
        all_params.push(root_path.to_string());
        all_params.push(format!("{root_path}/%"));
        next_param += 2;
    }

    let limit_param = next_param;
    sql.push_str(&format!(
        " ORDER BY score DESC, is_dir DESC, COALESCE(modified_unix, 0) DESC, LENGTH(name) ASC LIMIT ?{limit_param}"
    ));
    all_params.push(max_results.to_string());

    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(all_params.iter()), |row| {
        Ok(SearchResult {
            path: row.get(0)?,
            parent_path: row.get(1)?,
            name: row.get(2)?,
            extension: row.get(3)?,
            is_dir: row.get::<_, i64>(4)? != 0,
            modified_unix: row.get(5)?,
            score: row.get(6)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn maybe_rebuild_fts(connection: &Connection) -> AppResult<()> {
    let indexed_entries: i64 =
        connection.query_row("SELECT COUNT(*) FROM indexed_entries", [], |row| row.get(0))?;
    let current_version: Option<String> = connection
        .query_row(
            "SELECT value FROM settings WHERE key = 'fts_schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    if indexed_entries > 0 && current_version.as_deref() != Some(FTS_SCHEMA_VERSION) {
        connection.execute(
            &format!("INSERT INTO {FTS_TABLE}({FTS_TABLE}) VALUES ('rebuild')"),
            [],
        )?;
        connection.execute(
            "
            INSERT INTO settings (key, value)
            VALUES ('fts_schema_version', ?1)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            ",
            params![FTS_SCHEMA_VERSION],
        )?;
    }

    Ok(())
}

pub fn ensure_fts_ready(db_path: &Path) -> AppResult<()> {
    let connection = open(db_path)?;
    maybe_rebuild_fts(&connection)
}

fn fts_ready(connection: &Connection) -> AppResult<bool> {
    let current_version: Option<String> = connection
        .query_row(
            "SELECT value FROM settings WHERE key = 'fts_schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    Ok(current_version.as_deref() == Some(FTS_SCHEMA_VERSION))
}

pub fn list_enabled_root_paths(db_path: &Path) -> AppResult<Vec<String>> {
    let connection = open(db_path)?;
    let mut statement =
        connection.prepare("SELECT path FROM roots WHERE enabled = 1 ORDER BY path ASC")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn seed_default_settings(connection: &Connection) -> AppResult<()> {
    let defaults = [
        ("show_hidden_files", "true"),
        ("max_results", "50"),
        ("prefer_exact_prefix_matches", "true"),
        ("follow_symlinks", "false"),
        ("directories_first", "true"),
        ("theme", "midnight"),
        ("fts_schema_version", ""),
    ];

    for (key, value) in defaults {
        connection.execute(
            "
            INSERT INTO settings (key, value)
            VALUES (?1, ?2)
            ON CONFLICT(key) DO NOTHING
            ",
            params![key, value],
        )?;
    }

    let default_rules = [
        ("node_modules", "glob", "dir"),
        (".git", "glob", "dir"),
        (".cache", "glob", "dir"),
    ];

    for (pattern, rule_type, applies_to) in default_rules {
        connection.execute(
            "
            INSERT INTO exclude_rules (pattern, type, applies_to, enabled)
            SELECT ?1, ?2, ?3, 1
            WHERE NOT EXISTS (
                SELECT 1 FROM exclude_rules WHERE pattern = ?1 AND type = ?2 AND applies_to = ?3
            )
            ",
            params![pattern, rule_type, applies_to],
        )?;
    }

    Ok(())
}

fn parse_bool(value: &str) -> bool {
    matches!(value, "1" | "true" | "yes" | "on")
}

fn system_time_to_unix(value: SystemTime) -> Option<i64> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_secs()).ok())
}

pub fn now_unix() -> i64 {
    system_time_to_unix(SystemTime::now()).unwrap_or_default()
}
