import type { AIInferenceResult } from './types'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

const SYSTEM_PROMPT = `You are a regional location intelligence expert specialised in Tamil Nadu and Puducherry, India.

Given a messy locality input from a gym member database, infer the most probable location.

Rules:
- ONLY return locations in Tamil Nadu or Puducherry.
- Understand abbreviations: "pondy" = Puducherry, "cbe" / "kovai" = Coimbatore, "tvm" = Tiruvannamalai or Thiruvananthapuram (prefer TN/Pondy context), "nellai" = Tirunelveli, "pdy" = Puducherry.
- Understand partial addresses: "near bus stand pondy" → Puducherry, "anna nagar cbe" → Coimbatore.
- Understand spelling variants: "villiyanur" → Villianur (Puducherry), "tiruvanmalai" → Tiruvannamalai.
- If the input is ambiguous between a Puducherry locality and a Tamil Nadu city with same name (e.g. "Anna Nagar"), prefer Puducherry when the dataset context is Puducherry.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "probable_location": "<canonical locality or city name>",
  "district": "<district name>",
  "state": "<Tamil Nadu or Puducherry>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence>"
}`

const AI_CACHE = new Map<string, AIInferenceResult>()

export async function geminiInferLocation(
  rawInput: string,
  apiKey: string,
  clusterHint?: { top_district: string; top_state: string }
): Promise<AIInferenceResult | null> {
  if (!apiKey || !rawInput.trim()) return null

  const cacheKey = rawInput.toLowerCase().trim()
  if (AI_CACHE.has(cacheKey)) return AI_CACHE.get(cacheKey)!

  const contextHint = clusterHint?.top_district
    ? `\nContext: This dataset appears to be from ${clusterHint.top_district}, ${clusterHint.top_state}. Prefer nearby locations.`
    : ''

  const prompt = `Input: "${rawInput}"${contextHint}\n\nInfer the location:`

  const MAX_RETRIES = 1 // Instructions say do not retry on timeout
  let lastStatus = 0

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\n' + prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        })
      })

      lastStatus = res.status

      if (!res.ok) {
        console.warn('[GeoAI] Gemini API error:', res.status)
        return null
      }

      const data = await res.json()
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed: AIInferenceResult = JSON.parse(cleaned)

      if (!parsed.probable_location || !parsed.state || typeof parsed.confidence !== 'number') {
        console.warn('[GeoAI] Invalid shape:', parsed)
        return null
      }

      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence))
      AI_CACHE.set(cacheKey, parsed)
      return parsed
    } catch (err) {
      console.warn('[GeoAI] Failed to parse Gemini response:', String(err))
      return null
    }
  }

  return null
}

export async function geminiInferBatch(
  inputs: string[],
  apiKey: string,
  clusterHint?: { top_district: string; top_state: string }
): Promise<Map<string, AIInferenceResult | null>> {
  const resultMap = new Map<string, AIInferenceResult | null>()
  const unique = [...new Set(inputs.map(s => s.toLowerCase().trim()).filter(Boolean))]
  const needsFetch = unique.filter(u => !AI_CACHE.has(u))

  for (const input of needsFetch) {
    const result = await geminiInferLocation(input, apiKey, clusterHint)
    resultMap.set(input, result)
    if (needsFetch.length > 1) await new Promise(r => setTimeout(r, 4500))
  }

  for (const input of inputs) {
    const key = input.toLowerCase().trim()
    if (!resultMap.has(key)) resultMap.set(key, AI_CACHE.get(key) ?? null)
  }

  return resultMap
}
