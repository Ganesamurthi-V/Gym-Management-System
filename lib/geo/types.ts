export interface NormalizationResult {
  raw_input: string
  normalized_value: string
  canonical_locality_id: string | null
  confidence_score: number
  matched_by: 'exact' | 'alias' | 'trigram' | 'fuzzy' | 'phonetic' | 'unresolved'
  geo_hierarchy: {
    state: string
    district: string
    city: string
    locality: string
  }
  suggestions: Array<{
    name: string
    confidence: number
    matched_by: string
  }>
  requires_review: boolean
}

export type MatchedBy = NormalizationResult['matched_by']

export const CONFIDENCE = {
  AUTO_ACCEPT: 0.90,
  SUGGEST: 0.70,
  UNRESOLVED: 0.70,
} as const
