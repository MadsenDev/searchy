import { useEffect, useRef, useState } from 'react'
import { JokeOverlay } from '../components/JokeOverlay'
import { ResultList } from '../features/results/ResultList'
import { RootsPanel } from '../features/roots/RootsPanel'
import { useSearch } from '../features/search/useSearch'
import { SettingsPanel } from '../features/settings/SettingsPanel'
import {
  addExcludeRule,
  addRoot,
  getExcludeRules,
  getRoots,
  getSettings,
  getStatus,
  hideLauncherWindow,
  onLauncherShown,
  openPath,
  pickDirectory,
  rebuildIndex,
  removeRoot,
  revealPath,
  removeExcludeRule,
  updateSetting,
  updateRoot,
  rescanRoot,
} from '../lib/tauri'
import { getSearchSyntaxExamples, parseSearchSyntax } from '../lib/searchSyntax'
import type { AppSettings, ExcludeRule, RootRecord, StatusSnapshot } from '../lib/types'

function formatUiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}

function SearchStateCard({
  eyebrow,
  title,
  body,
  tone = 'default',
  detail,
}: {
  eyebrow: string
  title: string
  body: string
  tone?: 'default' | 'loading' | 'empty'
  detail?: string
}) {
  const toneClass =
    tone === 'loading'
      ? 'border-amber-300/18 bg-[linear-gradient(180deg,rgba(255,209,102,0.08),rgba(255,255,255,0.03))]'
      : tone === 'empty'
        ? 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))]'
        : 'border-dashed border-white/12 bg-white/[0.02]'

  return (
    <div className={`rounded-[1.8rem] px-5 py-5 sm:px-6 sm:py-6 ${toneClass}`}>
      <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.28em] text-white/45">{eyebrow}</p>
      <h3 className="mt-2.5 text-lg font-semibold tracking-[-0.02em] text-white">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{body}</p>
      {detail ? <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/38">{detail}</p> : null}
    </div>
  )
}

function PlaceholderResults({
  hasRoots,
  status,
}: {
  hasRoots: boolean
  status: StatusSnapshot | null
}) {
  const rows = [
    hasRoots
      ? {
          title: 'Start typing to search',
          detail: `${status?.indexedEntries?.toLocaleString() ?? '0'} indexed entries ready`,
        }
      : {
          title: 'Add a root in Roots',
          detail: 'Search needs at least one indexed folder',
        },
    {
      title: 'Try short filename fragments',
      detail: 'Examples: report, invoice, ext:pdf, type:folder',
    },
    {
      title: 'Enter opens the top result',
      detail: 'Ctrl+Enter reveals it in the parent folder',
    },
    {
      title: 'Roots and Settings stay off to the side',
      detail: 'The main window stays focused on search only',
    },
  ]

  return (
    <div className="grid min-w-0 gap-2">
      {rows.map((row, index) => (
        <div
          key={row.title}
          className={`rounded-[1.3rem] border px-4 py-3 ${
            index === 0
              ? 'border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))]'
              : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))]'
          }`}
        >
          <div className="text-[0.98rem] font-semibold tracking-[-0.02em] text-white">{row.title}</div>
          <div className="mt-1 text-[13px] text-slate-400">{row.detail}</div>
        </div>
      ))}
    </div>
  )
}

