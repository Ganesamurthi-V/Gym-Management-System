export const AREAS = [
  'White Town', 'Heritage Town', 'Muthialpet', 'Lawspet', 'Reddiarpalayam',
  'Mudaliarpet', 'Rainbow Nagar', 'Anna Nagar', 'Thattanchavady', 'Venkata Nagar',
  'Saram', 'Boomianpet', 'Karuvadikuppam', 'Kuruchikuppam', 'Vaithikuppam',
  'Dubrayapet', 'Orleanpet', 'Nellithope', 'Gorimedu',
  'Pakkamudayanpet', 'Kuyavarpalayam', 'Periya Mudaliyar Chavadi', 'Mission Street',
  'Kottakuppam', 'Ariyankuppam', 'Veerampattinam', 'Nonankuppam', 'Manavely',
  'Murungapakkam', 'Abishegapakkam', 'Kirumampakkam', 'Pooranankuppam',
  'Pillaiyarkuppam', 'Bahour', 'Kuruvinatham', 'Karikalampakkam', 'Nettapakkam',
  'Madukarai', 'Embalam', 'Korkadu', 'Villianur', 'Odiampet', 'Sedarapet',
  'Thirubuvanai', 'Madagadipet', 'Mannadipet', 'Kalapet', 'Kanagachettikulam',
  'Pillaichavady', 'Kottupalayam', 'Moolakulam', 'Kombakkam', 'Uzhavarkarai',
  'Solai Nagar', 'Shanmuga Nagar', 'Brindavanam', 'Viduthalai Nagar', 'Tagore Nagar',
  'Jeeva Nagar', 'Periyar Nagar', 'Rajaji Nagar', 'Natesan Nagar', 'Ashok Nagar',
  'Kathirkamam', 'Ellaipillaichavady', 'Thengaithittu', 'Chinna Veerampattinam',
  'Auroville', 'ECR', 'East Coast Road',
]

/** Lowercase, strip non-alphanumeric */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Phonetic normalization — collapse common sound-alike patterns
 * so "Villiyanur" and "Villianur" reduce to the same key
 */
function phonetic(s: string): string {
  return s
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/([aeiou])\1+/g, '$1')   // collapse repeated vowels: aa→a, ee→e
    .replace(/([^aeiou])\1+/g, '$1')  // collapse repeated consonants: tt→t, pp→p
    .replace(/yan/g, 'an')            // villiyanur → villianur
    .replace(/iya/g, 'ia')            // ariyankuppam → ariankuppam
    .replace(/ea/g, 'e')
    .replace(/ou/g, 'u')              // bahour → bahur
    .replace(/[aeiou]+$/, '')         // strip trailing vowels
}

/** Levenshtein distance */
function levenshtein(a: string, b: string): number {
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
function diceCoefficient(a: string, b: string): number {
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
function lcs(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[m][n]
}

/**
 * Multi-signal similarity score (0–1).
 * Combines:
 *   - Levenshtein (edit distance)
 *   - Dice coefficient (bigram overlap)
 *   - LCS ratio (common character sequence)
 *   - Phonetic Levenshtein (sound-alike matching)
 */
function similarity(input: string, candidate: string): number {
  const maxLen = Math.max(input.length, candidate.length)
  if (maxLen === 0) return 1

  const levScore   = 1 - levenshtein(input, candidate) / maxLen
  const diceScore  = diceCoefficient(input, candidate)
  const lcsScore   = (2 * lcs(input, candidate)) / (input.length + candidate.length)

  // Phonetic score — compare after collapsing sound-alike patterns
  const pi = phonetic(input)
  const pc = phonetic(candidate)
  const phoneticMaxLen = Math.max(pi.length, pc.length) || 1
  const phoneticScore  = 1 - levenshtein(pi, pc) / phoneticMaxLen

  // Weighted blend: phonetic + dice catch most real-world mistakes
  return (levScore * 0.25) + (diceScore * 0.25) + (lcsScore * 0.2) + (phoneticScore * 0.3)
}

/**
 * Match a raw area string against the known AREAS list.
 *
 * Layers:
 *   1. Exact normalized match
 *   2. Substring match
 *   3. Multi-signal similarity (Levenshtein + Dice + LCS + Phonetic)
 *      — threshold 0.65 for high-confidence single best match
 *      — threshold 0.55 if the top candidate is clearly ahead by 0.15+
 *   4. Raw value as-is
 */
export function matchArea(raw: string): string {
  if (!raw.trim()) return ''
  const n = norm(raw)

  // 1. Exact normalized match
  const exact = AREAS.find(a => norm(a) === n)
  if (exact) return exact

  // 2. Substring match
  if (n.length >= 4) {
    const contains = AREAS.find(a => norm(a).includes(n))
    if (contains) return contains
    const contained = AREAS.find(a => n.includes(norm(a)) && norm(a).length >= 4)
    if (contained) return contained
  }

  // 3. Multi-signal similarity
  const scored = AREAS
    .map(area => ({ area, score: similarity(n, norm(area)) }))
    .sort((a, b) => b.score - a.score)

  const top    = scored[0]
  const second = scored[1]

  // High confidence
  if (top.score >= 0.65) return top.area

  // Lower confidence but clearly the best candidate
  if (top.score >= 0.55 && (top.score - second.score) >= 0.15) return top.area

  // 4. No confident match
  return raw.trim()
}
