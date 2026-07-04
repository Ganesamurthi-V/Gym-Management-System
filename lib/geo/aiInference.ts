/**
 * GeoAI — Groq qwen/qwen3.6-27b inference pipeline
 *
 * Architecture
 * ────────────
 *   1. In-memory cache  (process lifetime, instant)
 *   2. Groq API         (3-8 s per call due to Qwen3 think block)
 *
 * Rate-limit facts for qwen/qwen3.6-27b on Groq free tier
 * ─────────────────────────────────────────────────────────
 *   30 RPM  |  14,400 RPD  |  131,072 ctx window
 *   Token budget is effectively unlimited for our small JSON responses.
 *   The only hard constraint is 30 RPM.
 *
 * Qwen3.6-27b thinking mode
 * ──────────────────────────
 *   The model always emits a <think>…</think> block before the answer.
 *   We cannot disable it on Groq (no enable_thinking param).
 *   Strategy: allow it and set max_tokens high enough to finish, then strip.
 *   Observed think block size: 400–700 tokens (~1,500–2,500 chars).
 *   JSON output:               80–150 tokens  (~300–600 chars).
 *   Safe max_tokens:           2,048 for single / 4,096 for batch.
 *
 * Batch chunking
 * ───────────────
 *   We send at most BATCH_CHUNK_SIZE items per Groq request.
 *   Think overhead scales with items, so we keep chunks small (5 items).
 *   Between chunks we respect a REQUEST_GAP_MS delay to stay under 30 RPM.
 *
 * Retry / back-off
 * ─────────────────
 *   429 → wait RATE_LIMIT_WAIT_MS (65 s) then retry once.
 *   5xx → wait 2 s, then 4 s.
 *   All other errors → fail immediately (no retry).
 */

import type { AIInferenceResult } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

const GROQ_API_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL          = 'qwen/qwen3.6-27b'

/** Max Groq requests per minute (free tier hard cap) */
const GROQ_RPM_LIMIT = 30

/**
 * Minimum gap between consecutive Groq requests.
 * 60 000 ms / 30 RPM = 2 000 ms.
 * We use 2 100 ms to stay safely under — Vercel clocks aren't perfect.
 */
const REQUEST_GAP_MS = Math.ceil(60_000 / GROQ_RPM_LIMIT) + 100 // 2 100 ms

/** How long to wait after a 429 before retrying */
const RATE_LIMIT_WAIT_MS = 65_000 // slightly over 1 minute

/** Items per single Groq batch call — keep small so think block stays bounded */
const BATCH_CHUNK_SIZE = 5

/** max_tokens for a single-item call (think ≈ 700 + JSON ≈ 150) */
const SINGLE_MAX_TOKENS = 2_048

/** max_tokens for a batch chunk (think ≈ 700 × N + JSON ≈ 150 × N) */
const BATCH_MAX_TOKENS = 4_096

// ─── Prompts ──────────────────────────────────────────────────────────────────

const BASE_RULES = `Rules:
- ONLY return locations in Tamil Nadu or Puducherry.
- Abbreviations: pondy/pdy/PDY = Puducherry, cbe/kovai = Coimbatore, tvm = Tiruvannamalai, nellai = Tirunelveli, mdm = Madurai, chn/mas = Chennai.
- Partial addresses: "near bus stand pondy" → Puducherry, "anna nagar cbe" → Coimbatore.
- Spelling variants: villiyanur → Villianur (Puducherry), tiruvanmalai → Tiruvannamalai, vellachery → Velachery (Chennai).
- Locality names: lawspet/lawspet pdy → Lawspet (Puducherry), mudaliyarpet → Mudaliarpet (Puducherry), saibaba clny → Saibaba Colony (Coimbatore).
- Ambiguous names: prefer Puducherry when dataset context is Puducherry.`

const SINGLE_SYSTEM = `You are a regional location intelligence expert for Tamil Nadu and Puducherry, India.

${BASE_RULES}

Respond ONLY with valid JSON — no markdown, no explanation, no text outside the JSON object:
{
  "probable_location": "<canonical locality or city name>",
  "district": "<district name>",
  "state": "<Tamil Nadu or Puducherry>",
  "confidence": <0.0–1.0>,
  "reasoning": "<one sentence>"
}`

