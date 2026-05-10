import { toPhoneticKey } from './normalizer'

/** Levenshtein edit distance */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

/** Dice coefficient using character bigrams — 0 to 1 */
export function diceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const bigrams = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s[i] + s[i + 1]
      map.set(bg, (map.get(bg) ?? 0) + 1)
    }
    return map
  }
  const aMap = bigrams(a)
  const bMap = bigrams(b)
  let intersection = 0
  for (const [bg, count] of aMap)
    intersection += Math.min(count, bMap.get(bg) ?? 0)
  return (2 * intersection) / (a.length - 1 + b.length - 1)
}

/** Longest common subsequence length */
export function lcs(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[m][n]
}

/**
 * Combined similarity score — same weights as existing areas.ts:
 * levScore * 0.25 + diceScore * 0.25 + lcsScore * 0.20 + phoneticScore * 0.30
 */
export function combinedSimilarity(
  input: string,
  candidate: string,
  inputPhonetic?: string,
  candidatePhonetic?: string
): number {
  const maxLen = Math.max(input.length, candidate.length)
  if (maxLen === 0) return 1

  const levScore  = 1 - levenshtein(input, candidate) / maxLen
  const diceScore = diceCoefficient(input, candidate)
  const lcsScore  = (2 * lcs(input, candidate)) / (input.length + candidate.length)

  const pi = inputPhonetic     ?? toPhoneticKey(input)
  const pc = candidatePhonetic ?? toPhoneticKey(candidate)
  const phoneticMaxLen = Math.max(pi.length, pc.length) || 1
  const phoneticScore  = 1 - levenshtein(pi, pc) / phoneticMaxLen

  return (levScore * 0.25) + (diceScore * 0.25) + (lcsScore * 0.20) + (phoneticScore * 0.30)
}

export interface ScoredCandidate {
  id: string
  name: string
  score: number
  matched_by: string
}

/** Score one input against a list of candidates, return top N sorted by score */
export function scoreAgainstList(
  normalizedInput: string,
  candidates: Array<{ id: string; name: string; name_normalized: string; name_phonetic?: string }>,
  topN = 5
): ScoredCandidate[] {
  const inputPhonetic = toPhoneticKey(normalizedInput)

  return candidates
    .map(c => {
      const score = combinedSimilarity(
        normalizedInput,
        c.name_normalized,
        inputPhonetic,
        c.name_phonetic ?? toPhoneticKey(c.name_normalized)
      )
      const matched_by = score >= 0.85 ? 'fuzzy' : 'phonetic'
      return { id: c.id, name: c.name, score, matched_by }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
