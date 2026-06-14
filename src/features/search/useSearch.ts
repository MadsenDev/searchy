import { useEffect, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { search } from '../../lib/tauri'
import type { AppSettings, SearchResult } from '../../lib/types'

export function useSearch(query: string, settings: AppSettings | null, root: string | null = null) {
  const debouncedQuery = useDebouncedValue(query, 60)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!settings) {
      return
    }

    if (!debouncedQuery.trim()) {
      setResults([])
      return
    }

    let cancelled = false
    setLoading(true)

    search(debouncedQuery, settings.maxResults, root)
      .then((next) => {
        if (!cancelled) {
          setResults(next)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, settings, root])

  return { loading, results }
}
