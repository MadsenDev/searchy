export type SearchResult = {
  path: string
  parentPath: string
  name: string
  extension: string | null
  isDir: boolean
  modifiedUnix: number | null
  score: number
}

export type RootRecord = {
  id: number
  path: string
  enabled: boolean
  watchEnabled: boolean
  recursive: boolean
  isOffline: boolean
  health: string
  lastScanUnix: number | null
  lastError: string | null
  watcherError: string | null
}

export type StatusSnapshot = {
  phase: 'idle' | 'scanning' | 'ready' | 'error'
  message: string
  indexedEntries: number
  indexedRoots: number
  lastScanFinishedUnix: number | null
  lastReconcileUnix: number | null
  daemonConnected: boolean
  daemonState: string
  watcherState: string
  watcherErrorCount: number
  offlineRoots: string[]
  launcherShortcutEnabled: boolean
  sessionType: string
  desktop: string
  inotifyLimitWarning: boolean
}

export type AppSettings = {
  showHiddenFiles: boolean
  maxResults: number
  preferExactPrefixMatches: boolean
  followSymlinks: boolean
  directoriesFirst: boolean
  theme: string
}

export type ExcludeRule = {
  id: number
  pattern: string
  ruleType: string
  appliesTo: string
  enabled: boolean
}
