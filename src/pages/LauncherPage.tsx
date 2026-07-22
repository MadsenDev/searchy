import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { JokeOverlay } from '../components/JokeOverlay'
import { Mark, SearchGlyph } from '../components/Glyphs'
import { ResultList } from '../features/results/ResultList'
import { RootsPanel } from '../features/roots/RootsPanel'
import { useSearch } from '../features/search/useSearch'
import { SettingsPanel } from '../features/settings/SettingsPanel'
import { ThemeControls } from '../features/theme/ThemeControls'
import { controlButtonStyle } from '../features/theme/controlStyles'
import { useAppTheme } from '../features/theme/useAppTheme'
import { mix, rgba, type Theme } from '../lib/theme'
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
  recordOpen,
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

function Hint({ k, label, t }: { k: string; label: string; t: Theme }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span
        style={{
          minWidth: 20,
          textAlign: 'center',
          padding: '2px 6px',
          borderRadius: 5,
          color: t.keycapText,
          background: t.keycapBg,
          border: '1px solid ' + t.keycapBorder,
          fontSize: 10.5,
        }}
      >
        {k}
      </span>
      <span style={{ color: t.hintLabel }}>{label}</span>
    </span>
  )
}

function EmptyState({
  t,
  hasRoots,
  status,
  loading,
  query,
  noMatches,
}: {
  t: Theme
  hasRoots: boolean
  status: StatusSnapshot | null
  loading: boolean
  query: string
  noMatches: boolean
}) {
  let title: string
  let detail: string

  if (loading) {
    title = `Searching for “${query}”`
    detail = status?.message || 'Ranking name and path matches…'
  } else if (noMatches) {
    title = `Nothing matched “${query}”`
    detail = hasRoots
      ? `${status?.indexedEntries?.toLocaleString() ?? '0'} indexed entries searched`
      : 'Add a root to search anything'
  } else if (!hasRoots) {
    title = 'Add a root to start'
    detail = 'Open Roots and pick a folder for Searchy to index'
  } else {
    title = 'Start typing to search'
    detail = `${status?.indexedEntries?.toLocaleString() ?? '0'} indexed entries ready`
  }

  return (
    <div style={{ padding: '34px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 14.5, color: t.muted }}>{title}</div>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          color: t.faint,
          marginTop: 7,
        }}
      >
        {detail}
      </div>
    </div>
  )
}

function SlideOverPanel({
  t,
  title,
  eyebrow,
  open,
  onClose,
  children,
}: {
  t: Theme
  title: string
  eyebrow: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          background: 'rgba(3,7,14,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          transition: 'opacity .25s',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <aside
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: '34rem',
          padding: 16,
          background: t.panel,
          backdropFilter: t.blur,
          WebkitBackdropFilter: t.blur,
          borderLeft: '1px solid ' + t.panelBorder,
          boxShadow: t.shadow,
          transition: 'transform .3s ease, opacity .3s ease',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.28em',
                color: t.faint,
              }}
            >
              {eyebrow}
            </p>
            <h2 style={{ marginTop: 8, fontSize: 24, fontWeight: 600, letterSpacing: '-0.03em', color: t.text }}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              borderRadius: 999,
              border: '1px solid ' + t.lineStrong,
              padding: '4px 12px',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: t.muted,
              background: 'transparent',
            }}
          >
            Close
          </button>
        </div>
        <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', paddingRight: 4 }}>{children}</div>
      </aside>
    </>
  )
}

