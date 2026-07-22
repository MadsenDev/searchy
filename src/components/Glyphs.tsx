import type { CSSProperties } from 'react'
import type { ResultKind } from '../lib/resultKind'

/** The Searchy mark: rounded gradient tile with the ">" cursor + underscore knockout. */
export function Mark({
  size = 22,
  hi,
  lo,
  knock,
  gid,
}: {
  size?: number
  hi: string
  lo: string
  knock: string
  gid?: string
}) {
  const id = gid || `m${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="80" height="80" rx="23" fill={`url(#${id})`} />
      <polyline
        points="33,35 47,48 33,61"
        fill="none"
        stroke={knock}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="51" y="54" width="16" height="7" rx="3.5" fill={knock} />
    </svg>
  )
}

/** The bare ">" cursor glyph used inline in the search field. */
export function SearchGlyph({ size = 20, color, style }: { size?: number; color: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={{ flexShrink: 0, ...style }}>
      <polyline
        points="33,35 47,48 33,61"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="51" y="54" width="16" height="7" rx="3.5" fill={color} />
    </svg>
  )
}

const KIND_ICON: Record<ResultKind, string> = {
  folder: 'M3 5h5l2 2h7v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  doc: 'M6 2h7l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  text: 'M4 3h12M4 8h12M4 13h8',
  sheet: 'M3 3h14v14H3zM3 8h14M3 13h14M8 3v14',
  img: 'M3 4h14v12H3zM3 13l4-4 3 3 4-5 3 4',
  code: 'M7 5l-4 5 4 5M13 5l4 5-4 5',
}

export function KindIcon({ kind, color }: { kind: ResultKind; color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={KIND_ICON[kind] || KIND_ICON.doc} />
    </svg>
  )
}
