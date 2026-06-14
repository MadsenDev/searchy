import type { AppSettings, ExcludeRule, RootRecord, SearchResult, StatusSnapshot } from './types'

const fallbackResults: SearchResult[] = [
  {
    path: '/home/chris/Documents/notes/report-2025.pdf',
    parentPath: '/home/chris/Documents/notes',
    name: 'report-2025.pdf',
    extension: 'pdf',
    isDir: false,
    modifiedUnix: 1760000000,
    score: 920,
  },
  {
    path: '/home/chris/Projects/searchy',
    parentPath: '/home/chris/Projects',
    name: 'searchy',
    extension: null,
    isDir: true,
    modifiedUnix: 1760500000,
    score: 840,
  },
]

const fallbackStatus: StatusSnapshot = {
  phase: 'ready',
  message: 'Web preview mode with fallback data',
  indexedEntries: fallbackResults.length,
  indexedRoots: 1,
  lastScanFinishedUnix: Math.floor(Date.now() / 1000),
  lastReconcileUnix: Math.floor(Date.now() / 1000),
  daemonConnected: false,
  daemonState: 'unavailable',
  watcherState: 'unknown',
  watcherErrorCount: 0,
  offlineRoots: [],
  launcherShortcutEnabled: false,
  sessionType: '',
  desktop: '',
  inotifyLimitWarning: false,
}

const fallbackSettings: AppSettings = {
  showHiddenFiles: true,
  maxResults: 50,
  preferExactPrefixMatches: true,
  followSymlinks: false,
  directoriesFirst: true,
  theme: 'midnight',
}

const fallbackRoots: RootRecord[] = [
  {
    id: 1,
    path: '/home/chris/Documents',
    enabled: true,
    watchEnabled: true,
    recursive: true,
    isOffline: false,
    health: 'watching',
    lastScanUnix: Math.floor(Date.now() / 1000),
    lastError: null,
    watcherError: null,
  },
]

async function getInvoke() {
  if (!('window' in globalThis)) {
    return null
  }

  if (!('__TAURI_INTERNALS__' in window)) {
    return null
  }

  const mod = await import('@tauri-apps/api/core')
  return mod.invoke
}

function hasTauriRuntime() {
  return 'window' in globalThis && '__TAURI_INTERNALS__' in window
}

export async function search(query: string, maxResults: number, root?: string | null) {
  const invoke = await getInvoke()
  if (!invoke) {
    const lowered = query.toLowerCase()
    return fallbackResults.filter((entry) => entry.name.toLowerCase().includes(lowered)).slice(0, maxResults)
  }
  return invoke<SearchResult[]>('search', { query, maxResults, root: root ?? null })
}

export async function recordOpen(path: string) {
  const invoke = await getInvoke()
  if (!invoke) return
  return invoke<void>('record_open', { path })
}

export async function getStatus() {
  const invoke = await getInvoke()
  if (!invoke) {
    return fallbackStatus
  }
  return invoke<StatusSnapshot>('get_status')
}

export async function getRoots() {
  const invoke = await getInvoke()
  if (!invoke) {
    return fallbackRoots
  }
  return invoke<RootRecord[]>('get_roots')
}

export async function addRoot(path: string) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('add_root', { path })
}

export async function updateRoot(path: string, enabled: boolean, watchEnabled: boolean, recursive: boolean) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('update_root', { path, enabled, watchEnabled, recursive })
}

export async function rescanRoot(path: string) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('rescan_root', { path })
}

export async function removeRoot(path: string) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('remove_root', { path })
}

export async function rebuildIndex() {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('rebuild_index')
}

export async function getSettings() {
  const invoke = await getInvoke()
  if (!invoke) {
    return fallbackSettings
  }
  return invoke<AppSettings>('get_settings')
}

export async function getExcludeRules() {
  const invoke = await getInvoke()
  if (!invoke) {
    return [] as ExcludeRule[]
  }
  return invoke<ExcludeRule[]>('get_exclude_rules')
}

export async function addExcludeRule(pattern: string, ruleType: string, appliesTo: string, enabled = true) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('add_exclude_rule', { pattern, ruleType, appliesTo, enabled })
}

export async function updateExcludeRule(id: number, pattern: string, ruleType: string, appliesTo: string, enabled: boolean) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('update_exclude_rule', { id, pattern, ruleType, appliesTo, enabled })
}

export async function removeExcludeRule(id: number) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('remove_exclude_rule', { id })
}

export async function updateSetting(key: keyof AppSettings, value: string | number | boolean) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('update_setting', { key, value: String(value) })
}

export async function openPath(path: string) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('open_path', { path })
}

export async function revealPath(path: string) {
  const invoke = await getInvoke()
  if (!invoke) {
    return
  }
  return invoke<void>('reveal_path', { path })
}

export async function hideLauncherWindow() {
  if (!hasTauriRuntime()) {
    return
  }

  const mod = await import('@tauri-apps/api/window')
  return mod.getCurrentWindow().hide()
}

export async function onLauncherShown(callback: () => void) {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  const mod = await import('@tauri-apps/api/event')
  const unlisten = await mod.listen('searchy://launcher-shown', callback)
  return unlisten
}

export async function pickDirectory() {
  if (!hasTauriRuntime()) {
    return null
  }

  const mod = await import('@tauri-apps/plugin-dialog')
  const selection = await mod.open({
    directory: true,
    multiple: false,
    title: 'Choose indexed root',
  })

  if (typeof selection === 'string') {
    return selection
  }

  return null
}
