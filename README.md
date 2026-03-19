# Searchy

Searchy is a Linux-first desktop file search launcher inspired by Everything. It is built with Tauri v2, React, TypeScript, Rust, and SQLite, with a filename-first search model and a background-friendly architecture that can later split into a daemon.

## Current scope

This repo now includes:

- a launcher-style React shell
- a Rust/Tauri backend with SQLite schema initialization
- indexed root management
- initial recursive scans into SQLite
- ranked filename/path search
- optional advanced search syntax with filters and aliases
- open and reveal actions for Linux
- product and architecture docs to keep implementation aligned

Watcher-based incremental indexing, tray behavior, hotkeys, and startup integration are intentionally staged for the next implementation phase.

## Stack

- Tauri v2
- React 19
- TypeScript
- Tailwind CSS v4
- Rust
- SQLite via `rusqlite`

## Getting started

```bash
npm install
npm run tauri dev
```

For a web-only preview of the UI shell:

```bash
npm run dev
```

The web preview uses a local fallback dataset because Tauri commands are not available in a normal browser tab.

## Search syntax

Plain text still works as the default search mode. Optional filters are available when you want to narrow results faster:

- `ext:pdf report`
- `in:documents invoice`
- `type:folder rust`
- `"annual report" !draft`
- aliases such as `under:archive` and `is:folder`

## Project layout

```text
docs/
  architecture.md
  db-schema.md
  mvp-spec.md
  roadmap.md
src/
  components/
  features/
  hooks/
  lib/
  pages/
src-tauri/
  capabilities/
  src/
    commands/
    core/
    platform/
    services/
```

## Near-term plan

1. Add file watching with debounced incremental updates.
2. Replace manual root path entry with a native folder picker.
3. Add tray, launcher hotkey, and startup integration.
4. Harden ranking, exclusions, and large-index performance.
