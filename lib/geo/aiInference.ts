import type { AIInferenceResult } from './types'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `You are a regional location intelligence expert specialised in Tamil Nadu and Puducherry, India.

Given a messy locality input from a gym member database, infer the most probable location.

Rules:
- ONLY return locations in Tamil Nadu or Puducherry.
- Understand abbreviations: "pondy" / "pdy" / "PDY" / "PØNDY" = Puducherry, "cbe" / "kovai" = Coimbatore, "tvm" = Tiruvannamalai, "nellai" = Tirunelveli.
- Understand partial addresses: "near bus stand pondy" → Puducherry, "anna nagar cbe" → Coimbatore.
- Understand spelling variants: "villiyanur" → Villianur (Puducherry), "tiruvanmalai" → Tiruvannamalai, "vellachery" → Velachery (Chennai).
- Understand locality names: "lawspet" / "lawspet pdy" → Lawspet (Puducherry), "mudaliyarpet" → Mudaliarpet (Puducherry), "saibaba clny" → Saibaba Colony (Coimbatore).
- If the input is ambiguous between a Puducherry locality and a Tamil Nadu city with same name, prefer Puducherry when the dataset context is Puducherry.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "probable_location": "<canonical locality or city name>",
  "district": "<district name>",
  "state": "<Tamil Nadu or Puducherry>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one sentence>"
}`

const BATCH_SYSTEM_PROMPT = `You are a regional location intelligence expert specialised in Tamil Nadu and Puducherry, India.

Given a list of messy locality inputs from a gym member database, infer the most probable location for EACH input.

Rules:
- ONLY return locations in Tamil Nadu or Puducherry.
- Understand abbreviations: "pondy" / "pdy" / "PDY" / "PØNDY" = Puducherry, "cbe" / "kovai" = Coimbatore, "tvm" = Tiruvannamalai, "nellai" = Tirunelveli.
- Understand partial addresses: "near bus stand pondy" → Puducherry, "anna nagar cbe" → Coimbatore.
- Understand spelling variants: "villiyanur" → Villianur (Puducherry), "tiruvanmalai" → Tiruvannamalai, "vellachery" → Velachery (Chennai).
- Understand locality names: "lawspet" / "lawspet pdy" → Lawspet (Puducherry), "mudaliyarpet" → Mudaliarpet (Puducherry), "saibaba clny" → Saibaba Colony (Coimbatore).
- If ambiguous between Puducherry and Tamil Nadu, prefer Puducherry when dataset context is Puducherry.

Respond ONLY with a valid JSON array (one object per input, in the same order), no markdown:
[
  {
    "input": "<original input>",
    "probable_location": "<canonical locality or city name>",
    "district": "<district name>",
    "state": "<Tamil Nadu or Puducherry>",
    "confidence": <0.0 to 1.0>,
    "reasoning": "<one sentence>"
  }
]`

const AI_CACHE = new Map<string, AIInferenceResult>()

async function callGroq(
  prompt: string,
  apiKey: string,
  maxTokens = 1000
): Promise<string | null> {
  const MAX_RETRIES = 3
  let lastStatus = 0

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Longer backoff: 30s, 60s — Gemini free tier resets every minute
      const wait = attempt === 1 ? 2000 : 5000
      console.warn(`[GeoAI] Waiting ${wait}ms before retry ${attempt + 1}...`)
      await new Promise(r => setTimeout(r, wait))
    }

    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content:
                'You are a regional location intelligence expert specialised in Tamil Nadu and Puducherry, India.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      })
      lastStatus = res.status

      if (res.status === 429) {
        console.warn(`[GeoAI] Rate limited (429), attempt ${attempt + 1}/${MAX_RETRIES}`)
        continue
      }

      if (!res.ok) {
        console.warn('[GeoAI] Gorq API error:', res.status)
        return null
      }

      const data = await res.json()
      const text: string = data?.choices?.[0]?.message?.content ?? ''

      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      return cleaned
    } catch (err) {
      console.warn('[GeoAI] Request failed:', String(err))
      return null
    }
  }

  console.warn(`[GeoAI] All ${MAX_RETRIES} attempts failed (last status: ${lastStatus})`)
  return null
}

