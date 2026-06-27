import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeInput, toPhoneticKey, expandAbbreviations } from '@/lib/geo/normalizer'
import { scoreAgainstList } from '@/lib/geo/fuzzyMatch'
import { CONFIDENCE } from '@/lib/geo/types'
import { groqInferLocation } from '@/lib/geo/aiInference'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { withTimeout } from '@/lib/timeout'
import type { NormalizationResult, AIInferenceResult } from '@/lib/geo/types'
import { mapSupabaseError } from '@/lib/utils/errorMapper'

// Issue 10 fix: Lazy-load the 58KB ALIAS_MAP module so it is NOT parsed at Lambda cold-start.
// The module is evaluated only on the first request to this route, saving 20-80ms on cold starts.
let _aliasMap: Record<string, string> | null = null
async function getAliasMap(): Promise<Record<string, string>> {
  if (!_aliasMap) {
    const mod = await import('@/lib/geo/aliases')
    _aliasMap = mod.ALIAS_MAP
  }
  return _aliasMap
}
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

    const { allowed } = await checkRateLimit(user.id, '/api/geo/normalize', ROUTE_LIMITS.NORMALIZE)
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

    const rawInput: string = sanitize(String(body.raw_input ?? ''))
    const gymId: string | undefined = body.gym_id

    if (!rawInput.trim()) {
      return NextResponse.json({
        success: true,
        data: buildUnresolved(rawInput),
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    const normalized = expandAbbreviations(normalizeInput(rawInput))

    // ── Step 1: Alias lookup ──────────────────────────────────────────────────
    const ALIAS_MAP = await getAliasMap()
    const aliasHit = ALIAS_MAP[normalized]
    if (aliasHit) {
      const { data: locality, error: locError } = await supabase
        .from('geo_localities')
        .select('id, name, district, state')
        .eq('name_normalized', normalizeInput(aliasHit))
        .eq('is_active', true)
        .single()

      if (locError && locError.code !== 'PGRST116') {
        const mapped = mapSupabaseError(locError)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
      }

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
      return NextResponse.json({
        success: true,
        data: result,
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    // ── Step 2: Exact match ───────────────────────────────────────────────────
    const { data: exactMatch, error: exactError } = await supabase
      .from('geo_localities')
      .select('id, name, district, state')
      .eq('name_normalized', normalized)
      .eq('is_active', true)
      .single()

    if (exactError && exactError.code !== 'PGRST116') {
      const mapped = mapSupabaseError(exactError)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

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
      return NextResponse.json({
        success: true,
        data: result,
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    // ── Step 3: DB alias table lookup ─────────────────────────────────────────
    const { data: dbAlias, error: aliasError } = await supabase
      .from('geo_aliases')
      .select('locality_id, geo_localities(id, name, district, state)')
      .eq('alias_normalized', normalized)
      .single()

    if (aliasError && aliasError.code !== 'PGRST116') {
      const mapped = mapSupabaseError(aliasError)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

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
      return NextResponse.json({
        success: true,
        data: result,
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    // ── Step 4: Trigram + fuzzy scoring ──────────────────────────────────────
    const { data: trigramCandidates, error: trigramError } = await supabase
      .rpc('search_localities_trigram', { query_text: normalized, result_limit: 10 })

    if (trigramError) {
      const mapped = mapSupabaseError(trigramError)
      return NextResponse.json({ success: false, error: { code: mapped.code, message: mapped.message } }, { status: mapped.status })
    }

    const candidates = (trigramCandidates ?? []) as Array<{
      id: string; name: string; name_normalized: string; name_phonetic: string; district: string; state: string; trgm_score: number
    }>

    const scored = scoreAgainstList(normalized, candidates, 5)
    const best = scored[0]

    if (best && best.score >= 0.40) {
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

      return NextResponse.json({
        success: true,
        data: result,
        meta: { duration_ms: Date.now() - startTime }
      })
    }

    // ── Step 5: Groq AI Fallback (with 3-layer cache) ────────────────────────
    const cacheKey = rawInput.toLowerCase().trim()
    const groqApiKey = process.env.GROQ_API_KEY ?? ''

    if (groqApiKey) {
      // 1. Memory check (handled by groqInferLocation but we'll try to be explicit here if we could,
      // but groqInferLocation already has AI_CACHE. Let's just call it and it will handle memory)

      // 2. DB cache check
      const { data: dbCached } = await supabase
        .from('geo_ai_cache')
        .select('probable_location, district, state, confidence, reasoning')
        .eq('raw_input_normalized', cacheKey)
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
        // 3. Groq (only if both miss)
        try {
          aiResult = await withTimeout(groqInferLocation(rawInput, groqApiKey), 5000)

          if (aiResult && aiResult.probable_location && typeof aiResult.confidence === 'number') {
            // Write to DB cache immediately
            void supabase.from('geo_ai_cache').upsert({
              raw_input_normalized: cacheKey,
              raw_input_display: rawInput.trim(),
              probable_location: aiResult.probable_location,
              district: aiResult.district,
              state: aiResult.state,
              confidence: aiResult.confidence,
              reasoning: aiResult.reasoning,
            }, { onConflict: 'raw_input_normalized' })
          }
        } catch (e) {
          console.warn('[Normalize] Groq timeout or error:', e)
          aiResult = null
        }
      }

      if (aiResult && aiResult.confidence >= 0.40) {
        const result: NormalizationResult = {
          raw_input: rawInput,
          normalized_value: aiResult.probable_location,
          canonical_locality_id: null,
          confidence_score: aiResult.confidence,
          matched_by: 'ai',
          geo_hierarchy: { state: aiResult.state, district: aiResult.district, city: aiResult.probable_location, locality: '' },
          suggestions: [{ name: aiResult.probable_location, confidence: aiResult.confidence, matched_by: 'ai' }],
          requires_review: aiResult.confidence < CONFIDENCE.AUTO_ACCEPT,
          ai_reasoning: aiResult.reasoning,
        }
        void logNormalization(supabase, result, gymId)
        return NextResponse.json({
          success: true,
          data: result,
          meta: { duration_ms: Date.now() - startTime }
        })
      }
    }

    const unresolved = buildUnresolved(rawInput)
    void logNormalization(supabase, unresolved, gymId)
    void addToQueue(supabase, unresolved, gymId, scored)
    return NextResponse.json({
      success: true,
      data: unresolved,
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

async function logNormalization(supabase: import('@supabase/supabase-js').SupabaseClient, result: NormalizationResult, gymId?: string) {
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

async function addToQueue(supabase: import('@supabase/supabase-js').SupabaseClient, result: NormalizationResult, gymId: string | undefined, scored: Array<{name: string, score: number, matched_by: string}>) {
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
