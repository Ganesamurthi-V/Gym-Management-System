/**
 * services/location/normalizeGooglePlace.ts
 * ──────────────────────────────────────────
 * Bridges Google Places selection → existing GymFlow normalizer pipeline.
 *
 * IMPORTANT: This does NOT replace the normalizer. It feeds the locality
 * extracted from Google into the existing /api/geo/normalize endpoint,
 * which runs the full 11-step pipeline (alias → exact → trigram → fuzzy → AI).
 */

import type { GoogleAddressComponents } from '@/utils/location/extractGoogleAddress'

export interface NormalizedPlaceResult {
  // From Google (supplementary metadata only)
  google: GoogleAddressComponents
  // From GymFlow normalizer (canonical source of truth)
  canonical_area: string
  canonical_area_id: string | null
  confidence_score: number
  matched_by: string
  requires_review: boolean
}

/**
 * Takes a Google-extracted address and runs it through the existing
 * GymFlow area normalization pipeline.
 *
 * @param google - Structured address from extractGoogleAddress()
 * @param gymId  - Optional gym ID for gym-specific alias lookup
 */
export async function normalizeGooglePlace(
  google: GoogleAddressComponents,
  gymId?: string
): Promise<NormalizedPlaceResult> {
  // Use the most specific locality name available
  const rawInput = google.locality || google.city || google.formattedAddress

  try {
    const res = await fetch('/api/geo/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_input: rawInput,
        gym_id: gymId ?? null,
        // Pass city/state as hints for cluster boost
        hint_city: google.city,
        hint_state: google.state,
      }),
    })

    if (!res.ok) throw new Error('Normalizer API error')

    const json = await res.json()
    const data = json?.data ?? {}

    return {
      google,
      canonical_area:    data.normalized_value  ?? rawInput,
      canonical_area_id: data.canonical_locality_id ?? null,
      confidence_score:  data.confidence_score  ?? 0,
      matched_by:        data.matched_by        ?? 'unresolved',
      requires_review:   data.requires_review   ?? true,
    }
  } catch {
    // Graceful fallback — return Google locality as-is, flag for review
    return {
      google,
      canonical_area:    rawInput,
      canonical_area_id: null,
      confidence_score:  0,
      matched_by:        'google_fallback',
      requires_review:   true,
    }
  }
}
