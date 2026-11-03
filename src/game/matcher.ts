// Shared free-text answer matcher. Forgiving about case, accents, punctuation,
// leading articles and small typos; strict about numbers. The host can always
// override its verdict.

const LEADING_ARTICLES = new Set(['the', 'a', 'an', 'en', 'ett'])

/** Lowercases, folds accents (å→a, é→e), drops punctuation and a leading article. */
export function normalizeAnswer(text: string): string {
  const words = text
    .toLocaleLowerCase('sv')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (words.length > 1 && LEADING_ARTICLES.has(words[0])) words.shift()
  return words.join(' ')
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

/** How many typos to forgive for an accepted answer. Numbers and short words must be exact. */
function typoTolerance(target: string): number {
  if (/\d/.test(target)) return 0
  const length = target.length
  if (length <= 3) return 0
  if (length <= 6) return 1
  if (length <= 12) return 2
  if (length <= 24) return 3
  // Whole proverbs: about one slip per eight letters.
  return Math.floor(length / 8)
}

export interface MatchResult {
  correct: boolean
  /** The accepted alias that matched, if any. */
  matched: string | null
}

export function matchAnswer(input: string, accepted: readonly string[]): MatchResult {
  const given = normalizeAnswer(input).replaceAll(' ', '')
  if (!given) return { correct: false, matched: null }
  for (const alias of accepted) {
    const target = normalizeAnswer(alias).replaceAll(' ', '')
    if (target && editDistance(given, target) <= typoTolerance(target)) return { correct: true, matched: alias }
  }
  return { correct: false, matched: null }
}
