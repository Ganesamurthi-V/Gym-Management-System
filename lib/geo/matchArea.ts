import type { NormalizationResult } from './types'
import { ALIAS_MAP } from './aliases'
import { normalizeInput } from './normalizer'

function fallback(raw: string): NormalizationResult {
  return {
    raw_input: raw,
    normalized_value: raw.trim(),
    canonical_locality_id: null,
    confidence_score: 0,
    matched_by: 'unresolved',
    geo_hierarchy: { state: '', district: '', city: '', locality: '' },
    suggestions: [],
    requires_review: true,
  }
}

/** Full async normalization — calls POST /api/geo/normalize */
export async function matchArea(raw: string, gymId?: string): Promise<NormalizationResult> {
  if (!raw.trim()) return fallback(raw)

  // Fast client-side alias check before hitting the API
  const n = normalizeInput(raw)
  if (ALIAS_MAP[n]) {
    return {
      raw_input: raw,
      normalized_value: ALIAS_MAP[n],
      canonical_locality_id: null,
      confidence_score: 1.0,
      matched_by: 'alias',
      geo_hierarchy: { state: '', district: '', city: '', locality: '' },
      suggestions: [{ name: ALIAS_MAP[n], confidence: 1.0, matched_by: 'alias' }],
      requires_review: false,
    }
  }

  try {
    const res = await fetch('/api/geo/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_input: raw, gym_id: gymId }),
    })
    if (!res.ok) return fallback(raw)
    // API returns { success: true, data: NormalizationResult, meta: {...} }
    const json = await res.json()
    return json?.data ?? fallback(raw)
  } catch {
    return fallback(raw)
  }
}

/** Batch normalize — calls POST /api/geo/batch-normalize */
export async function matchAreaBatch(
  inputs: Array<{ raw: string; gymId?: string }>
): Promise<NormalizationResult[]> {
  if (inputs.length === 0) return []

  // Client-side alias pre-check
  const results: (NormalizationResult | null)[] = inputs.map(({ raw }) => {
    if (!raw.trim()) return fallback(raw)
    const n = normalizeInput(raw)
    if (ALIAS_MAP[n]) {
      return {
        raw_input: raw,
        normalized_value: ALIAS_MAP[n],
        canonical_locality_id: null,
        confidence_score: 1.0,
        matched_by: 'alias' as const,
        geo_hierarchy: { state: '', district: '', city: '', locality: '' },
        suggestions: [{ name: ALIAS_MAP[n], confidence: 1.0, matched_by: 'alias' }],
        requires_review: false,
      }
    }
    return null
  })

  const needsAPI = inputs
    .map((inp, i) => ({ ...inp, i }))
    .filter((_, i) => results[i] === null)

  if (needsAPI.length === 0) return results as NormalizationResult[]

  try {
    const res = await fetch('/api/geo/batch-normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: needsAPI.map(({ raw, gymId }) => ({ raw_input: raw, gym_id: gymId })),
      }),
    })
    if (!res.ok) {
      needsAPI.forEach(({ i, raw }) => { results[i] = fallback(raw) })
    } else {
      // API returns { success: true, data: NormalizationResult[], meta: {...} }
      const json = await res.json()
      const apiResults: NormalizationResult[] = json?.data ?? []
      needsAPI.forEach(({ i }, idx) => { results[i] = apiResults[idx] ?? fallback(inputs[i].raw) })
    }
  } catch {
    needsAPI.forEach(({ i, raw }) => { results[i] = fallback(raw) })
  }

  return results as NormalizationResult[]
}

/** Lightweight autocomplete search — calls GET /api/geo/search, falls back to client-side seed data */
export async function searchLocalities(
  query: string
): Promise<Array<{ id: string; name: string; district: string; state: string }>> {
  if (query.length < 2) return []

  // Instant alias check
  const n = normalizeInput(query)
  const aliasHit = ALIAS_MAP[n]

  // ── Try the API first ────────────────────────────────────────────────────
  try {
    const params = new URLSearchParams({ q: query, limit: '8' })
    const res = await fetch(`/api/geo/search?${params}`)
    if (res.ok) {
      const json = await res.json()
      const data: Array<{ id: string; name: string; district: string; state: string }> =
        Array.isArray(json) ? json : (json?.data ?? [])

      if (data.length > 0) {
        // Bubble alias match to top
        if (aliasHit) {
          const idx = data.findIndex(d => d.name === aliasHit)
          if (idx > 0) { const [item] = data.splice(idx, 1); data.unshift(item) }
        }
        return data
      }
    }
  } catch { /* fall through to client-side */ }

  // ── Client-side fallback — search seed data directly ────────────────────
  // This ensures suggestions always appear even when the localities table is
  // empty or the API is unavailable.
  const { SEED_LOCALITIES_DEDUPED } = await import('./seed-data')
  const qNorm = normalizeInput(query)
  const qLower = query.toLowerCase()

  const scored = SEED_LOCALITIES_DEDUPED
    .map(loc => {
      const locNorm = loc.name_normalized
      let score = 0
      if (locNorm === qNorm)                          score = 100  // exact
      else if (locNorm.startsWith(qNorm))             score = 90   // prefix
      else if (locNorm.includes(qNorm))               score = 70   // substring
      else if (loc.name.toLowerCase().startsWith(qLower)) score = 85
      else if (loc.name.toLowerCase().includes(qLower))   score = 60
      else if (loc.name_phonetic?.startsWith(normalizeInput(qNorm))) score = 40
      return { loc, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const results = scored.map(({ loc }) => ({
    id:       loc.name_normalized,
    name:     loc.name,
    district: loc.district ?? '',
    state:    loc.state ?? '',
  }))

  // Bubble alias match to top
  if (aliasHit) {
    const idx = results.findIndex(r => r.name === aliasHit)
    if (idx > 0) { const [item] = results.splice(idx, 1); results.unshift(item) }
  }

  return results
}
