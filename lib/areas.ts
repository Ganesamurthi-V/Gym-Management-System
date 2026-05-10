// @deprecated — use lib/geo/matchArea.ts for new code
// Kept for backward compatibility with manual import page only.

import { SEED_LOCALITIES_DEDUPED } from './geo/seed-data'
import { ALIAS_MAP } from './geo/aliases'

export const AREAS: string[] = SEED_LOCALITIES_DEDUPED.map(l => l.name)

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function phonetic(s: string): string {
  return s
    .replace(/ph/g, 'f').replace(/ck/g, 'k')
    .replace(/([aeiou])\1+/g, '$1').replace(/([^aeiou])\1+/g, '$1')
    .replace(/yan/g, 'an').replace(/iya/g, 'ia')
    .replace(/ea/g, 'e').replace(/ou/g, 'u')
    .replace(/[aeiou]+$/, '')
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function diceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const bigrams = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) map.set(s[i]+s[i+1], (map.get(s[i]+s[i+1]) ?? 0) + 1)
    return map
  }
  const aMap = bigrams(a), bMap = bigrams(b)
  let intersection = 0
  for (const [bg, count] of aMap) intersection += Math.min(count, bMap.get(bg) ?? 0)
  return (2 * intersection) / (a.length - 1 + b.length - 1)
}

function lcs(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  return dp[m][n]
}

function similarity(input: string, candidate: string): number {
  const maxLen = Math.max(input.length, candidate.length)
  if (maxLen === 0) return 1
  const levScore  = 1 - levenshtein(input, candidate) / maxLen
  const diceScore = diceCoefficient(input, candidate)
  const lcsScore  = (2 * lcs(input, candidate)) / (input.length + candidate.length)
  const pi = phonetic(input), pc = phonetic(candidate)
  const phoneticMaxLen = Math.max(pi.length, pc.length) || 1
  const phoneticScore  = 1 - levenshtein(pi, pc) / phoneticMaxLen
  return (levScore * 0.25) + (diceScore * 0.25) + (lcsScore * 0.2) + (phoneticScore * 0.3)
}

/** Sync area match — used by manual import page only */
export function matchAreaLegacy(raw: string): string {
  if (!raw.trim()) return ''
  const n = norm(raw)

  // Alias check first
  if (ALIAS_MAP[n]) return ALIAS_MAP[n]

  // Exact match
  const exact = AREAS.find(a => norm(a) === n)
  if (exact) return exact

  // Substring
  if (n.length >= 4) {
    const contains = AREAS.find(a => norm(a).includes(n))
    if (contains) return contains
    const contained = AREAS.find(a => n.includes(norm(a)) && norm(a).length >= 4)
    if (contained) return contained
  }

  // Fuzzy
  const scored = AREAS.map(area => ({ area, score: similarity(n, norm(area)) })).sort((a, b) => b.score - a.score)
  const top = scored[0], second = scored[1]
  if (top.score >= 0.65) return top.area
  if (top.score >= 0.55 && (top.score - second.score) >= 0.15) return top.area

  return raw.trim()
}
