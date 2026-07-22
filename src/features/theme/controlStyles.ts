import type { CSSProperties } from 'react'
import type { Theme } from '../../lib/theme'

/** Shared glassy button styling for the top-right control cluster. */
export function controlButtonStyle(t: Theme): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 13px',
    borderRadius: 11,
    cursor: 'pointer',
    background: t.panel,
    backdropFilter: t.blur,
    WebkitBackdropFilter: t.blur,
    border: '1px solid ' + t.panelBorder,
    color: t.muted,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  }
}