const BATCH_SYSTEM = `You are a regional location intelligence expert for Tamil Nadu and Puducherry, India.

${BASE_RULES}

You will receive a numbered list of messy locality inputs.
Respond ONLY with a valid JSON array — one object per input, same order, no markdown, no text outside the array:
[
  {
    "index": <number matching input>,
    "probable_location": "<canonical locality or city name>",
    "district": "<district name>",
    "state": "<Tamil Nadu or Puducherry>",
    "confidence": <0.0–1.0>,
    "reasoning": "<one sentence>"
  }
]`

// ─── In-memory cache ──────────────────────────────────────────────────────────

const AI_CACHE = new Map<string, AIInferenceResult>()

// ─── Rate-limit token bucket ──────────────────────────────────────────────────
// Tracks the timestamp of the last Groq request so we can enforce REQUEST_GAP_MS
// between all calls regardless of which function triggers them.

let _lastRequestAt = 0

async function throttle(): Promise<void> {
  const now   = Date.now()
  const since = now - _lastRequestAt
  if (since < REQUEST_GAP_MS) {
    await sleep(REQUEST_GAP_MS - since)
  }
  _lastRequestAt = Date.now()
}

// ─── Core Groq caller ─────────────────────────────────────────────────────────

/**
 * Make a single chat-completion request to Groq.
 * Handles 429 back-off and transient 5xx retries.
 * Returns the stripped text content, or null on failure.
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string | null> {
  const MAX_ATTEMPTS = 3

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Enforce gap between requests on every attempt
    await throttle()

    let res: Response
    try {
      res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ''}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.1,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      // Network error / abort
      console.error(`[GeoAI] Network error (attempt ${attempt + 1}):`, String(err))
      return null
    }

    // 429 — rate limited: wait a full minute then retry
    if (res.status === 429) {
      console.error(`[GeoAI] 429 rate-limited (attempt ${attempt + 1}). Waiting ${RATE_LIMIT_WAIT_MS / 1000}s…`)
      await sleep(RATE_LIMIT_WAIT_MS)
      _lastRequestAt = 0 // reset so throttle doesn't add extra gap
      continue
    }

    // 5xx — transient server error: short back-off
    if (res.status >= 500) {
      const wait = attempt === 0 ? 2_000 : 4_000
      console.error(`[GeoAI] ${res.status} server error (attempt ${attempt + 1}). Waiting ${wait}ms…`)
      await sleep(wait)
      continue
    }

    // 4xx (other than 429) — bad request, no retry
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[GeoAI] ${res.status} error:`, body.slice(0, 300))
      return null
    }

    const data = await res.json()
    const raw: string = data?.choices?.[0]?.message?.content ?? ''

    // Strip <think>…</think> — works for both complete and truncated blocks
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/g, '') // complete block
      .replace(/<think>[\s\S]*/g,           '') // truncated block (max_tokens cut-off)
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    if (!cleaned) {
      console.error('[GeoAI] Empty response after stripping think block.')
      return null
    }

    return cleaned
  }

  console.error(`[GeoAI] All ${MAX_ATTEMPTS} attempts exhausted.`)
  return null
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Infer location for a single raw input string.
 * Checks in-memory cache first; calls Groq only on a miss.
 */
export async function groqInferLocation(
  rawInput: string,
  apiKey: string,
  clusterHint?: { top_district: string; top_state: string },
): Promise<AIInferenceResult | null> {
  if (!apiKey || !rawInput.trim()) return null

  const cacheKey = rawInput.toLowerCase().trim()
  if (AI_CACHE.has(cacheKey)) return AI_CACHE.get(cacheKey)!

  const contextLine = clusterHint?.top_district
    ? `\nDataset context: ${clusterHint.top_district}, ${clusterHint.top_state}. Prefer nearby locations.`
    : ''

  const userPrompt =
    `Input: "${rawInput}"${contextLine}\n\nRespond with JSON only.`

  const text = await callGroq(SINGLE_SYSTEM, userPrompt, SINGLE_MAX_TOKENS)
  if (!text) return null

  try {
    const parsed = JSON.parse(text) as AIInferenceResult
    if (!parsed.probable_location || !parsed.state || typeof parsed.confidence !== 'number') {
      console.error('[GeoAI] Unexpected JSON shape:', text.slice(0, 200))
      return null
    }
    parsed.confidence = clamp(parsed.confidence)
    AI_CACHE.set(cacheKey, parsed)
    return parsed
  } catch {
    console.error('[GeoAI] JSON parse failed. Raw text:', text.slice(0, 300))
    return null
  }
}

