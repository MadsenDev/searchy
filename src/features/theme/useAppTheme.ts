import { useEffect, useMemo, useState } from 'react'
import { makeTheme, rgba, type Theme, type ThemeMode } from '../../lib/theme'

const ACCENT_KEY = 'searchy.accent'
const THEME_KEY = 'searchy.theme'
const DEFAULT_ACCENT = '#ff8552'

function readAccent() {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_ACCENT
  }
  return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT
}

function readMode(): ThemeMode {
  if (typeof localStorage === 'undefined') {
    return 'dark'
  }
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

/**
 * Manages the launcher accent color and light/dark mode, persists both to
 * localStorage, and mirrors the resolved theme onto CSS custom properties so
 * that surfaces styled with var(--...) (the slide-over panels) adapt too.
 */
export function useAppTheme() {
  const [accent, setAccent] = useState<string>(readAccent)
  const [mode, setMode] = useState<ThemeMode>(readMode)

  const theme = useMemo<Theme>(() => makeTheme(mode), [mode])

  useEffect(() => {
    localStorage.setItem(ACCENT_KEY, accent)
  }, [accent])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, mode)
  }, [mode])

  useEffect(() => {
    const root = document.documentElement
    const set = (name: string, value: string) => root.style.setProperty(name, value)

    set('--accent', accent)
    set('--accent-soft', rgba(accent, mode === 'light' ? 0.16 : 0.18))
    set('--text', theme.text)
    set('--muted', theme.muted)
    set('--faint', theme.faint)
    set('--panel', theme.panel)
    set('--panel-strong', theme.panel)
    set('--line', theme.panelBorder)
    set('--line-soft', theme.lineSoft)
    set('--line-strong', theme.lineStrong)
    set('--shadow', theme.shadow)
    set('--chip-bg', theme.chipBg)
    set('--field-bg', theme.fieldBg)
    root.style.colorScheme = mode
  }, [theme, accent, mode])

  return { theme, mode, setMode, accent, setAccent }
}
