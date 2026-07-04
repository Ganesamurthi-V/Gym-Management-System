import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput, toPhoneticKey, expandAbbreviations } from '@/lib/geo/normalizer'
import { scoreAgainstList } from '@/lib/geo/fuzzyMatch'
import { CONFIDENCE } from '@/lib/geo/types'
import { detectDatasetCluster, clusterBoost } from '@/lib/geo/clustering'
import { groqInferLocation, groqInferBatch } from '@/lib/geo/aiInference'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import type { NormalizationResult, DatasetCluster, AIInferenceResult } from '@/lib/geo/types'
import { mapSupabaseError } from '@/lib/utils/errorMapper'

export const maxDuration = 60 // Vercel Pro: allow up to 60s for batch AI inference

// Issue 10 fix: Lazy-load the 58KB ALIAS_MAP module so it is NOT parsed at Lambda cold-start.
let _aliasMap: Record<string, string> | null = null
async function getAliasMap(): Promise<Record<string, string>> {
  if (!_aliasMap) {
    const mod = await import('@/lib/geo/aliases')
    _aliasMap = mod.ALIAS_MAP
  }
  return _aliasMap
}

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

    // Load localities + DB aliases once (Independent queries parallelized)
    const gymId = inputs.find(i => i.gym_id)?.gym_id
    const [localitiesRes, aliasesRes, gymAliasesRes, ALIAS_MAP] = await Promise.all([
      supabase.from('geo_localities').select('id, name, name_normalized, name_phonetic, district, state').eq('is_active', true).limit(3000),
      supabase.from('geo_aliases').select('alias_normalized, locality_id, geo_localities(id, name, district, state)'),
      gymId ? supabase.from('geo_gym_aliases').select('alias_normalized, canonical_name').eq('gym_id', gymId) : Promise.resolve({ data: null, error: null }),
      getAliasMap(),
    ])

    if (localitiesRes.error) {
      const mapped = mapSupabaseError(localitiesRes.error)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    const localities = localitiesRes.data ?? []
    const dbAliasMap = new Map((aliasesRes.data ?? []).map((a: { alias_normalized: string, geo_localities: unknown }) => [a.alias_normalized, a.geo_localities]))
    const gymLearnedAliasMap = new Map((gymAliasesRes.data ?? []).map((row: { alias_normalized: string, canonical_name: string }) => [row.alias_normalized, row.canonical_name]))

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

    // Phase 2: Groq AI fallback — single batched request for all misses
    const groqApiKey = process.env.GROQ_API_KEY ?? ''
    const needsAI = inputs
      .map((inp, i) => ({ raw_input: inp.raw_input, i }))
      .filter(({ i }) => phase1Results[i] === null)
    const finalResults: NormalizationResult[] = [...phase1Results] as NormalizationResult[]

    if (needsAI.length > 0 && groqApiKey) {
      // Check DB cache for all misses first
      const cacheKeys = needsAI.map(({ raw_input }) => raw_input.toLowerCase().trim())
      const { data: dbCacheRows } = await supabase
        .from('geo_ai_cache')
        .select('raw_input_normalized, probable_location, district, state, confidence, reasoning')
        .in('raw_input_normalized', cacheKeys)

      const dbCacheMap = new Map(
        (dbCacheRows ?? []).map(r => [r.raw_input_normalized, r])
      )

      // Split into: already in DB cache vs truly needs Groq
      const needsGroq: typeof needsAI = []
      for (const item of needsAI) {
        const key = item.raw_input.toLowerCase().trim()
        const cached = dbCacheMap.get(key)
        if (cached) {
          const boosted = applyWeightedScore(
            cached.confidence,
            { district: cached.district, state: cached.state },
            cluster
          )
          finalResults[item.i] = {
            raw_input: item.raw_input,
            normalized_value: cached.probable_location,
            canonical_locality_id: null,
            confidence_score: parseFloat(Math.min(boosted, 0.85).toFixed(4)),
            matched_by: 'ai',
            geo_hierarchy: {
              state: cached.state,
              district: cached.district,
              city: cached.probable_location,
              locality: '',
            },
            suggestions: [{ name: cached.probable_location, confidence: cached.confidence, matched_by: 'ai' }],
            requires_review: boosted < CONFIDENCE.AUTO_ACCEPT,
            ai_reasoning: cached.reasoning,
          }
        } else {
          needsGroq.push(item)
        }
      }

      // Batch all Groq misses in one (chunked) call
      if (needsGroq.length > 0) {
        const groqInputs = needsGroq.map(({ raw_input }) => raw_input)
        const aiResults = await groqInferBatch(groqInputs, groqApiKey, {
          top_district: cluster.top_district,
          top_state: cluster.top_state,
        })

        for (const { raw_input, i } of needsGroq) {
          const key = raw_input.toLowerCase().trim()
          const aiResult = aiResults.get(key) ?? null

          if (aiResult && aiResult.probable_location && aiResult.confidence >= 0.40) {
            const boosted = applyWeightedScore(
              aiResult.confidence,
              { district: aiResult.district, state: aiResult.state },
              cluster
            )
            finalResults[i] = {
              raw_input,
              normalized_value: aiResult.probable_location,
              canonical_locality_id: null,
              confidence_score: parseFloat(Math.min(boosted, 0.85).toFixed(4)),
              matched_by: 'ai',
              geo_hierarchy: {
                state: aiResult.state,
                district: aiResult.district,
                city: aiResult.probable_location,
                locality: '',
              },
              suggestions: [{ name: aiResult.probable_location, confidence: aiResult.confidence, matched_by: 'ai' }],
              requires_review: boosted < CONFIDENCE.AUTO_ACCEPT,
              ai_reasoning: aiResult.reasoning,
            }

            // Persist to DB cache (fire and forget)
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
          } else {
            finalResults[i] = buildUnresolved(raw_input)
          }
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
