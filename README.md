<p align="center">
  <img src="assets/png/searchy-lockup-dark.png" alt="Searchy" width="480" />
</p>

<p align="center">
  <strong>Instant file search for Linux. No waiting. No bloat. No nonsense.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux-orange?style=flat-square" alt="Linux" />
  <img src="https://img.shields.io/badge/built_with-Tauri_v2-orange?style=flat-square" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/backend-Rust_%2B_SQLite-orange?style=flat-square" alt="Rust + SQLite" />
  <img src="https://img.shields.io/badge/license-MIT-orange?style=flat-square" alt="MIT" />
</p>

---

Searchy is a Linux-first desktop file launcher that finds anything on your filesystem the instant you type — no cloud, no content indexing, no daemon eating your RAM. It indexes filenames and paths into a local SQLite database and returns ranked results faster than you can blink.

If you've ever used [Everything](https://www.voidtools.com/) on Windows and felt the loss when switching to Linux, Searchy is what you've been waiting for.

## Why Searchy

Linux has `find`, `locate`, and `fzf`. None of them have a keyboard-first GUI that launches in a second, ranks results intelligently, and gets out of your way. Searchy does.

- **Instant results** — SQLite-backed index with ranked filename/path search, no full-text crawl needed
- **Keyboard-forward** — navigate, open, and reveal files without touching the mouse
- **Advanced syntax** — filter by extension, folder, type, and more without leaving the search bar
- **Lightweight** — a Tauri app means a real native window backed by Rust, not an Electron heap
- **Transparent** — visible index status, no hidden background magic
- **Yours** — local-only, no telemetry, no accounts, no sync

## Features

| Feature | Status |
|---|---|
| Recursive filesystem indexing | ✅ |
| Ranked filename + path search | ✅ |
| Advanced search syntax | ✅ |
| Open file / reveal in folder | ✅ |
| Multiple indexed roots | ✅ |
| Index status + scan progress | ✅ |
| File watcher (incremental updates) | 🔜 |
| Global hotkey launcher | 🔜 |
| System tray + start on login | 🔜 |

## Search syntax

Plain text works out of the box. Layer in filters when you want precision:

```
invoice                       # filename contains "invoice"
ext:pdf report                # PDFs containing "report" in name
in:documents invoice          # inside a folder named "documents"
type:folder rust              # folders named "rust"
"annual report" !draft        # exact phrase, exclude "draft"
kind:image vacation           # images with "vacation" in name
under:archive                 # anything under a path containing "archive"
is:folder                     # directories only
hidden:true .config           # include hidden files
exact:Makefile                # case-sensitive exact match
```

## Stack

| Layer | Technology |
|---|---|
| App shell | Tauri v2 |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Rust |
| Database | SQLite via `rusqlite` |

## Getting started

```bash
npm install
npm run tauri dev
```

For a web-only UI preview (uses a local fallback dataset, no Tauri required):

```bash
npm run dev
```

## Project layout

```
assets/           # brand assets and icons
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

## Roadmap

1. **File watching** — debounced incremental index updates so results stay current without a full rescan
2. **Native folder picker** — replace manual root path entry with a system dialog
3. **Global hotkey + tray** — summon Searchy from anywhere, hide it when you're done
4. **Exclusion rules** — skip `node_modules`, `.git`, and whatever else you don't want indexed
5. **Large-index hardening** — pagination, smarter ranking, and performance tuning for deep filesystems

---

<p align="center">
  <img src="assets/searchy-icon.svg" alt="Searchy icon" width="48" />
</p>
</content>
</invoke>