export function LauncherPage() {
  const { theme: t, mode, setMode, accent, setAccent } = useAppTheme()

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
  const [scopeRoot, setScopeRoot] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const syntax = parseSearchSyntax(query)
  const effectiveQuery = syntax.cleanQuery
  const enabledRoots = roots.filter((r) => r.enabled)
  const { loading, results } = useSearch(effectiveQuery, settings, scopeRoot)
  const hideOnDismiss = status?.launcherShortcutEnabled ?? false
  const syntaxExamples = getSearchSyntaxExamples()

  const hi = mix(accent, '#ffffff', 0.2)
  const lo = mix(accent, '#000000', 0.1)

  const showAttentionBanner = Boolean(status && (status.watcherState !== 'healthy' || status.offlineRoots.length > 0))
  const statusDotColor = showAttentionBanner ? t.mode === 'light' ? '#e0a03a' : '#ffd166' : accent

  function triggerFlash(name: string) {
    setFlash(name)
    window.setTimeout(() => setFlash((current) => (current === name ? null : current)), 900)
  }

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
      setScopeRoot(null)
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
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (scopeRoot !== null && !enabledRoots.some((r) => r.path === scopeRoot)) {
      setScopeRoot(null)
    }
  }, [roots, scopeRoot, enabledRoots])

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
        triggerFlash(results[selectedIndex].name)
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
        void recordOpen(results[selectedIndex].path)
        triggerFlash(results[selectedIndex].name)
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
        if (showSyntaxHelp) {
          setShowSyntaxHelp(false)
          return
        }
        if (query) {
          setQuery('')
          return
        }
        if (hideOnDismiss) {
          void hideLauncherWindow()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePanel, hideOnDismiss, results, selectedIndex, showSyntaxHelp, query])

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
  const showResults = Boolean(trimmedQuery) && !loading && results.length > 0

  const btnStyle = controlButtonStyle(t)
  const scopeLabel =
    scopeRoot === null ? 'Everything' : scopeRoot.split('/').filter(Boolean).pop() ?? scopeRoot

  function cycleScope() {
    if (scopeRoot === null) {
      setScopeRoot(enabledRoots[0].path)
      return
    }
    const currentIndex = enabledRoots.findIndex((r) => r.path === scopeRoot)
    const nextIndex = currentIndex + 1
    setScopeRoot(nextIndex >= enabledRoots.length ? null : enabledRoots[nextIndex].path)
  }

  const chipStyle: CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: accent,
    background: rgba(accent, 0.12),
    border: '1px solid ' + rgba(accent, 0.3),
    borderRadius: 7,
    padding: '4px 9px',
  }

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {/* accent glow behind the panel */}
      <div
        style={{
          position: 'absolute',
          top: '-24%',
          left: '14%',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: rgba(accent, t.glow[0]),
          filter: 'blur(120px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-28%',
          right: '10%',
          width: 460,
          height: 460,
          borderRadius: '50%',
          background: rgba(accent, t.glow[1]),
          filter: 'blur(130px)',
          pointerEvents: 'none',
        }}
      />

      {/* fixed controls: management + theme + accent */}
      <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <button onClick={() => setShowSyntaxHelp((s) => !s)} style={btnStyle} title="Search syntax">
          Syntax
        </button>
        <button onClick={() => setActivePanel('roots')} style={btnStyle}>
          Roots
        </button>
        <button onClick={() => setActivePanel('settings')} style={btnStyle}>
          Settings
        </button>
        <ThemeControls ac={accent} setAc={setAccent} t={t} mode={mode} setMode={setMode} />
      </div>

      <div style={{ width: '100%', padding: '0 24px', display: 'flex', justifyContent: 'center' }}>
        <section
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 620,
            borderRadius: 20,
            overflow: 'hidden',
            background: t.panel,
            backdropFilter: t.blur,
            WebkitBackdropFilter: t.blur,
            border: '1px solid ' + t.panelBorder,
            boxShadow: t.shadow,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 500,
          }}
        >
          <JokeOverlay theme={syntax.jokeTheme} />

          {/* title bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 16px',
              borderBottom: '1px solid ' + t.lineSoft,
            }}
          >
            <Mark size={19} hi={hi} lo={lo} knock={t.glyphKnock} gid="title" />
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: t.text }}>
              Searchy
              <span style={{ color: accent }}>_</span>
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: t.dotOff }} />
              <span style={{ width: 9, height: 9, borderRadius: 5, background: t.dotOff }} />
              <span
                style={{ width: 9, height: 9, borderRadius: 5, background: statusDotColor }}
                title={showAttentionBanner ? 'Watcher needs attention' : 'Healthy'}
              />
            </div>
          </div>

          {/* search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '19px 20px' }}>
            <SearchGlyph size={20} color={accent} />
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search files by name…"
                style={{
                  width: '100%',
                  fontSize: 22,
                  color: t.text,
                  letterSpacing: '-0.01em',
                  caretColor: accent,
                  fontFamily: 'inherit',
                  border: 'none',
                  outline: 'none',
                  background: 'none',
                }}
              />
              {!query && (
                <span
                  className="blink"
                  style={{ position: 'absolute', left: 0, fontSize: 22, color: accent, pointerEvents: 'none' }}
                >
                  ▏
                </span>
              )}
            </div>
            {enabledRoots.length > 1 && (
              <button
                type="button"
                onClick={cycleScope}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  color: scopeRoot ? accent : t.muted,
                  background: scopeRoot ? rgba(accent, 0.12) : t.chipBg,
                  border: '1px solid ' + (scopeRoot ? rgba(accent, 0.3) : t.lineSoft),
                  borderRadius: 7,
                  padding: '4px 9px',
                  flexShrink: 0,
                  maxWidth: 150,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title="Cycle search scope"
              >
                {scopeLabel}
              </button>
            )}
          </div>

          {/* syntax chips */}
          {syntax.chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 20px 8px' }}>
              {syntax.chips.map((chip) => (
                <span
                  key={chip.key}
                  style={{
                    ...chipStyle,
                    fontSize: 10.5,
                    padding: '3px 8px',
                    ...(chip.negated
                      ? { color: '#ff9db3', background: 'rgba(255,93,143,0.12)', border: '1px solid rgba(255,93,143,0.3)' }
                      : null),
                  }}
                >
                  {chip.negated ? 'Not ' : ''}
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          {/* syntax help */}
          {showSyntaxHelp && (
            <div style={{ padding: '0 20px 10px' }}>
              <div
                style={{
                  borderRadius: 12,
                  border: '1px solid ' + t.lineSoft,
                  background: t.fieldBg,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {syntaxExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setQuery(example)
                        setShowSyntaxHelp(false)
                        inputRef.current?.focus()
                      }}
                      style={{
                        borderRadius: 999,
                        border: '1px solid ' + t.lineSoft,
                        padding: '5px 12px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: t.muted,
                        background: 'transparent',
                      }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
                <p style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6, color: t.faint }}>
                  Filters are optional — try ext:pdf, in:docs, type:folder, or hidden:false. Fun mode is visual only:
                  is:joke synthwave, is:joke matrix, is:joke confetti.
                </p>
              </div>
            </div>
          )}

          {/* inotify warning */}
          {status?.inotifyLimitWarning && (
            <div style={{ padding: '0 20px 8px' }}>
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid rgba(255,209,102,0.25)',
                  background: 'rgba(255,209,102,0.1)',
                  padding: '8px 12px',
                  fontSize: 11,
                  color: t.mode === 'light' ? '#8a6d1f' : '#ffd88a',
                }}
              >
                inotify watch limit approaching — run: sudo sysctl fs.inotify.max_user_watches=524288
              </div>
            </div>
          )}

          {/* results */}
          <div style={{ flex: 1, minHeight: 0, maxHeight: 340, overflow: 'hidden', padding: '0 10px' }}>
            {showResults ? (
              <ResultList
                results={results}
                query={effectiveQuery}
                t={t}
                accent={accent}
                onOpen={(path) => {
                  const target = results.find((r) => r.path === path)
                  if (target) {
                    triggerFlash(target.name)
                  }
                  void recordOpen(path)
                  if (hideOnDismiss) {
                    void hideLauncherWindow().then(() => openPath(path))
                  } else {
                    void openPath(path)
                  }
                }}
                selectedIndex={selectedIndex}
                setSelectedIndex={setSelectedIndex}
              />
            ) : (
              <EmptyState
                t={t}
                hasRoots={hasRoots}
                status={status}
                loading={Boolean(trimmedQuery) && loading}
                query={trimmedQuery}
                noMatches={Boolean(trimmedQuery) && !loading && results.length === 0}
              />
            )}
          </div>

          {/* footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '11px 18px',
              borderTop: '1px solid ' + t.lineSoft,
              background: t.footerBg,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: t.muted,
              flexWrap: 'wrap',
            }}
          >
            <Hint k="↑↓" label="navigate" t={t} />
            <Hint k="↵" label="open" t={t} />
            <Hint k="⌘↵" label="reveal" t={t} />
            <Hint k="esc" label={hideOnDismiss ? 'hide' : 'clear'} t={t} />
            <span style={{ marginLeft: 'auto', color: t.faint }}>
              {flash ? (
                <span style={{ color: accent }}>opening {flash}</span>
              ) : loading && trimmedQuery ? (
                'searching…'
              ) : (
                <>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </>
              )}
            </span>
          </div>

          <SlideOverPanel
            t={t}
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
            t={t}
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
      </div>

      {/* caption */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.28em',
          color: rgba(t.bd, 0.4),
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Searchy · filename-first file search
      </div>
    </div>
  )
}