/** Single input inference — used when only 1 item needs AI */
export async function groqInferLocation(
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

  const prompt = `${SYSTEM_PROMPT}\n\nInput: "${rawInput}"${contextHint}\n\nInfer the location:`
  const text = await callGroq(prompt, apiKey, 200)
  if (!text) return null

  try {
    const parsed: AIInferenceResult = JSON.parse(text)
    if (!parsed.probable_location || !parsed.state || typeof parsed.confidence !== 'number') {
      console.warn('[GeoAI] Invalid shape:', parsed)
      return null
    }
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence))
    AI_CACHE.set(cacheKey, parsed)
    return parsed
  } catch (err) {
    console.warn('[GeoAI] Failed to parse response:', String(err), text)
    return null
  }
}

/**
 * Batch inference — sends ALL inputs in a SINGLE Gemini request.
 * Dramatically reduces API calls and avoids rate limiting.
 */
export async function groqInferBatch(
  inputs: string[],
  apiKey: string,
  clusterHint?: { top_district: string; top_state: string }
): Promise<Map<string, AIInferenceResult | null>> {
  const resultMap = new Map<string, AIInferenceResult | null>()

  if (!apiKey || inputs.length === 0) return resultMap

  const unique = [...new Set(inputs.map(s => s.toLowerCase().trim()).filter(Boolean))]
  const needsFetch = unique.filter(u => !AI_CACHE.has(u))

  // Return cached results for inputs already known
  for (const input of inputs) {
    const key = input.toLowerCase().trim()
    if (AI_CACHE.has(key)) resultMap.set(key, AI_CACHE.get(key)!)
  }

  if (needsFetch.length === 0) return resultMap

  // Single input — use the simpler single-item prompt
  if (needsFetch.length === 1) {
    const result = await groqInferLocation(needsFetch[0], apiKey, clusterHint)
    resultMap.set(needsFetch[0], result)
    return resultMap
  }

  // Multiple inputs — ONE batch request instead of N individual requests
  const contextHint = clusterHint?.top_district
    ? `\nContext: This dataset appears to be from ${clusterHint.top_district}, ${clusterHint.top_state}. Prefer nearby locations.`
    : ''

  const inputList = needsFetch.map((inp, i) => `${i + 1}. "${inp}"`).join('\n')
  const prompt = `${BATCH_SYSTEM_PROMPT}${contextHint}\n\nInputs:\n${inputList}\n\nReturn a JSON array with ${needsFetch.length} objects:`

  // Allow ~150 tokens per input for the response
  const text = await callGroq(prompt, apiKey, needsFetch.length * 150 + 100)

  if (!text) {
    // All failed — mark as null
    for (const input of needsFetch) resultMap.set(input, null)
    return resultMap
  }

  try {
    // Parse the JSON array response
    const parsed: Array<{
      input: string
      probable_location: string
      district: string
      state: string
      confidence: number
      reasoning: string
    }> = JSON.parse(text)

    if (!Array.isArray(parsed)) throw new Error('Response is not an array')

    // Map results back by position (Gemini returns in same order)
    parsed.forEach((item, idx) => {
      const key = needsFetch[idx] ?? item.input?.toLowerCase().trim()
      if (!key) return

      if (!item.probable_location || !item.state || typeof item.confidence !== 'number') {
        resultMap.set(key, null)
        return
      }

      const result: AIInferenceResult = {
        probable_location: item.probable_location,
        district: item.district ?? '',
        state: item.state,
        confidence: Math.max(0, Math.min(1, item.confidence)),
        reasoning: item.reasoning ?? '',
      }

      AI_CACHE.set(key, result)
      resultMap.set(key, result)
    })

    // Fill any missing entries (if Gemini returned fewer items than expected)
    for (const input of needsFetch) {
      if (!resultMap.has(input)) resultMap.set(input, null)
    }
  } catch (err) {
    console.warn('[GeoAI] Failed to parse batch response:', String(err))
    console.warn('[GeoAI] Raw text was:', text.slice(0, 500))
    // Fall back: mark all as null
    for (const input of needsFetch) resultMap.set(input, null)
  }

  return resultMap
}
