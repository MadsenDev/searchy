import { useEffect, useRef, type ReactNode } from 'react'
import { KindIcon } from '../../components/Glyphs'
import { kindFor } from '../../lib/resultKind'
import { rgba, type Theme } from '../../lib/theme'
import type { SearchResult } from '../../lib/types'

function formatWhen(unix: number | null) {
  if (!unix) {
    return '—'
  }

  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unix)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (days < 30) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (days < 365) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function getQueryTokens(query: string) {
  return [...new Set(query.toLowerCase().split(/\s+/).map((token) => token.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  )
}

/** Highlights query-token substrings inside a name using the accent color. */
function highlight(text: string, query: string, accent: string): ReactNode {
  const tokens = getQueryTokens(query)
  if (!tokens.length) {
    return text
  }

  const lower = text.toLowerCase()
  const segments: Array<{ value: string; on: boolean }> = []
  let cursor = 0

  while (cursor < text.length) {
    let matchStart = -1
    let matchLength = 0

    for (const token of tokens) {
      const index = lower.indexOf(token, cursor)
      if (index === -1) {
        continue
      }
      if (matchStart === -1 || index < matchStart) {
        matchStart = index
        matchLength = token.length
      }
    }

    if (matchStart === -1) {
      segments.push({ value: text.slice(cursor), on: false })
      break
    }
    if (matchStart > cursor) {
      segments.push({ value: text.slice(cursor, matchStart), on: false })
    }
    segments.push({ value: text.slice(matchStart, matchStart + matchLength), on: true })
    cursor = matchStart + matchLength
  }

  return segments.map((segment, index) =>
    segment.on ? (
      <span key={index} style={{ color: accent, fontWeight: 700 }}>
        {segment.value}
      </span>
    ) : (
      <span key={index}>{segment.value}</span>
    ),
  )
}

function Row({
  result,
  active,
  accent,
  t,
  query,
  onHover,
  onOpen,
}: {
  result: SearchResult
  active: boolean
  accent: string
  t: Theme
  query: string
  onHover: () => void
  onOpen: () => void
}) {
  const kind = kindFor(result.extension, result.isDir)
  const ext = result.isDir ? 'DIR' : (result.extension || 'FILE').toUpperCase()

  return (
    <div
      className="row-appear"
      onMouseMove={onHover}
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '11px 13px',
        borderRadius: 12,
        cursor: 'pointer',
        background: active ? rgba(accent, t.mode === 'light' ? 0.14 : 0.13) : 'transparent',
        border: '1px solid ' + (active ? rgba(accent, 0.34) : 'transparent'),
        transition: 'background .08s',
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          background: active ? rgba(accent, 0.18) : t.chipBg,
        }}
      >
        <KindIcon kind={kind} color={active ? accent : t.muted} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: 14.5,
            color: t.text,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={result.name}
        >
          {highlight(result.name, query, accent)}
        </span>
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: t.muted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={result.path}
        >
          {result.parentPath}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.08em',
            color: active ? accent : t.faint,
            border: '1px solid ' + (active ? rgba(accent, 0.4) : rgba(t.bd, 0.2)),
            borderRadius: 5,
            padding: '2px 6px',
          }}
        >
          {ext}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: t.faint }}>
          {formatWhen(result.modifiedUnix)}
        </span>
      </div>
      {active && (
        <span
          style={{
            marginLeft: 6,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: accent,
            flexShrink: 0,
          }}
        >
          ↵
        </span>
      )}
    </div>
  )
}

export function ResultList({
  results,
  query,
  t,
  accent,
  onOpen,
  selectedIndex,
  setSelectedIndex,
}: {
  results: SearchResult[]
  query: string
  t: Theme
  accent: string
  onOpen: (path: string) => void
  selectedIndex: number
  setSelectedIndex: (index: number) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)

  // Keep the selected row within the scroll viewport without scrollIntoView.
  useEffect(() => {
    const box = listRef.current
    if (!box) {
      return
    }
    const el = box.children[selectedIndex] as HTMLElement | undefined
    if (!el) {
      return
    }
    const top = el.offsetTop - box.offsetTop
    const bottom = top + el.offsetHeight
    if (top < box.scrollTop) {
      box.scrollTop = top - 6
    } else if (bottom > box.scrollTop + box.clientHeight) {
      box.scrollTop = bottom - box.clientHeight + 6
    }
  }, [selectedIndex])

  return (
    <div ref={listRef} style={{ height: '100%', overflowY: 'auto', padding: '2px 6px 4px' }}>
      {results.map((result, index) => (
        <Row
          key={result.path}
          result={result}
          active={index === selectedIndex}
          accent={accent}
          t={t}
          query={query}
          onHover={() => setSelectedIndex(index)}
          onOpen={() => onOpen(result.path)}
        />
      ))}
    </div>
  )
}
