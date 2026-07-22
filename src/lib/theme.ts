// Theme + accent system ported from the Searchy launcher prototype.

export type ThemeMode = 'dark' | 'light'

export type Theme = {
  mode: ThemeMode
  bd: string
  text: string
  muted: string
  faint: string
  panel: string
  blur: string
  panelBorder: string
  footerBg: string
  shadow: string
  keycapText: string
  keycapBg: string
  keycapBorder: string
  hintLabel: string
  chipBg: string
  fieldBg: string
  lineSoft: string
  lineStrong: string
  dotOff: string
  glow: [number, number]
  glyphKnock: string
}

export type Swatch = {
  name: string
  hex: string
}

const NAVY = '#08111d'

/* ---------- color helpers ---------- */
export function hx(h: string): [number, number, number] {
  let hex = h.replace('#', '')
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

export function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function mix(hex: string, target: string, amt: number): string {
  const a = hx(hex)
  const b = hx(target)
  return toHex(a[0] + (b[0] - a[0]) * amt, a[1] + (b[1] - a[1]) * amt, a[2] + (b[2] - a[2]) * amt)
}

export function rgba(hex: string, a: number): string {
  const c = hx(hex)
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`
}

/* ---------- accent swatches ---------- */
export const SWATCHES: Swatch[] = [
  { name: 'Ember', hex: '#ff8552' },
  { name: 'Azure', hex: '#4c8dff' },
  { name: 'Mint', hex: '#2fd6a6' },
  { name: 'Violet', hex: '#a780ff' },
  { name: 'Rose', hex: '#ff5d8f' },
  { name: 'Amber', hex: '#ffc24b' },
]

/* ---------- themes ---------- */
export function makeTheme(mode: ThemeMode): Theme {
  if (mode === 'light') {
    const bd = '#6f88ab'
    return {
      mode,
      bd,
      text: '#152538',
      muted: '#5a708f',
      faint: '#93a4bf',
      panel: 'rgba(255,255,255,0.78)',
      blur: 'blur(30px) saturate(1.3)',
      panelBorder: rgba(bd, 0.3),
      footerBg: 'rgba(255,255,255,0.5)',
      shadow:
        '0 30px 90px rgba(30,50,80,0.20), 0 0 0 1px rgba(255,255,255,0.4), inset 0 1px 0 rgba(255,255,255,0.7)',
      keycapText: '#3a4d68',
      keycapBg: rgba(bd, 0.13),
      keycapBorder: rgba(bd, 0.24),
      hintLabel: '#6a7f9c',
      chipBg: rgba(bd, 0.11),
      fieldBg: 'rgba(255,255,255,0.55)',
      lineSoft: rgba(bd, 0.14),
      lineStrong: rgba(bd, 0.3),
      dotOff: rgba(bd, 0.28),
      glow: [0.13, 0.08],
      glyphKnock: '#fff',
    }
  }

  const bd = '#8cb2d9'
  return {
    mode,
    bd,
    text: '#eaf2ff',
    muted: '#8ba3c2',
    faint: '#5d7392',
    panel: 'rgba(11,22,38,0.72)',
    blur: 'blur(30px) saturate(1.2)',
    panelBorder: rgba(bd, 0.22),
    footerBg: 'rgba(6,12,22,0.4)',
    shadow:
      '0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
    keycapText: '#cdddf3',
    keycapBg: rgba(bd, 0.1),
    keycapBorder: rgba(bd, 0.16),
    hintLabel: '#6f87a6',
    chipBg: rgba(bd, 0.09),
    fieldBg: 'rgba(6,12,22,0.35)',
    lineSoft: rgba(bd, 0.1),
    lineStrong: rgba(bd, 0.24),
    dotOff: rgba(bd, 0.25),
    glow: [0.16, 0.1],
    glyphKnock: NAVY,
  }
}
