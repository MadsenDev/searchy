import { useEffect, useState, type ReactNode } from 'react'
import type { JokeTheme } from '../../lib/searchSyntax'
import type { SearchResult } from '../../lib/types'

const MAX_VISIBLE_RESULTS = 4

function formatTimestamp(unix: number | null) {
  if (!unix) {
    return 'Unknown'
  }

  return new Date(unix * 1000).toLocaleDateString()
}

function getKindLabel(result: SearchResult) {
  if (result.isDir) {
    return 'Folder'
  }

  return result.extension ? result.extension.toUpperCase() : 'File'
}

function getGlyph(result: SearchResult) {
  if (result.isDir) {
    return '[]'
  }

  switch (result.extension) {
    case 'rs':
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return '</>'
    case 'md':
    case 'txt':
      return 'Tx'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'svg':
      return 'Im'
    case 'zip':
    case 'gz':
    case 'tar':
      return 'Ar'
    case 'pdf':
      return 'PD'
    default:
      return 'Fi'
  }
}

function getQueryTokens(query: string) {
  return [...new Set(query.toLowerCase().split(/\s+/).map((token) => token.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  )
}

function renderHighlightedText(text: string, query: string, highlightClassName: string): ReactNode {
  const tokens = getQueryTokens(query)
  if (!tokens.length) {
    return text
  }

  const lowerText = text.toLowerCase()
  const segments: Array<{ value: string; highlighted: boolean }> = []
  let cursor = 0

  while (cursor < text.length) {
    let matchStart = -1
    let matchedToken = ''

    for (const token of tokens) {
      const tokenIndex = lowerText.indexOf(token, cursor)
      if (tokenIndex === -1) {
        continue
      }

      if (matchStart === -1 || tokenIndex < matchStart) {
        matchStart = tokenIndex
        matchedToken = token
      }
    }

    if (matchStart === -1) {
      segments.push({ value: text.slice(cursor), highlighted: false })
      break
    }

    if (matchStart > cursor) {
      segments.push({ value: text.slice(cursor, matchStart), highlighted: false })
    }

    segments.push({
      value: text.slice(matchStart, matchStart + matchedToken.length),
      highlighted: true,
    })
    cursor = matchStart + matchedToken.length
  }

  return segments.map((segment, index) =>
    segment.highlighted ? (
      <mark key={`${segment.value}-${index}`} className={highlightClassName}>
        {segment.value}
      </mark>
    ) : (
      <span key={`${segment.value}-${index}`}>{segment.value}</span>
    ),
  )
}

function getMatchReason(result: SearchResult, query: string) {
  const normalized = query.trim().toLowerCase()
  const tokens = getQueryTokens(query)
  const lowerName = result.name.toLowerCase()
  const lowerPath = result.path.toLowerCase()

  if (!normalized) {
    return null
  }

  if (lowerName === normalized) {
    return 'Exact name'
  }

  if (lowerName.startsWith(normalized)) {
    return 'Prefix match'
  }

  if (tokens.length > 1 && tokens.every((token) => lowerName.includes(token))) {
    return 'Name tokens'
  }

  if (lowerName.includes(normalized)) {
    return 'Name match'
  }

  if (tokens.every((token) => lowerPath.includes(token))) {
    return 'Path match'
  }

  return 'Related'
}

export function ResultList({
  results,
  query,
  theme,
  onOpen,
  onReveal,
  selectedIndex,
  setSelectedIndex,
}: {
  results: SearchResult[]
  query: string
  theme: JokeTheme | null
  onOpen: (path: string) => void
  onReveal: (path: string) => void
  selectedIndex: number
  setSelectedIndex: (index: number) => void
}) {
  if (!results.length) {
    return (
      <div className="rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-4 text-sm text-slate-300">
        No matches. Try a shorter filename fragment or add another indexed root.
      </div>
    )
  }

  const [visibleStart, setVisibleStart] = useState(0)
  const maxStart = Math.max(0, results.length - MAX_VISIBLE_RESULTS)

  useEffect(() => {
    setVisibleStart((current) => {
      const clampedCurrent = Math.min(current, maxStart)

      if (selectedIndex < clampedCurrent) {
        return selectedIndex
      }

      if (selectedIndex >= clampedCurrent + MAX_VISIBLE_RESULTS) {
        return Math.min(selectedIndex - MAX_VISIBLE_RESULTS + 1, maxStart)
      }

      return clampedCurrent
    })
  }, [maxStart, results.length, selectedIndex])

  const visibleResults = results.slice(visibleStart, visibleStart + MAX_VISIBLE_RESULTS)

  return (
    <div className="grid min-w-0 gap-1.5">
      {visibleResults.map((result, visibleIndex) => {
        const index = visibleStart + visibleIndex
        const isSelected = index === selectedIndex
        const kindLabel = getKindLabel(result)
        const glyph = getGlyph(result)
        const matchReason = getMatchReason(result, query)
        const selectedCardClass =
          theme === 'confetti'
            ? 'border-amber-300/45 bg-[linear-gradient(135deg,rgba(255,209,102,0.24),rgba(244,114,182,0.1),rgba(255,255,255,0.03))] shadow-[0_22px_70px_rgba(251,191,36,0.14)]'
            : theme === 'disco'
              ? 'border-fuchsia-300/45 bg-[linear-gradient(135deg,rgba(255,0,110,0.2),rgba(125,211,252,0.1),rgba(255,255,255,0.03))] shadow-[0_24px_72px_rgba(255,0,110,0.14)]'
              : theme === 'matrix'
                ? 'border-emerald-300/38 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(3,7,18,0.3),rgba(255,255,255,0.02))] shadow-[0_22px_72px_rgba(16,185,129,0.12)]'
                : theme === 'synthwave'
                  ? 'border-cyan-300/42 bg-[linear-gradient(135deg,rgba(236,72,153,0.18),rgba(56,189,248,0.12),rgba(255,255,255,0.03))] shadow-[0_24px_72px_rgba(56,189,248,0.14)]'
                  : 'border-orange-300/45 bg-[linear-gradient(135deg,rgba(255,133,82,0.18),rgba(255,255,255,0.03))] shadow-[0_20px_60px_rgba(255,133,82,0.14)]'
        const glyphSelectedClass =
          theme === 'confetti'
            ? 'border-amber-200/35 bg-amber-300/16 text-amber-50'
            : theme === 'disco'
              ? 'border-fuchsia-200/35 bg-fuchsia-300/16 text-fuchsia-50'
              : theme === 'matrix'
                ? 'border-emerald-200/35 bg-emerald-300/14 text-emerald-50'
                : theme === 'synthwave'
                  ? 'border-cyan-200/35 bg-cyan-300/14 text-cyan-50'
                  : 'border-orange-200/35 bg-orange-300/14 text-orange-50'
        const nameHighlightClass =
          theme === 'confetti'
            ? 'rounded-[0.35rem] bg-amber-300/24 px-1 py-0.5 text-amber-50'
            : theme === 'disco'
              ? 'rounded-[0.35rem] bg-fuchsia-300/22 px-1 py-0.5 text-fuchsia-50'
              : theme === 'matrix'
                ? 'rounded-[0.35rem] bg-emerald-300/20 px-1 py-0.5 text-emerald-50'
                : theme === 'synthwave'
                  ? 'rounded-[0.35rem] bg-cyan-300/20 px-1 py-0.5 text-cyan-50'
                  : 'rounded-[0.35rem] bg-orange-300/22 px-1 py-0.5 text-orange-50'
        const pathHighlightClass =
          theme === 'matrix'
            ? 'rounded-[0.3rem] bg-emerald-400/12 px-1 py-0.5 text-emerald-50'
            : theme === 'synthwave'
              ? 'rounded-[0.3rem] bg-fuchsia-300/14 px-1 py-0.5 text-cyan-50'
              : 'rounded-[0.3rem] bg-white/10 px-1 py-0.5 text-white'
        const matchBadgeClass =
          theme === 'confetti'
            ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
            : theme === 'disco'
              ? 'border-fuchsia-300/18 bg-fuchsia-300/10 text-fuchsia-100'
              : theme === 'matrix'
                ? 'border-emerald-300/18 bg-emerald-300/10 text-emerald-100'
                : theme === 'synthwave'
                  ? 'border-cyan-300/18 bg-cyan-300/10 text-cyan-100'
                  : 'border-white/8 bg-white/[0.03] text-slate-300'
        const revealButtonClass =
          theme === 'confetti'
            ? 'hover:border-amber-200/34 hover:bg-amber-300/10'
            : theme === 'disco'
              ? 'hover:border-fuchsia-200/34 hover:bg-fuchsia-300/10'
              : theme === 'matrix'
                ? 'hover:border-emerald-200/30 hover:bg-emerald-300/10'
                : theme === 'synthwave'
                  ? 'hover:border-cyan-200/30 hover:bg-cyan-300/10'
                  : 'hover:border-orange-200/30 hover:bg-orange-300/10'
        const footerClass =
          theme === 'confetti'
            ? 'text-amber-100/85'
            : theme === 'disco'
              ? 'text-fuchsia-100/85'
              : theme === 'matrix'
                ? 'text-emerald-100/85'
                : theme === 'synthwave'
                  ? 'text-cyan-100/85'
                  : 'text-orange-100/85'
        return (
          <button
            key={result.path}
            type="button"
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => onOpen(result.path)}
            className={`group min-w-0 overflow-hidden rounded-[1.2rem] border px-3 py-2.5 text-left transition ${
              isSelected
                ? selectedCardClass
                : 'border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] hover:border-white/18 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))]'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] border font-['IBM_Plex_Mono'] text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  isSelected
                    ? glyphSelectedClass
                    : 'border-white/10 bg-slate-950/45 text-slate-200'
                }`}
              >
                {glyph}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="min-w-0 truncate text-[0.95rem] font-semibold tracking-[-0.02em] text-white" title={result.name}>
                        {renderHighlightedText(result.name, query, nameHighlightClass)}
                      </span>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-['IBM_Plex_Mono'] text-[9px] uppercase tracking-[0.15em] text-white/60">
                        {kindLabel}
                      </span>
                      {matchReason ? (
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${matchBadgeClass}`}>
                          {matchReason}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] leading-5 text-slate-300/88" title={result.path}>
                      {renderHighlightedText(result.parentPath, query, pathHighlightClass)}
                      <span className="text-white/35">/</span>
                      <span className="text-white/60">{result.name}</span>
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-['IBM_Plex_Mono'] text-[9px] uppercase tracking-[0.2em] text-white/36">
                      {index + 1}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{formatTimestamp(result.modifiedUnix)}</div>
                  </div>
                </div>

                <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-white/42">
                  <span className={`truncate transition ${isSelected ? footerClass : 'group-hover:text-white/65'}`}>
                    {index === 0 ? 'Top match' : `Result ${index + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onReveal(result.path)
                    }}
                    className={`shrink-0 rounded-full border border-white/12 px-2.5 py-0.5 text-[10px] text-slate-100 transition ${revealButtonClass}`}
                  >
                    Reveal
                  </button>
                </div>
              </div>
            </div>
          </button>
        )
      })}

    </div>
  )
}