function SlideOverPanel({
  title,
  eyebrow,
  open,
  onClose,
  children,
}: {
  title: string
  eyebrow: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <div
        className={`absolute inset-0 z-20 bg-slate-950/55 backdrop-blur-sm transition ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 right-0 z-30 flex w-full max-w-[34rem] flex-col border-l border-white/10 bg-[linear-gradient(180deg,rgba(8,15,29,0.96),rgba(8,15,29,0.9))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl transition duration-300 sm:p-5 ${
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-['IBM_Plex_Mono'] text-[11px] uppercase tracking-[0.28em] text-white/45">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/12 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300 transition hover:border-white/24 hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </aside>
    </>
  )
}

function formatRelativeStatusTime(unix: number | null | undefined) {
  if (!unix) {
    return 'No reconcile yet'
  }

  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unix)
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`
  }
  return `${Math.floor(seconds / 86400)}d ago`
}

export function LauncherPage() {
  const [activePanel, setActivePanel] = useState<'roots' | 'settings' | null>(null)
  const [query, setQuery] = useState('')
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false)
  const [draftRoot, setDraftRoot] = useState('')
  const [roots, setRoots] = useState<RootRecord[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [status, setStatus] = useState<StatusSnapshot | null>(null)
  const [excludeRules, setExcludeRules] = useState<ExcludeRule[]>([])
  const [rootBusy, setRootBusy] = useState(false)
  const [rootError, setRootError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const syntax = parseSearchSyntax(query)
  const effectiveQuery = syntax.cleanQuery
  const { loading, results } = useSearch(effectiveQuery, settings)
  const hideOnDismiss = status?.launcherShortcutEnabled ?? false
  const syntaxExamples = getSearchSyntaxExamples()
  const isJokeMode = Boolean(syntax.jokeTheme)
  const shellClass =
    syntax.jokeTheme === 'confetti'
      ? 'border-amber-300/16 bg-[linear-gradient(180deg,rgba(255,248,220,0.1),rgba(251,191,36,0.04),rgba(255,255,255,0.03))] shadow-[0_26px_90px_rgba(251,191,36,0.12)]'
      : syntax.jokeTheme === 'disco'
        ? 'border-fuchsia-300/18 bg-[linear-gradient(180deg,rgba(255,0,110,0.08),rgba(56,189,248,0.05),rgba(255,255,255,0.03))] shadow-[0_28px_96px_rgba(255,0,110,0.12)]'
        : syntax.jokeTheme === 'matrix'
          ? 'border-emerald-300/18 bg-[linear-gradient(180deg,rgba(6,78,59,0.14),rgba(2,6,23,0.18),rgba(255,255,255,0.02))] shadow-[0_26px_90px_rgba(16,185,129,0.1)]'
          : syntax.jokeTheme === 'synthwave'
            ? 'border-cyan-300/18 bg-[linear-gradient(180deg,rgba(168,85,247,0.08),rgba(56,189,248,0.05),rgba(255,255,255,0.03))] shadow-[0_28px_96px_rgba(56,189,248,0.12)]'
            : 'border-[var(--line)] bg-[var(--panel-strong)] shadow-[var(--shadow)]'
  const queryShellClass =
    syntax.jokeTheme === 'confetti'
      ? 'border-amber-300/14 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(255,255,255,0.03))]'
      : syntax.jokeTheme === 'disco'
        ? 'border-fuchsia-300/16 bg-[linear-gradient(180deg,rgba(255,0,110,0.08),rgba(255,255,255,0.03))]'
        : syntax.jokeTheme === 'matrix'
          ? 'border-emerald-300/14 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(255,255,255,0.02))]'
          : syntax.jokeTheme === 'synthwave'
            ? 'border-cyan-300/16 bg-[linear-gradient(180deg,rgba(56,189,248,0.08),rgba(255,255,255,0.03))]'
            : 'border-white/8 bg-slate-950/30'
  const inputClass =
    syntax.jokeTheme === 'confetti'
      ? 'border-amber-300/18 bg-white/[0.05] focus:border-amber-200/45 focus:shadow-[0_0_0_4px_rgba(251,191,36,0.08)]'
      : syntax.jokeTheme === 'disco'
        ? 'border-fuchsia-300/20 bg-white/[0.05] focus:border-fuchsia-200/45 focus:shadow-[0_0_0_4px_rgba(217,70,239,0.08)]'
        : syntax.jokeTheme === 'matrix'
          ? 'border-emerald-300/20 bg-emerald-950/18 focus:border-emerald-200/45 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.08)]'
          : syntax.jokeTheme === 'synthwave'
            ? 'border-cyan-300/20 bg-white/[0.05] focus:border-cyan-200/45 focus:shadow-[0_0_0_4px_rgba(56,189,248,0.08)]'
            : 'border-white/10 bg-white/[0.03] focus:border-orange-300/40'
  const accentChipClass =
    syntax.jokeTheme === 'confetti'
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : syntax.jokeTheme === 'disco'
        ? 'border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100'
        : syntax.jokeTheme === 'matrix'
          ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
          : syntax.jokeTheme === 'synthwave'
            ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
            : 'border-white/10 bg-white/[0.04] text-slate-200'
  const helpButtonClass =
    syntax.jokeTheme === 'confetti'
      ? 'hover:border-amber-200/28 hover:text-amber-50 hover:bg-amber-300/10'
      : syntax.jokeTheme === 'disco'
        ? 'hover:border-fuchsia-200/28 hover:text-fuchsia-50 hover:bg-fuchsia-300/10'
        : syntax.jokeTheme === 'matrix'
          ? 'hover:border-emerald-200/28 hover:text-emerald-50 hover:bg-emerald-300/10'
          : syntax.jokeTheme === 'synthwave'
            ? 'hover:border-cyan-200/28 hover:text-cyan-50 hover:bg-cyan-300/10'
            : 'hover:border-white/20 hover:text-white'
  useEffect(() => {
    void Promise.all([getRoots(), getSettings(), getStatus(), getExcludeRules()]).then(
      ([nextRoots, nextSettings, nextStatus, nextExcludeRules]) => {
        setRoots(nextRoots)
        setSettings(nextSettings)
        setStatus(nextStatus)
        setExcludeRules(nextExcludeRules)
      },
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    let dispose = () => {}

    void onLauncherShown(() => {
      if (cancelled) {
        return
      }

      setQuery('')
      setSelectedIndex(0)
      setActivePanel(null)
      window.setTimeout(() => {
        inputRef.current?.focus()
      }, 10)
    }).then((unlisten) => {
      dispose = unlisten
    })

    return () => {
      cancelled = true
      dispose()
    }
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void getStatus().then((nextStatus) => {
        setStatus(nextStatus)
      })
    }, 2500)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && results[selectedIndex]) {
        event.preventDefault()
        if (hideOnDismiss) {
          void hideLauncherWindow().then(() => revealPath(results[selectedIndex].path))
        } else {
          void revealPath(results[selectedIndex].path)
        }
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && results[selectedIndex]) {
        event.preventDefault()
        void navigator.clipboard.writeText(results[selectedIndex].path)
        return
      }

      if (event.key === 'ArrowDown' && results.length) {
        event.preventDefault()
        setSelectedIndex((current) => (current + 1) % results.length)
        return
      }

      if (event.key === 'ArrowUp' && results.length) {
        event.preventDefault()
        setSelectedIndex((current) => (current - 1 + results.length) % results.length)
        return
      }

      if (event.key === 'Enter' && results[selectedIndex]) {
        event.preventDefault()
        if (hideOnDismiss) {
          void hideLauncherWindow().then(() => openPath(results[selectedIndex].path))
        } else {
          void openPath(results[selectedIndex].path)
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        if (activePanel) {
          setActivePanel(null)
          return
        }
        setQuery('')
        if (hideOnDismiss) {
          void hideLauncherWindow()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePanel, hideOnDismiss, results, selectedIndex])

  async function refreshSidebarData() {
    const [nextRoots, nextStatus, nextExcludeRules] = await Promise.all([getRoots(), getStatus(), getExcludeRules()])
    setRoots(nextRoots)
    setStatus(nextStatus)
    setExcludeRules(nextExcludeRules)
  }

  async function handleAddRoot() {
    if (!draftRoot.trim()) {
      return
    }

    setRootBusy(true)
    setRootError(null)

    try {
      await addRoot(draftRoot.trim())
      setDraftRoot('')
      await refreshSidebarData()
    } catch (error) {
      setRootError(formatUiError(error, 'Failed to add root'))
    } finally {
      setRootBusy(false)
    }
  }

  async function handlePickRoot() {
    setRootBusy(true)
    setRootError(null)

    try {
      const selected = await pickDirectory()
      if (!selected) {
        return
      }

      setDraftRoot(selected)
      await addRoot(selected)
      setDraftRoot('')
      await refreshSidebarData()
    } catch (error) {
      setRootError(formatUiError(error, 'Failed to add root'))
    } finally {
      setRootBusy(false)
    }
  }

  async function handleRemoveRoot(path: string) {
    await removeRoot(path)
    await refreshSidebarData()
  }

  async function handleToggleRoot(root: RootRecord, field: 'enabled' | 'watchEnabled', value: boolean) {
    setRootBusy(true)
    setRootError(null)

    try {
      await updateRoot(
        root.path,
        field === 'enabled' ? value : root.enabled,
        field === 'watchEnabled' ? value : root.watchEnabled,
        root.recursive,
      )
      await refreshSidebarData()
    } catch (error) {
      setRootError(formatUiError(error, 'Failed to update root'))
    } finally {
      setRootBusy(false)
    }
  }

  async function handleRescanRoot(path: string) {
    setRootBusy(true)
    setRootError(null)

    try {
      await rescanRoot(path)
      await refreshSidebarData()
    } catch (error) {
      setRootError(formatUiError(error, 'Failed to rescan root'))
    } finally {
      setRootBusy(false)
    }
  }

  async function handleToggle(key: keyof AppSettings, value: boolean) {
    await updateSetting(key, value)
    setSettings((current) => (current ? { ...current, [key]: value } : current))
  }

  async function handleRebuild() {
    await rebuildIndex()
    const nextStatus = await getStatus()
    setStatus(nextStatus)
    const nextExcludeRules = await getExcludeRules()
    setExcludeRules(nextExcludeRules)
  }

  async function handleAddExcludeRule(pattern: string, ruleType: string, appliesTo: string) {
    await addExcludeRule(pattern, ruleType, appliesTo, true)
    await refreshSidebarData()
  }

  async function handleRemoveExcludeRule(id: number) {
    await removeExcludeRule(id)
    await refreshSidebarData()
  }

  const trimmedQuery = effectiveQuery.trim()
  const hasRoots = roots.length > 0
  const compactButtonClass =
    'rounded-full border border-white/10 px-2.5 py-1 font-["IBM_Plex_Mono"] text-[10px] uppercase tracking-[0.18em] text-slate-300 transition hover:border-white/22 hover:bg-white/[0.05] hover:text-white'
  const showAttentionBanner = Boolean(status && (status.watcherState !== 'healthy' || status.offlineRoots.length > 0))
  const showShortcutWarning = Boolean(status && !status.launcherShortcutEnabled)
  const statusSummary = status
    ? [
        `${status.indexedEntries.toLocaleString()} entries`,
        `reconciled ${formatRelativeStatusTime(status.lastReconcileUnix)}`,
        showAttentionBanner ? 'watcher degraded' : null,
        showShortcutWarning ? 'shortcut unavailable' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <main className="mx-auto flex h-screen w-full items-center justify-center overflow-hidden px-4 py-5 sm:px-5">
      <section
        className={`relative flex h-full max-h-[530px] w-full max-w-[760px] flex-col overflow-hidden rounded-[1.5rem] border p-3 backdrop-blur-xl ${shellClass}`}
      >
        <JokeOverlay theme={syntax.jokeTheme} />
        {isJokeMode ? (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.05),transparent_28%)]" />
        ) : null}
        <div className={`relative flex min-h-0 flex-1 flex-col min-w-0 transition ${activePanel ? 'blur-[1px]' : ''}`}>
          <div className="flex min-h-0 flex-1 flex-col min-w-0">
            <div className={`rounded-[1.35rem] border p-2.5 ${queryShellClass}`}>
              <label className="block text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-['IBM_Plex_Mono'] text-xs uppercase tracking-[0.22em] text-white/55">
                      Query
                    </span>
                    {statusSummary ? (
                      <span className="truncate text-[11px] text-slate-400">
                        {statusSummary}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setActivePanel('roots')} className={compactButtonClass}>
                      Roots
                    </button>
                    <button type="button" onClick={() => setActivePanel('settings')} className={compactButtonClass}>
                      Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSyntaxHelp((current) => !current)}
                      className={`rounded-full border border-white/10 px-2.5 py-1 font-['IBM_Plex_Mono'] text-[10px] uppercase tracking-[0.18em] text-white/65 transition ${helpButtonClass}`}
                    >
                      {showSyntaxHelp ? 'Hide syntax' : 'Syntax'}
                    </button>
                  </div>
                </div>
                <input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Type part of a filename or path..."
                  className={`mt-2 w-full rounded-[0.95rem] border px-4 py-3 text-[1rem] text-white outline-none placeholder:text-slate-500 transition ${inputClass}`}
                />
              </label>

              {syntax.chips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {syntax.chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        chip.negated
                          ? 'border-rose-300/20 bg-rose-300/8 text-rose-100/85'
                          : accentChipClass
                      }`}
                    >
                      {chip.negated ? 'Not ' : ''}
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span>Enter open</span>
                <span>Ctrl+Enter reveal</span>
                <span>Ctrl+C copy path</span>
                <span>{hideOnDismiss ? 'Esc hide' : 'Esc clear'}</span>
                <span>{loading ? 'Searching…' : `${results.length} results`}</span>
              </div>

              {showSyntaxHelp ? (
                <div className="mt-2.5 rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    {syntaxExamples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setQuery(example)}
                        className={`rounded-full border border-white/10 px-3 py-1 font-['IBM_Plex_Mono'] text-[11px] text-slate-200 transition ${helpButtonClass}`}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-6 text-slate-400">
                    Filters are optional. Try <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">ext:pdf</code>,{' '}
                    <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">in:docs</code>,{' '}
                    <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">type:folder</code>,{' '}
                    <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">hidden:false</code>, or aliases like{' '}
                    <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">under:archive</code> and{' '}
                    <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">is:folder</code>.
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    Fun mode is visual-only: try <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">is:joke synthwave</code>,{' '}
                    <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">is:joke matrix</code>, or{' '}
                    <code className="rounded bg-white/8 px-1.5 py-0.5 text-white/80">is:joke confetti report</code>.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-2 min-h-0 min-w-0 flex-1 overflow-hidden">
              {!trimmedQuery ? (
                <PlaceholderResults hasRoots={hasRoots} status={status} />
              ) : loading ? (
                <SearchStateCard
                  eyebrow="Searching"
                  title={`Looking for "${trimmedQuery}"`}
                  body="Ranking name and path matches. The first result should settle almost immediately once the current query finishes."
                  tone="loading"
                  detail={status?.message}
                />
              ) : results.length === 0 ? (
                <SearchStateCard
                  eyebrow="No matches"
                  title={`Nothing matched "${trimmedQuery}"`}
                  body="Try a shorter fragment, remove punctuation, or search for a parent folder name instead of the full filename."
                  tone="empty"
                  detail={hasRoots ? `${status?.indexedEntries?.toLocaleString() ?? '0'} indexed entries searched` : 'Add a root to search anything'}
                />
              ) : (
                <ResultList
                  results={results}
                  query={effectiveQuery}
                  theme={syntax.jokeTheme}
                  onOpen={(path) => void openPath(path)}
                  onReveal={(path) => void revealPath(path)}
                  selectedIndex={selectedIndex}
                  setSelectedIndex={setSelectedIndex}
                />
              )}
            </div>
          </div>
        </div>

        <SlideOverPanel
          title="Indexed roots"
          eyebrow="Management"
          open={activePanel === 'roots'}
          onClose={() => setActivePanel(null)}
        >
          <RootsPanel
            roots={roots}
            draftRoot={draftRoot}
            setDraftRoot={setDraftRoot}
            busy={rootBusy}
            errorMessage={rootError}
            onAddRoot={() => void handleAddRoot()}
            onPickRoot={() => void handlePickRoot()}
            onRemoveRoot={(path) => void handleRemoveRoot(path)}
            onToggleRoot={(root, field, value) => void handleToggleRoot(root, field, value)}
            onRescanRoot={(path) => void handleRescanRoot(path)}
          />
        </SlideOverPanel>

        <SlideOverPanel
          title="Settings"
          eyebrow="Management"
          open={activePanel === 'settings'}
          onClose={() => setActivePanel(null)}
        >
          <SettingsPanel
            settings={settings}
            status={status}
            excludeRules={excludeRules}
            onToggle={(key, value) => void handleToggle(key, value)}
            onRebuild={() => void handleRebuild()}
            onAddExcludeRule={(pattern, ruleType, appliesTo) => void handleAddExcludeRule(pattern, ruleType, appliesTo)}
            onRemoveExcludeRule={(id) => void handleRemoveExcludeRule(id)}
          />
        </SlideOverPanel>
      </section>
    </main>
  )
}
