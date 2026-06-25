import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput, toPhoneticKey, expandAbbreviations } from '@/lib/geo/normalizer'
import { scoreAgainstList } from '@/lib/geo/fuzzyMatch'
import { ALIAS_MAP } from '@/lib/geo/aliases'
import { CONFIDENCE } from '@/lib/geo/types'
import { detectDatasetCluster, clusterBoost } from '@/lib/geo/clustering'
import { groqInferLocation} from '@/lib/geo/aiInference'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { withTimeout } from '@/lib/timeout'
import type { NormalizationResult, DatasetCluster, AIInferenceResult } from '@/lib/geo/types'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import { cacheWrapper } from '@/lib/cache'

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
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' }
      }, { status: 401 })
    }

    const { allowed } = await checkRateLimit(user.id, '/api/geo/batch-normalize', ROUTE_LIMITS.BATCH_NORMALIZE)
    if (!allowed) {
      return NextResponse.json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' }
      }, { status: 429 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' }
      }, { status: 400 })
    }

    const inputs: Array<{ raw_input: string; gym_id?: string }> = (body.inputs ?? []).slice(0, BATCH_LIMIT)
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    // Dataset clustering — detect regional bias across the full batch
    const rawValues = inputs.map(i => i.raw_input)
    const cluster = detectDatasetCluster(rawValues)

    const gymId = inputs.find(i => i.gym_id)?.gym_id

    // Load localities + DB aliases using Redis Cache (Parallelized)
    const [localities, dbAliasMapList, gymLearnedAliasMapList] = await Promise.all([
      cacheWrapper('geo:localities:active', 3600, async () => {
        const { data, error } = await supabase.from('geo_localities').select('id, name, name_normalized, name_phonetic, district, state').eq('is_active', true).limit(3000)
        if (error) throw error
        return data ?? []
      }),
      cacheWrapper('geo:aliases:global', 3600, async () => {
        const { data, error } = await supabase.from('geo_aliases').select('alias_normalized, locality_id, geo_localities(id, name, district, state)')
        if (error) throw error
        return data ?? []
      }),
      gymId ? cacheWrapper(`geo:gym_aliases:${gymId}`, 3600, async () => {
        const { data, error } = await supabase.from('geo_gym_aliases').select('alias_normalized, canonical_name').eq('gym_id', gymId)
        if (error) throw error
        return data ?? []
      }) : Promise.resolve([])
    ])

    const dbAliasMap = new Map((dbAliasMapList).map((a: any) => [a.alias_normalized, a.geo_localities]))
    const gymLearnedAliasMap = new Map((gymLearnedAliasMapList).map((row: any) => [row.alias_normalized, row.canonical_name]))

    // Phase 1: local/DB matches
    const phase1Results: (NormalizationResult | null)[] = inputs.map(({ raw_input }) => {
      const rawInput = sanitize(String(raw_input ?? ''))
      if (!rawInput.trim()) return buildUnresolved(rawInput)

      const normalized = expandAbbreviations(normalizeInput(rawInput))

      // Gym-specific learned alias
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
      const dbAlias = dbAliasMap.get(normalized) as { id: string, name: string, district: string, state: string } | undefined
      if (dbAlias) {
        return {
          raw_input: rawInput, normalized_value: dbAlias.name, canonical_locality_id: dbAlias.id,
          confidence_score: 1.0, matched_by: 'alias' as const,
          geo_hierarchy: { state: dbAlias.state ?? '', district: dbAlias.district ?? '', city: dbAlias.name, locality: '' },
          suggestions: [{ name: dbAlias.name, confidence: 1.0, matched_by: 'alias' }],
          requires_review: false,
        }
      }

      const wordCount = rawInput.trim().split(/\s+/).length
      if (wordCount >= 3) return null

      const scored = scoreAgainstList(normalized, localities, 5)
      const best = scored[0]
      if (!best || best.score < 0.35) return null

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

    // Phase 2: Groq AI fallback (SERIAL with 2s gap — 30 RPM limit)
    const groqApiKey = process.env.GROQ_API_KEY ?? ''
    const needsAI = inputs.map((inp, i) => ({ ...inp, i })).filter(({ i }) => phase1Results[i] === null)
    const finalResults: NormalizationResult[] = [...phase1Results] as NormalizationResult[]

    if (needsAI.length > 0 && groqApiKey) {
      for (let index = 0; index < needsAI.length; index++) {
        const { raw_input, i } = needsAI[index]
        const key = raw_input.toLowerCase().trim()

        // 1. Memory check (already handled by groqInferLocation but we'll be careful here)
        // 2. DB Cache check
        const { data: dbCached } = await supabase
          .from('geo_ai_cache')
          .select('probable_location, district, state, confidence, reasoning')
          .eq('raw_input_normalized', key)
          .single()

        let aiResult: AIInferenceResult | null = null

        if (dbCached) {
          aiResult = {
            probable_location: dbCached.probable_location,
            district: dbCached.district,
            state: dbCached.state,
            confidence: dbCached.confidence,
            reasoning: dbCached.reasoning
          }
        } else {
          // 3. Groq check (only if cache misses)
          if (index > 0) await new Promise(r => setTimeout(r, 2000)) // 2s gap for 30 RPM

          try {
            aiResult = await withTimeout(groqInferLocation(raw_input, groqApiKey, {
              top_district: cluster.top_district,
              top_state: cluster.top_state,
            }), 5000)

            if (aiResult && aiResult.probable_location && typeof aiResult.confidence === 'number') {
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
          } catch {
            console.warn(`[Batch] Groq timeout for ${raw_input}`)
            aiResult = null
          }
        }

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
        } else {
          finalResults[i] = buildUnresolved(raw_input)
        }
      }
    } else {
      for (const { raw_input, i } of needsAI) finalResults[i] = buildUnresolved(raw_input)
    }

    // Fire-and-forget logging
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

    return NextResponse.json({
      success: true,
      data: finalResults,
      meta: { duration_ms: Date.now() - startTime }
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message }
    }, { status: 500 })
  }
}
