import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput, toPhoneticKey, expandAbbreviations } from '@/lib/geo/normalizer'
import { scoreAgainstList } from '@/lib/geo/fuzzyMatch'
import { ALIAS_MAP } from '@/lib/geo/aliases'
import { CONFIDENCE } from '@/lib/geo/types'
import { detectDatasetCluster, clusterBoost } from '@/lib/geo/clustering'
import { geminiInferBatch } from '@/lib/geo/aiInference'
import type { NormalizationResult, DatasetCluster } from '@/lib/geo/types'

const BATCH_LIMIT = 200

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

function applyWeightedScore(
  base: number,
  candidate: { district?: string; state?: string },
  cluster: DatasetCluster
): number {
  return Math.min(base + clusterBoost(candidate, cluster), 1.0)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const inputs: Array<{ raw_input: string; gym_id?: string }> = (body.inputs ?? []).slice(0, BATCH_LIMIT)

  if (!Array.isArray(inputs) || inputs.length === 0) return NextResponse.json([])

  // Dataset clustering — detect regional bias across the full batch
  const rawValues = inputs.map(i => i.raw_input)
  const cluster = detectDatasetCluster(rawValues)

  // Load localities + DB aliases once
  const [{ data: allLocalities }, { data: allDbAliases }] = await Promise.all([
    supabase.from('geo_localities').select('id, name, name_normalized, name_phonetic, district, state').eq('is_active', true).limit(3000),
    supabase.from('geo_aliases').select('alias_normalized, locality_id, geo_localities(id, name, district, state)'),
  ])

  const localities = allLocalities ?? []
  const dbAliasMap = new Map((allDbAliases ?? []).map((a: any) => [a.alias_normalized, a.geo_localities]))

  // Load gym-specific learned aliases
  const gymId = inputs.find(i => i.gym_id)?.gym_id
  const gymLearnedAliasMap = new Map<string, string>()
  if (gymId) {
    const { data: gymAliases } = await supabase
      .from('geo_gym_aliases').select('alias_normalized, canonical_name').eq('gym_id', gymId)
    for (const row of gymAliases ?? []) gymLearnedAliasMap.set(row.alias_normalized, row.canonical_name)
  }

  // Phase 1: alias → exact → DB alias → fuzzy+cluster
  const phase1Results: (NormalizationResult | null)[] = inputs.map(({ raw_input }) => {
    const rawInput = sanitize(String(raw_input ?? ''))
    if (!rawInput.trim()) return buildUnresolved(rawInput)

    const normalized = expandAbbreviations(normalizeInput(rawInput))

    // Gym-specific learned alias (highest priority)
    const gymAlias = gymLearnedAliasMap.get(normalized)
    if (gymAlias) {
      return {
        raw_input: rawInput, normalized_value: gymAlias, canonical_locality_id: null,
        confidence_score: 1.0, matched_by: 'alias' as const,
        geo_hierarchy: { state: '', district: '', city: gymAlias, locality: '' },
        suggestions: [{ name: gymAlias, confidence: 1.0, matched_by: 'gym_alias' }],
        requires_review: false,
      }
    }

    // Static alias map
    const aliasHit = ALIAS_MAP[normalized]
    if (aliasHit) {
      return {
        raw_input: rawInput, normalized_value: aliasHit, canonical_locality_id: null,
        confidence_score: 1.0, matched_by: 'alias' as const,
        geo_hierarchy: { state: '', district: '', city: aliasHit, locality: '' },
        suggestions: [{ name: aliasHit, confidence: 1.0, matched_by: 'alias' }],
        requires_review: false,
      }
    }

    // Exact match against locality DB
    const exact = localities.find(l => l.name_normalized === normalized)
    if (exact) {
      return {
        raw_input: rawInput, normalized_value: exact.name, canonical_locality_id: exact.id,
        confidence_score: 1.0, matched_by: 'exact' as const,
        geo_hierarchy: { state: exact.state, district: exact.district, city: exact.name, locality: '' },
        suggestions: [{ name: exact.name, confidence: 1.0, matched_by: 'exact' }],
        requires_review: false,
      }
    }

    // DB alias table
    const dbAlias = dbAliasMap.get(normalized) as any
    if (dbAlias) {
      return {
        raw_input: rawInput, normalized_value: dbAlias.name, canonical_locality_id: dbAlias.id,
        confidence_score: 1.0, matched_by: 'alias' as const,
        geo_hierarchy: { state: dbAlias.state ?? '', district: dbAlias.district ?? '', city: dbAlias.name, locality: '' },
        suggestions: [{ name: dbAlias.name, confidence: 1.0, matched_by: 'alias' }],
        requires_review: false,
      }
    }

    // Multi-word / sentence inputs (3+ words) skip fuzzy entirely — send straight to AI
    const wordCount = rawInput.trim().split(/\s+/).length
    if (wordCount >= 3) return null

    // Fuzzy scoring + cluster boost
    const scored = scoreAgainstList(normalized, localities, 5)
    const best = scored[0]

    if (!best || best.score < 0.35) return null // needs AI fallback

    const topCandidate = localities.find(l => l.id === best.id)
    const boostedScore = applyWeightedScore(best.score, topCandidate ?? {}, cluster)

    let matchedBy: NormalizationResult['matched_by'] = 'fuzzy'
    if (toPhoneticKey(normalized) === toPhoneticKey(topCandidate?.name_normalized ?? '')) matchedBy = 'phonetic'

    return {
      raw_input: rawInput,
      normalized_value: best.name,
      canonical_locality_id: best.id,
      confidence_score: parseFloat(boostedScore.toFixed(4)),
      matched_by: matchedBy,
      geo_hierarchy: { state: topCandidate?.state ?? '', district: topCandidate?.district ?? '', city: best.name, locality: '' },
      suggestions: scored.map(s => ({
        name: s.name,
        confidence: parseFloat(applyWeightedScore(s.score, topCandidate ?? {}, cluster).toFixed(4)),
        matched_by: s.matched_by,
      })),
      requires_review: boostedScore < CONFIDENCE.UNRESOLVED,
    }
  })

  // Phase 2: Gemini AI fallback for nulls (score < 0.35)
  const geminiApiKey = process.env.GEMINI_API_KEY ?? ''
  console.log('[DEBUG] Gemini key present:', !!geminiApiKey, 'length:', geminiApiKey.length)
  const needsAI = inputs.map((inp, i) => ({ ...inp, i })).filter(({ i }) => phase1Results[i] === null)
  console.log('[DEBUG] Inputs needing AI:', needsAI.map(n => n.raw_input))
  const finalResults: NormalizationResult[] = [...phase1Results] as NormalizationResult[]

  if (needsAI.length > 0 && geminiApiKey) {
    const aiInputs = needsAI.map(({ raw_input }) => raw_input)
    const aiResults = await geminiInferBatch(aiInputs, geminiApiKey, {
      top_district: cluster.top_district,
      top_state: cluster.top_state,
    })

    // Check Supabase AI cache for any already stored
    const cachedAIKeys = aiInputs.map(r => r.toLowerCase().trim())
    const { data: dbAICache } = await supabase
      .from('geo_ai_cache')
      .select('raw_input_normalized, probable_location, district, state, confidence, reasoning')
      .in('raw_input_normalized', cachedAIKeys)
    const dbCacheMap = new Map((dbAICache ?? []).map((c: any) => [c.raw_input_normalized, c]))

    for (const { raw_input, i } of needsAI) {
      const key = raw_input.toLowerCase().trim()
      const dbCached = dbCacheMap.get(key)
      const aiResult = dbCached
        ? { probable_location: dbCached.probable_location, district: dbCached.district, state: dbCached.state, confidence: dbCached.confidence, reasoning: dbCached.reasoning }
        : aiResults.get(key)

      if (aiResult && aiResult.probable_location && aiResult.confidence >= 0.40) {
        const boostedAI = applyWeightedScore(aiResult.confidence, { district: aiResult.district, state: aiResult.state }, cluster)
        finalResults[i] = {
          raw_input,
          normalized_value: aiResult.probable_location,
          canonical_locality_id: null,
          confidence_score: parseFloat(Math.min(boostedAI, 0.85).toFixed(4)),
          matched_by: 'ai',
          geo_hierarchy: { state: aiResult.state, district: aiResult.district, city: aiResult.probable_location, locality: '' },
          suggestions: [{ name: aiResult.probable_location, confidence: aiResult.confidence, matched_by: 'ai' }],
          requires_review: boostedAI < CONFIDENCE.AUTO_ACCEPT,
          ai_reasoning: aiResult.reasoning,
        }
        // Cache to Supabase permanently (fire-and-forget)
        if (!dbCached) {
          void supabase.from('geo_ai_cache').upsert({
            raw_input_normalized: key,
            raw_input_display: raw_input.trim(),
            probable_location: aiResult.probable_location,
            district: aiResult.district,
            state: aiResult.state,
            confidence: aiResult.confidence,
            reasoning: aiResult.reasoning,
            cluster_district: cluster.top_district,
          }, { onConflict: 'raw_input_normalized' })
        }
      } else {
        finalResults[i] = buildUnresolved(raw_input)
      }
    }
  } else {
    for (const { raw_input, i } of needsAI) finalResults[i] = buildUnresolved(raw_input)
  }

  // Audit log with cluster columns (fire-and-forget)
  void supabase.from('geo_normalization_log').insert(
    finalResults.map((r, i) => ({
      gym_id: inputs[i]?.gym_id ?? null,
      raw_input: r.raw_input,
      normalized_value: r.normalized_value,
      canonical_locality_id: r.canonical_locality_id,
      confidence_score: r.confidence_score,
      matched_by: r.matched_by,
      geo_hierarchy: r.geo_hierarchy,
      requires_review: r.requires_review,
      cluster_district: cluster.top_district || null,
      cluster_confidence: cluster.confidence || null,
    }))
  )

  // Queue unresolved/low-confidence for review — includes matched_by
  const queueRows = finalResults
    .map((r, i) => ({ r, gymId: inputs[i]?.gym_id }))
    .filter(({ r }) => r.requires_review)
    .map(({ r, gymId }) => ({
      gym_id: gymId ?? null,
      raw_input: r.raw_input,
      top_suggestion: r.normalized_value !== r.raw_input ? r.normalized_value : null,
      top_confidence: r.confidence_score,
      all_suggestions: r.suggestions.slice(0, 5),
      status: 'pending',
      matched_by: r.matched_by,
    }))

  if (queueRows.length > 0) void supabase.from('geo_review_queue').insert(queueRows)

  return NextResponse.json(finalResults)
}
