import { useEffect, useRef, useState } from 'react'
import { rgba, SWATCHES, type Theme, type ThemeMode } from '../../lib/theme'
import { controlButtonStyle } from './controlStyles'

export function ThemeControls({
  ac,
  setAc,
  t,
  mode,
  setMode,
}: {
  ac: string
  setAc: (hex: string) => void
  t: Theme
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const btn = controlButtonStyle(t)
  const custom = !SWATCHES.some((s) => s.hex.toLowerCase() === ac.toLowerCase())

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <button
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        title="Toggle theme"
        style={{ ...btn, padding: '9px 11px' }}
      >
        {mode === 'dark' ? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </button>

      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button onClick={() => setOpen((o) => !o)} style={btn}>
          <span
            style={{
              width: 15,
              height: 15,
              borderRadius: 5,
              background: ac,
              boxShadow: '0 0 0 3px ' + rgba(ac, 0.22),
            }}
          />
          Accent
          <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '.2s', fontSize: 9 }}>▾</span>
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              padding: 16,
              borderRadius: 14,
              background: t.panel,
              backdropFilter: t.blur,
              WebkitBackdropFilter: t.blur,
              border: '1px solid ' + t.panelBorder,
              boxShadow: t.shadow,
              width: 236,
              fontFamily: "'IBM Plex Mono', monospace",
              zIndex: 40,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: '0.2em',
                color: t.faint,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Accent color
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
              {SWATCHES.map((s) => {
                const on = s.hex.toLowerCase() === ac.toLowerCase()
                return (
                  <button
                    key={s.hex}
                    onClick={() => setAc(s.hex)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '9px 4px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: on ? rgba(s.hex, 0.14) : 'transparent',
                      border: '1px solid ' + (on ? rgba(s.hex, 0.5) : rgba(t.bd, 0.14)),
                    }}
                  >
                    <span style={{ width: 22, height: 22, borderRadius: 7, background: s.hex }} />
                    <span style={{ fontSize: 9.5, color: on ? t.text : t.muted, letterSpacing: '0.04em' }}>
                      {s.name}
                    </span>
                  </button>
                )
              })}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid ' + rgba(t.bd, 0.12),
              }}
            >
              <label style={{ position: 'relative', width: 30, height: 30, flexShrink: 0, cursor: 'pointer' }}>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 8,
                    background: ac,
                    border: '1px solid ' + (custom ? '#ffffff44' : rgba(t.bd, 0.2)),
                  }}
                />
                <input
                  type="color"
                  value={ac}
                  onChange={(e) => setAc(e.target.value)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, letterSpacing: '0.16em', color: t.faint, textTransform: 'uppercase' }}>
                  Custom
                </span>
                <span style={{ fontSize: 12, color: t.text, textTransform: 'uppercase' }}>{ac}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
