import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput, toPhoneticKey, expandAbbreviations } from '@/lib/geo/normalizer'
import { scoreAgainstList } from '@/lib/geo/fuzzyMatch'
import { ALIAS_MAP } from '@/lib/geo/aliases'
import { CONFIDENCE } from '@/lib/geo/types'
import type { NormalizationResult } from '@/lib/geo/types'

const BATCH_LIMIT = 50

function sanitize(s: string): string {
  return s.replace(/\0/g, '').slice(0, 500)
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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const inputs: Array<{ raw_input: string; gym_id?: string }> = (body.inputs ?? []).slice(0, BATCH_LIMIT)

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return NextResponse.json([])
  }

  // Fetch all localities + DB aliases once for batch scoring
  const [{ data: allLocalities }, { data: allDbAliases }] = await Promise.all([
    supabase
      .from('geo_localities')
      .select('id, name, name_normalized, name_phonetic, district, state')
      .eq('is_active', true)
      .limit(2000),
    supabase
      .from('geo_aliases')
      .select('alias_normalized, locality_id, geo_localities(id, name, district, state)'),
  ])

  const localities = allLocalities ?? []
  const dbAliasMap = new Map(
    (allDbAliases ?? []).map((a: any) => [a.alias_normalized, a.geo_localities])
  )

  const results: NormalizationResult[] = inputs.map(({ raw_input, gym_id: _gid }) => {
    const rawInput = sanitize(String(raw_input ?? ''))
    if (!rawInput.trim()) return buildUnresolved(rawInput)

    const normalized = expandAbbreviations(normalizeInput(rawInput))

    // 1. In-memory alias check
    const aliasHit = ALIAS_MAP[normalized]
    if (aliasHit) {
      return {
        raw_input: rawInput,
        normalized_value: aliasHit,
        canonical_locality_id: null,
        confidence_score: 1.0,
        matched_by: 'alias' as const,
        geo_hierarchy: { state: '', district: '', city: aliasHit, locality: '' },
        suggestions: [{ name: aliasHit, confidence: 1.0, matched_by: 'alias' }],
        requires_review: false,
      }
    }

    // 2. Exact match
    const exact = localities.find(l => l.name_normalized === normalized)
    if (exact) {
      return {
        raw_input: rawInput,
        normalized_value: exact.name,
        canonical_locality_id: exact.id,
        confidence_score: 1.0,
        matched_by: 'exact' as const,
        geo_hierarchy: { state: exact.state, district: exact.district, city: exact.name, locality: '' },
        suggestions: [{ name: exact.name, confidence: 1.0, matched_by: 'exact' }],
        requires_review: false,
      }
    }

    // 3. DB alias table lookup
    const dbAlias = dbAliasMap.get(normalized) as any
    if (dbAlias) {
      return {
        raw_input: rawInput,
        normalized_value: dbAlias.name,
        canonical_locality_id: dbAlias.id,
        confidence_score: 1.0,
        matched_by: 'alias' as const,
        geo_hierarchy: { state: dbAlias.state ?? '', district: dbAlias.district ?? '', city: dbAlias.name, locality: '' },
        suggestions: [{ name: dbAlias.name, confidence: 1.0, matched_by: 'alias' }],
        requires_review: false,
      }
    }

    // 4. Fuzzy scoring against all localities
    const scored = scoreAgainstList(normalized, localities, 5)
    const best = scored[0]

    if (!best || best.score < 0.40) return buildUnresolved(rawInput)

    const topCandidate = localities.find(l => l.id === best.id)
    let matchedBy: NormalizationResult['matched_by'] = 'fuzzy'
    if (toPhoneticKey(normalized) === toPhoneticKey(topCandidate?.name_normalized ?? '')) matchedBy = 'phonetic'

    const requiresReview = best.score < CONFIDENCE.UNRESOLVED

    return {
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
      suggestions: scored.map(s => ({ name: s.name, confidence: s.score, matched_by: s.matched_by })),
      requires_review: requiresReview,
    }
  })

  // Fire-and-forget: log all + queue unresolved
  void supabase.from('geo_normalization_log').insert(
    results.map((r, i) => ({
      gym_id: inputs[i].gym_id ?? null,
      raw_input: r.raw_input,
      normalized_value: r.normalized_value,
      canonical_locality_id: r.canonical_locality_id,
      confidence_score: r.confidence_score,
      matched_by: r.matched_by,
      geo_hierarchy: r.geo_hierarchy,
      requires_review: r.requires_review,
    }))
  )

  const queueRows = results
    .map((r, i) => ({ r, gymId: inputs[i].gym_id }))
    .filter(({ r }) => r.requires_review)
    .map(({ r, gymId }) => ({
      gym_id: gymId ?? null,
      raw_input: r.raw_input,
      top_suggestion: r.normalized_value !== r.raw_input ? r.normalized_value : null,
      top_confidence: r.confidence_score,
      all_suggestions: r.suggestions.slice(0, 5),
      status: 'pending',
    }))

  if (queueRows.length > 0) void supabase.from('geo_review_queue').insert(queueRows)

  return NextResponse.json(results)
}
