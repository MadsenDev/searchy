export type SearchSyntaxChip = {
  key: string
  label: string
  negated?: boolean
}

export type ParsedSearchSyntax = {
  chips: SearchSyntaxChip[]
  hasAdvancedSyntax: boolean
  cleanQuery: string
  jokeTheme: JokeTheme | null
}

export type JokeTheme = 'confetti' | 'disco' | 'matrix' | 'synthwave'

const SEARCH_SYNTAX_EXAMPLES = [
  'ext:pdf report',
  'in:documents invoice',
  'type:folder rust',
  '"annual report" !draft',
]

const JOKE_THEMES: JokeTheme[] = ['confetti', 'disco', 'matrix', 'synthwave']

export function getSearchSyntaxExamples() {
  return SEARCH_SYNTAX_EXAMPLES
}

export function parseSearchSyntax(query: string): ParsedSearchSyntax {
  const chips: SearchSyntaxChip[] = []
  const keptTokens: string[] = []
  let jokeTheme: JokeTheme | null = null
  const tokens = tokenize(query)

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const negated = token.startsWith('!')
    const body = negated ? token.slice(1) : token
    const [rawKey, rawValue] = body.split(':', 2)
    if (!rawValue) {
      if (jokeTheme && token.toLowerCase() === jokeTheme) {
        continue
      }
      keptTokens.push(token)
      continue
    }

    const key = rawKey.trim().toLowerCase()
    const value = rawValue.trim().replace(/^"+|"+$/g, '')
    if (!value) {
      continue
    }

    const normalizedValue = value.toLowerCase()

    if ((key === 'is' || key === 'type') && normalizedValue === 'joke') {
      const nextToken = tokens[index + 1]?.toLowerCase()
      if (JOKE_THEMES.includes(nextToken as JokeTheme)) {
        jokeTheme = nextToken as JokeTheme
        chips.push({
          key: `joke-${jokeTheme}`,
          label: `Joke ${jokeTheme}`,
        })
        index += 1
      } else {
        chips.push({
          key: 'joke-pending',
          label: 'Joke theme?',
        })
      }
      continue
    }

    const label =
      key === 'ext'
        ? `Ext ${normalizedValue}`
        : key === 'kind'
          ? `Kind ${normalizedValue}`
          : key === 'in' || key === 'under'
            ? `In ${value}`
            : key === 'path'
              ? `Path ${value}`
              : key === 'type' || key === 'is'
                ? `Type ${normalizedValue}`
                : key === 'hidden'
                  ? `Hidden ${normalizedValue}`
                  : key === 'exact'
                    ? `Exact ${normalizedValue}`
                    : null

    if (!label) {
      keptTokens.push(token)
      continue
    }

    chips.push({
      key: `${negated ? 'not-' : ''}${key}-${normalizedValue}`,
      label,
      negated,
    })
  }

  return {
    chips,
    hasAdvancedSyntax: chips.length > 0 || query.includes('"') || query.includes('!'),
    cleanQuery: keptTokens.join(' ').trim(),
    jokeTheme,
  }
}

function tokenize(query: string) {
  const tokens: string[] = []
  let current = ''
  let inQuotes = false

  for (const char of query) {
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }

    if (/\s/.test(char) && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim())
      }
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    tokens.push(current.trim())
  }

  return tokens
}
