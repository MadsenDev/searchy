# MVP Spec

## Must work now

- manage indexed roots by absolute path
- run a recursive scan for a new root
- persist entries and roots in SQLite
- search by filename and path with ranked results
- open a selected result
- reveal a selected result in its parent directory
- show current index counts and scan phase

## Deferred but designed for

- filesystem watchers
- exclude rules
- tray presence
- global hotkey launcher
- start on login
- extension filters

## Advanced syntax now supported

- `ext:` and `kind:` for extension or kind filters
- `in:` and `under:` for parent-path scoping
- `path:` for explicit path search
- `type:` and `is:` for file or folder filtering
- `hidden:` and `exact:` flags
- quoted phrases and `!` negation

## UX direction

- launcher-first layout
- keyboard-forward controls
- fast incremental search
- visible status, not hidden background magic

## Constraints

- Linux only
- filename/path search only
- no content indexing
- no cloud or sync behavior
