export interface NormalizationResult {
  raw_input: string
  normalized_value: string
  canonical_locality_id: string | null
  confidence_score: number
  matched_by: 'exact' | 'alias' | 'trigram' | 'fuzzy' | 'phonetic' | 'ai' | 'unresolved'
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
  ai_reasoning?: string
}

export type MatchedBy = NormalizationResult['matched_by']

export const CONFIDENCE = {
  AUTO_ACCEPT: 0.90,
  SUGGEST: 0.70,
  UNRESOLVED: 0.70,
} as const

export interface DatasetCluster {
  top_state: string
  top_district: string
  confidence: number
  district_votes: Record<string, number>
  state_votes: Record<string, number>
}

export interface AIInferenceResult {
  probable_location: string
  district: string
  state: string
  confidence: number
  reasoning: string
}

export interface ScoreBreakdown {
  exact_match: number
  alias_match: number
  fuzzy_match: number
  phonetic_match: number
  cluster_boost: number
  ai_score: number
  final_score: number
}
