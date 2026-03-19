# Database Schema

## `indexed_entries`

- `id` INTEGER PRIMARY KEY
- `path` TEXT UNIQUE NOT NULL
- `parent_path` TEXT NOT NULL
- `name` TEXT NOT NULL
- `name_lower` TEXT NOT NULL
- `extension` TEXT
- `is_dir` INTEGER NOT NULL
- `size_bytes` INTEGER
- `modified_unix` INTEGER
- `created_unix` INTEGER
- `inode` INTEGER
- `dev` INTEGER
- `last_seen_scan_id` INTEGER
- `status` TEXT NOT NULL DEFAULT 'active'

Indexes:

- `idx_indexed_entries_name_lower`
- `idx_indexed_entries_parent_path`
- `idx_indexed_entries_extension`
- `idx_indexed_entries_name_dir`

## `roots`

- `id` INTEGER PRIMARY KEY
- `path` TEXT UNIQUE NOT NULL
- `enabled` INTEGER NOT NULL DEFAULT 1
- `watch_enabled` INTEGER NOT NULL DEFAULT 1
- `recursive` INTEGER NOT NULL DEFAULT 1
- `created_unix` INTEGER NOT NULL
- `updated_unix` INTEGER NOT NULL

## `settings`

- `key` TEXT PRIMARY KEY
- `value` TEXT NOT NULL

Default keys:

- `show_hidden_files`
- `max_results`
- `prefer_exact_prefix_matches`
- `follow_symlinks`
- `directories_first`
- `theme`

## `scan_runs`

- `id` INTEGER PRIMARY KEY
- `started_unix` INTEGER NOT NULL
- `finished_unix` INTEGER
- `status` TEXT NOT NULL
- `files_seen` INTEGER NOT NULL DEFAULT 0
- `dirs_seen` INTEGER NOT NULL DEFAULT 0
- `errors_count` INTEGER NOT NULL DEFAULT 0

## Planned next table

`exclude_rules` is specified in the product brief but not implemented yet. The next backend step is adding rule evaluation to both scan and query paths.
