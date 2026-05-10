import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput, toPhoneticKey, expandAbbreviations } from '@/lib/geo/normalizer'
import { scoreAgainstList } from '@/lib/geo/fuzzyMatch'
import { ALIAS_MAP } from '@/lib/geo/aliases'
import { CONFIDENCE } from '@/lib/geo/types'
import type { NormalizationResult } from '@/lib/geo/types'

// Simple in-memory rate limiter: userId → { count, resetAt }
const rateLimiter = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimiter.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function sanitize(s: string): string {
  return s.replace(/\0/g, '').slice(0, 500)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const rawInput: string = sanitize(String(body.raw_input ?? ''))
  const gymId: string | undefined = body.gym_id

  if (!rawInput.trim()) {
    return NextResponse.json(buildUnresolved(rawInput))
  }

  const normalized = expandAbbreviations(normalizeInput(rawInput))

  // ── Step 1: Alias lookup ──────────────────────────────────────────────────
  const aliasHit = ALIAS_MAP[normalized]
  if (aliasHit) {
    const { data: locality } = await supabase
      .from('geo_localities')
      .select('id, name, district, state')
      .eq('name_normalized', normalizeInput(aliasHit))
      .eq('is_active', true)
      .single()

    const result: NormalizationResult = {
      raw_input: rawInput,
      normalized_value: aliasHit,
      canonical_locality_id: locality?.id ?? null,
      confidence_score: 1.0,
      matched_by: 'alias',
      geo_hierarchy: {
        state: locality?.state ?? '',
        district: locality?.district ?? '',
        city: aliasHit,
        locality: '',
      },
      suggestions: [{ name: aliasHit, confidence: 1.0, matched_by: 'alias' }],
      requires_review: false,
    }
    void logNormalization(supabase, result, gymId)
    return NextResponse.json(result)
  }

  // ── Step 2: Exact match ───────────────────────────────────────────────────
  const { data: exactMatch } = await supabase
    .from('geo_localities')
    .select('id, name, district, state')
    .eq('name_normalized', normalized)
    .eq('is_active', true)
    .single()

  if (exactMatch) {
    const result: NormalizationResult = {
      raw_input: rawInput,
      normalized_value: exactMatch.name,
      canonical_locality_id: exactMatch.id,
      confidence_score: 1.0,
      matched_by: 'exact',
      geo_hierarchy: {
        state: exactMatch.state,
        district: exactMatch.district,
        city: exactMatch.name,
        locality: '',
      },
      suggestions: [{ name: exactMatch.name, confidence: 1.0, matched_by: 'exact' }],
      requires_review: false,
    }
    void logNormalization(supabase, result, gymId)
    return NextResponse.json(result)
  }

  // ── Step 3: DB alias table lookup ─────────────────────────────────────────
  const { data: dbAlias } = await supabase
    .from('geo_aliases')
    .select('locality_id, geo_localities(id, name, district, state)')
    .eq('alias_normalized', normalized)
    .single()

  if (dbAlias?.geo_localities) {
    const loc = dbAlias.geo_localities as any
    const result: NormalizationResult = {
      raw_input: rawInput,
      normalized_value: loc.name,
      canonical_locality_id: loc.id,
      confidence_score: 1.0,
      matched_by: 'alias',
      geo_hierarchy: {
        state: loc.state,
        district: loc.district,
        city: loc.name,
        locality: '',
      },
      suggestions: [{ name: loc.name, confidence: 1.0, matched_by: 'alias' }],
      requires_review: false,
    }
    void logNormalization(supabase, result, gymId)
    return NextResponse.json(result)
  }

  // ── Step 4: Trigram + fuzzy scoring ──────────────────────────────────────
  const { data: trigramCandidates } = await supabase
    .rpc('search_localities_trigram', { query_text: normalized, result_limit: 10 })

  const candidates = (trigramCandidates ?? []) as Array<{
    id: string; name: string; name_normalized: string; name_phonetic: string; district: string; state: string; trgm_score: number
  }>

  if (candidates.length === 0) {
    const result = buildUnresolved(rawInput)
    void logNormalization(supabase, result, gymId)
    void addToQueue(supabase, result, gymId, [])
    return NextResponse.json(result)
  }

  const scored = scoreAgainstList(normalized, candidates, 5)
  const best = scored[0]
  const second = scored[1]

  if (!best || best.score < 0.40) {
    const result = buildUnresolved(rawInput)
    void logNormalization(supabase, result, gymId)
    void addToQueue(supabase, result, gymId, scored)
    return NextResponse.json(result)
  }

  // Determine matched_by
  const topCandidate = candidates.find(c => c.id === best.id)
  let matchedBy: NormalizationResult['matched_by'] = 'fuzzy'
  if ((topCandidate?.trgm_score ?? 0) > 0.8) matchedBy = 'trigram'
  else if (toPhoneticKey(normalized) === toPhoneticKey(topCandidate?.name_normalized ?? '')) matchedBy = 'phonetic'

  const requiresReview = best.score < CONFIDENCE.UNRESOLVED
  const suggestions = scored.map(s => ({ name: s.name, confidence: s.score, matched_by: s.matched_by }))

  const result: NormalizationResult = {
    raw_input: rawInput,
    normalized_value: best.name,
    canonical_locality_id: best.id,
    confidence_score: best.score,
    matched_by: matchedBy,
    geo_hierarchy: {
      state: topCandidate?.state ?? '',
      district: topCandidate?.district ?? '',
      city: best.name,
      locality: '',
    },
    suggestions,
    requires_review: requiresReview,
  }

  void logNormalization(supabase, result, gymId)
  if (requiresReview) void addToQueue(supabase, result, gymId, scored)

  return NextResponse.json(result)
}

function buildUnresolved(raw: string): NormalizationResult {
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

async function logNormalization(supabase: any, result: NormalizationResult, gymId?: string) {
  try {
    await supabase.from('geo_normalization_log').insert({
      gym_id: gymId ?? null,
      raw_input: result.raw_input,
      normalized_value: result.normalized_value,
      canonical_locality_id: result.canonical_locality_id,
      confidence_score: result.confidence_score,
      matched_by: result.matched_by,
      geo_hierarchy: result.geo_hierarchy,
      requires_review: result.requires_review,
    })
  } catch { /* fire-and-forget */ }
}

async function addToQueue(supabase: any, result: NormalizationResult, gymId: string | undefined, scored: any[]) {
  try {
    await supabase.from('geo_review_queue').insert({
      gym_id: gymId ?? null,
      raw_input: result.raw_input,
      top_suggestion: result.normalized_value !== result.raw_input ? result.normalized_value : null,
      top_confidence: result.confidence_score,
      all_suggestions: scored.slice(0, 5),
      status: 'pending',
    })
  } catch { /* fire-and-forget */ }
}
