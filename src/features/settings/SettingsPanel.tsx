import { useEffect, useState } from 'react'
import { getAutostartEnabled, setAutostartEnabled } from '../../lib/tauri'
import type { AppSettings, ExcludeRule, StatusSnapshot } from '../../lib/types'

export function SettingsPanel({
  settings,
  status,
  excludeRules,
  onToggle,
  onRebuild,
  onAddExcludeRule,
  onRemoveExcludeRule,
}: {
  settings: AppSettings | null
  status: StatusSnapshot | null
  excludeRules: ExcludeRule[]
  onToggle: (key: keyof AppSettings, value: boolean) => void
  onRebuild: () => void
  onAddExcludeRule: (pattern: string, ruleType: string, appliesTo: string) => void
  onRemoveExcludeRule: (id: number) => void
}) {
  const [pattern, setPattern] = useState('')
  const [ruleType, setRuleType] = useState('glob')
  const [appliesTo, setAppliesTo] = useState('both')
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    getAutostartEnabled().then(setAutostart).catch(() => setAutostart(false))
  }, [])

  async function handleAutostartToggle(enabled: boolean) {
    await setAutostartEnabled(enabled)
    setAutostart(enabled)
  }

  if (!settings) {
    return null
  }

  const toggles: Array<{ key: keyof AppSettings; label: string }> = [
    { key: 'showHiddenFiles', label: 'Show hidden files' },
    { key: 'preferExactPrefixMatches', label: 'Prefer exact prefix matches' },
    { key: 'followSymlinks', label: 'Follow symlinked directories' },
    { key: 'directoriesFirst', label: 'Prefer directories first' },
  ]

  function submitRule() {
    if (!pattern.trim()) {
      return
    }
    onAddExcludeRule(pattern.trim(), ruleType, appliesTo)
    setPattern('')
    setRuleType('glob')
    setAppliesTo('both')
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-['IBM_Plex_Mono'] text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
            Settings
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">Indexing controls</h2>
        </div>
        <button
          type="button"
          onClick={onRebuild}
          className="rounded-full border border-[color:var(--line)] px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--text)] hover:border-[color:var(--line-strong)]"
        >
          Rebuild index
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {toggles.map((toggle) => (
          <label
            key={toggle.key}
            className="flex items-center justify-between gap-3 rounded-[1.4rem] border border-[color:var(--line-soft)] bg-[color:var(--chip-bg)] px-4 py-3 text-sm text-[color:var(--text)]"
          >
            <span>{toggle.label}</span>
            <input
              type="checkbox"
              checked={Boolean(settings[toggle.key])}
              onChange={(event) => onToggle(toggle.key, event.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
        ))}
      </div>

      {autostart !== null && (
        <label className="mt-3 flex items-center justify-between gap-3 rounded-[1.4rem] border border-[color:var(--line-soft)] bg-[color:var(--chip-bg)] px-4 py-3 text-sm text-[color:var(--text)]">
          <span>Start on login</span>
          <input
            type="checkbox"
            checked={autostart}
            onChange={(event) => handleAutostartToggle(event.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      )}

      <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line-soft)] bg-[color:var(--chip-bg)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--text)]">Daemon status</h3>
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {status?.daemonState || 'unknown'} · watcher {status?.watcherState || 'unknown'}
              {status?.watcherErrorCount ? ` · ${status.watcherErrorCount} watcher issue(s)` : ''}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
              status?.daemonConnected
                ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                : 'border-rose-300/20 bg-rose-300/10 text-rose-100'
            }`}
          >
            {status?.daemonConnected ? 'Connected' : 'Unavailable'}
          </span>
        </div>
        {status?.offlineRoots?.length ? (
          <p className="mt-3 text-xs leading-5 text-amber-100/85">
            Offline roots: {status.offlineRoots.join(', ')}
          </p>
        ) : null}
        {status?.lastReconcileUnix ? (
          <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
            Last reconcile at {new Date(status.lastReconcileUnix * 1000).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line-soft)] bg-[color:var(--chip-bg)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--text)]">Exclude rules</h3>
            <p className="mt-1 text-xs text-[color:var(--muted)]">Applied during scans, watcher updates, and result cleanup.</p>
          </div>
          <span className="rounded-full border border-[color:var(--line-soft)] px-3 py-1 text-xs text-[color:var(--muted)]">
            {excludeRules.length} rule{excludeRules.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="node_modules or ^/home/chris/.cache"
            className="min-w-0 rounded-[1rem] border border-[color:var(--line-soft)] bg-[color:var(--field-bg)] px-4 py-3 text-sm text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]"
          />
          <select
            value={ruleType}
            onChange={(event) => setRuleType(event.target.value)}
            className="rounded-[1rem] border border-[color:var(--line-soft)] bg-[color:var(--field-bg)] px-3 py-3 text-sm text-[color:var(--text)] outline-none"
          >
            <option value="glob">glob</option>
            <option value="prefix">prefix</option>
            <option value="exact">exact</option>
            <option value="regex">regex</option>
          </select>
          <select
            value={appliesTo}
            onChange={(event) => setAppliesTo(event.target.value)}
            className="rounded-[1rem] border border-[color:var(--line-soft)] bg-[color:var(--field-bg)] px-3 py-3 text-sm text-[color:var(--text)] outline-none"
          >
            <option value="both">both</option>
            <option value="dir">dir</option>
            <option value="file">file</option>
          </select>
          <button
            type="button"
            onClick={submitRule}
            className="rounded-[1rem] border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100"
          >
            Add rule
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {excludeRules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-[color:var(--line-soft)] bg-[color:var(--field-bg)] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[color:var(--text)]">{rule.pattern}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {rule.ruleType} · {rule.appliesTo} · {rule.enabled ? 'enabled' : 'disabled'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveExcludeRule(rule.id)}
                className="rounded-full border border-[color:var(--line-soft)] px-3 py-1 text-xs text-[color:var(--muted)] hover:border-[color:var(--line-strong)]"
              >
                Remove
              </button>
            </div>
          ))}
          {!excludeRules.length ? <p className="text-xs text-[color:var(--faint)]">No exclude rules yet.</p> : null}
        </div>
      </div>
    </section>
  )
}
