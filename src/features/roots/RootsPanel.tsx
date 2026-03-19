import type { RootRecord } from '../../lib/types'

export function RootsPanel({
  roots,
  draftRoot,
  setDraftRoot,
  busy,
  errorMessage,
  onAddRoot,
  onPickRoot,
  onRemoveRoot,
  onToggleRoot,
  onRescanRoot,
}: {
  roots: RootRecord[]
  draftRoot: string
  setDraftRoot: (value: string) => void
  busy: boolean
  errorMessage: string | null
  onAddRoot: () => void
  onPickRoot: () => void
  onRemoveRoot: (path: string) => void
  onToggleRoot: (root: RootRecord, field: 'enabled' | 'watchEnabled', value: boolean) => void
  onRescanRoot: (path: string) => void
}) {
  const formatRelative = (unix: number | null) => {
    if (!unix) {
      return 'never'
    }

    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unix)
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const healthClass = (root: RootRecord) =>
    root.health === 'offline'
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : root.health === 'degraded'
        ? 'border-rose-300/20 bg-rose-300/10 text-rose-100'
      : root.health === 'disabled'
        ? 'border-white/10 bg-white/[0.04] text-slate-300'
        : root.health === 'watching'
          ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
          : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'

  return (
    <section className="rounded-[2rem] border border-white/8 bg-[var(--panel)] p-5 shadow-[var(--shadow)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-['IBM_Plex_Mono'] text-xs uppercase tracking-[0.28em] text-orange-200/80">
            Indexed roots
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Choose where Searchy looks</h2>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
          {roots.length} root{roots.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-4 rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">Add an indexed folder</div>
            <div className="mt-1 text-xs text-slate-400">
              Use the native picker first. Manual paths stay available for unusual cases.
            </div>
          </div>
          <button
            type="button"
            onClick={onPickRoot}
            disabled={busy}
            className="rounded-[1.1rem] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-slate-950"
          >
            {busy ? 'Working…' : 'Browse folders'}
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          <input
            value={draftRoot}
            onChange={(event) => setDraftRoot(event.target.value)}
            placeholder="/home/chris/Documents"
            disabled={busy}
            className="min-w-0 flex-1 rounded-[1.2rem] border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-orange-300/40"
          />
          <button
            type="button"
            onClick={onAddRoot}
            disabled={busy || !draftRoot.trim()}
            className="rounded-[1.2rem] border border-white/12 px-4 py-3 text-sm font-semibold text-white hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? 'Adding…' : 'Add path'}
          </button>
        </div>
        {errorMessage ? <p className="mt-3 text-xs text-rose-200">{errorMessage}</p> : null}
      </div>

      <div className="mt-4 grid gap-3">
        {roots.map((root) => (
          <div
            key={root.path}
            className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{root.path}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-2.5 py-1 uppercase tracking-[0.18em] ${healthClass(root)}`}>
                  {root.health}
                </span>
                <span className="text-slate-400">
                  {root.watchEnabled ? 'watch enabled' : 'watch disabled'} · {root.recursive ? 'recursive' : 'single level'}
                </span>
              </div>
              {root.isOffline ? (
                <div className="mt-2 text-xs leading-5 text-amber-100/85">
                  Root is currently offline or unavailable. Searchy will keep its indexed data until the path returns or you remove it.
                </div>
              ) : null}
              {root.watcherError ? (
                <div className="mt-2 text-xs leading-5 text-rose-200/85">
                  Watcher issue: {root.watcherError}
                </div>
              ) : null}
              {root.lastError ? (
                <div className="mt-2 text-xs leading-5 text-rose-200/85">
                  Last scan error: {root.lastError}
                </div>
              ) : null}
              <div className="mt-2 text-xs text-slate-500">
                Last successful scan: {formatRelative(root.lastScanUnix)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onRescanRoot(root.path)}
                disabled={root.isOffline}
                className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-300/10"
              >
                Rescan
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveRoot(root.path)}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-white/25"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-200">
              <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={root.enabled}
                  onChange={(event) => onToggleRoot(root, 'enabled', event.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>Enabled</span>
              </label>
              <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={root.watchEnabled}
                  disabled={!root.enabled || root.isOffline}
                  onChange={(event) => onToggleRoot(root, 'watchEnabled', event.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>Live watch</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