/**
 * Infer locations for multiple raw inputs in as few Groq calls as possible.
 *
 * Strategy:
 *   - Deduplicate inputs and serve cache hits immediately.
 *   - For remaining items, split into chunks of BATCH_CHUNK_SIZE.
 *   - Send each chunk as one Groq request (one think block per chunk).
 *   - Enforce REQUEST_GAP_MS between chunks via throttle().
 *
 * Returns a Map<normalised_key, AIInferenceResult | null>.
 */
export async function groqInferBatch(
  inputs: string[],
  apiKey: string,
  clusterHint?: { top_district: string; top_state: string },
): Promise<Map<string, AIInferenceResult | null>> {
  const resultMap = new Map<string, AIInferenceResult | null>()

  if (!apiKey || inputs.length === 0) return resultMap

  // Deduplicate
  const unique = [...new Set(inputs.map(s => s.toLowerCase().trim()).filter(Boolean))]

  // Serve cache hits and collect misses
  const needsFetch: string[] = []
  for (const key of unique) {
    if (AI_CACHE.has(key)) {
      resultMap.set(key, AI_CACHE.get(key)!)
    } else {
      needsFetch.push(key)
    }
  }

  if (needsFetch.length === 0) return resultMap

  // Fast path: single item → use simpler single prompt
  if (needsFetch.length === 1) {
    const result = await groqInferLocation(needsFetch[0], apiKey, clusterHint)
    resultMap.set(needsFetch[0], result)
    return resultMap
  }

  // Chunk processing
  const contextLine = clusterHint?.top_district
    ? `\nDataset context: ${clusterHint.top_district}, ${clusterHint.top_state}. Prefer nearby locations.`
    : ''

  const chunks = chunkArray(needsFetch, BATCH_CHUNK_SIZE)

  for (const chunk of chunks) {
    const itemList = chunk.map((inp, i) => `${i + 1}. "${inp}"`).join('\n')
    const userPrompt =
      `${contextLine ? contextLine + '\n\n' : ''}Inputs:\n${itemList}\n\nReturn a JSON array with ${chunk.length} objects.`

    const text = await callGroq(BATCH_SYSTEM, userPrompt, BATCH_MAX_TOKENS)

    if (!text) {
      for (const key of chunk) resultMap.set(key, null)
      continue
    }

    try {
      const parsed: Array<{
        index?: number
        probable_location: string
        district: string
        state: string
        confidence: number
        reasoning: string
      }> = JSON.parse(text)

      if (!Array.isArray(parsed)) throw new Error('Response is not an array')

      parsed.forEach((item, pos) => {
        // Support both index-keyed and position-keyed responses
        const chunkIdx = typeof item.index === 'number' ? item.index - 1 : pos
        const key = chunk[chunkIdx] ?? chunk[pos]
        if (!key) return

        if (!item.probable_location || !item.state || typeof item.confidence !== 'number') {
          resultMap.set(key, null)
          return
        }

        const result: AIInferenceResult = {
          probable_location: item.probable_location,
          district:          item.district  ?? '',
          state:             item.state,
          confidence:        clamp(item.confidence),
          reasoning:         item.reasoning ?? '',
        }
        AI_CACHE.set(key, result)
        resultMap.set(key, result)
      })

      // Fill any items the model skipped
      for (const key of chunk) {
        if (!resultMap.has(key)) resultMap.set(key, null)
      }
    } catch {
      console.error('[GeoAI] Batch parse failed. Raw:', text.slice(0, 400))
      for (const key of chunk) resultMap.set(key, null)
    }
  }

  return resultMap
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
