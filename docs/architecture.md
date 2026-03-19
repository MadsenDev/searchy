# Searchy Architecture

## Product shape

Searchy is a compact launcher UI over a Rust indexing core. The frontend owns presentation and interaction. The backend owns indexing, persistence, search, and platform actions.

## Layers

### UI

- compact search input
- results list
- root management
- settings panel
- indexing status

### Tauri command boundary

- `search`
- `get_status`
- `get_roots`
- `add_root`
- `remove_root`
- `rebuild_index`
- `get_settings`
- `update_setting`
- `open_path`
- `reveal_path`

### Rust core

- schema initialization
- root persistence
- recursive scans
- ranked SQLite-backed query execution
- status tracking
- Linux-specific open/reveal helpers

### Persistence

SQLite stores:

- indexed entries
- indexed roots
- settings
- scan runs

## Execution model

Blocking filesystem and SQLite work runs in `spawn_blocking` so the desktop UI thread is not stalled. Commands update shared scan status through application state.

## Next backend split

The current code keeps one in-process core inside Tauri. The internal module layout is chosen so the indexing service can later move into a dedicated daemon with minimal API churn:

- `core/` remains reusable
- `commands/` becomes the Tauri adapter layer
- `services/` can host daemon-facing orchestration

## Linux constraints

- no NTFS-MFT assumptions
- permission failures are logged and skipped
- removable or offline roots are tolerated
- symlinked directories are not followed recursively in the current scanner
- `xdg-open` is used for `open` and `reveal`
