/**
 * lib/fetch.ts
 *
 * Production-ready fetch wrapper used by the WhatsApp service layer.
 *
 * Features:
 *  - Typed responses
 *  - Request timeout (configurable, default 15 s)
 *  - Automatic retry with exponential backoff for 429 and 5xx
 *  - Distinguishes between transient errors (retry) and permanent ones (throw)
 *  - Never logs Authorization headers or request bodies
 */

import { logger } from '@/lib/logger'
import { WhatsAppRateLimitError, WhatsAppUpstreamError } from '@/types/whatsapp'

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS  = 15_000
const DEFAULT_MAX_RETRIES = 3
/** Statuses we retry on */
const RETRY_STATUSES      = new Set([429, 500, 502, 503, 504])

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FetchOptions extends Omit<RequestInit, 'signal'> {
  /** Milliseconds before the request is aborted. Default: 15 000 */
  timeoutMs?: number
  /** Maximum retry attempts for transient errors. Default: 3 */
  maxRetries?: number
  /** Label used in log lines, e.g. "sendMessage". Never log the URL. */
  label?: string
}

export interface FetchResult<T> {
  data: T
  status: number
  headers: Headers
}

// ─── Backoff helper ───────────────────────────────────────────────────────────

function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) return retryAfterMs
  // Exponential backoff: 500ms, 1s, 2s, 4s …  capped at 10 s
  return Math.min(500 * 2 ** attempt, 10_000)
}

// ─── Core fetcher ─────────────────────────────────────────────────────────────

/**
 * Fetch JSON from a URL with timeout, retry, and structured error handling.
 *
 * @param url     - Full URL to call
 * @param options - Extended fetch options
 * @returns       - Parsed JSON body typed as T
 * @throws WhatsAppRateLimitError | WhatsAppUpstreamError | Error
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult<T>> {
  const {
    timeoutMs  = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    label      = 'fetch',
    ...fetchInit
  } = options

  let attempt = 0

  while (true) {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), timeoutMs)
    const startMs    = Date.now()

    let res: Response

    try {
      res = await fetch(url, { ...fetchInit, signal: controller.signal })
    } catch (err) {
      clearTimeout(timeoutId)
      const durationMs = Date.now() - startMs
      const message    = err instanceof Error ? err.message : String(err)

      // AbortError means we hit the timeout
      if ((err as Error)?.name === 'AbortError') {
        logger.warn(`${label} timed out`, { attempt, durationMs, timeoutMs })
      } else {
        logger.error(`${label} network error`, { message, attempt, durationMs })
      }

      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt))
        attempt++
        continue
      }

      throw new Error(`${label} failed after ${attempt + 1} attempts: ${message}`)
    } finally {
      clearTimeout(timeoutId)
    }

    const durationMs = Date.now() - startMs

    // ── Rate limit — respect Retry-After header ────────────────────────────
    if (res.status === 429) {
      const retryAfterSec = parseInt(res.headers.get('retry-after') ?? '0', 10)
      const retryAfterMs  = retryAfterSec * 1000

      logger.warn(`${label} rate limited`, {
        attempt,
        durationMs,
        retryAfterMs,
      })

      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt, retryAfterMs))
        attempt++
        continue
      }

      throw new WhatsAppRateLimitError(retryAfterMs)
    }

    // ── Transient 5xx — retry ─────────────────────────────────────────────
    if (RETRY_STATUSES.has(res.status) && res.status !== 429) {
      logger.warn(`${label} transient error`, { status: res.status, attempt, durationMs })

      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt))
        attempt++
        continue
      }

      throw new WhatsAppUpstreamError(`HTTP ${res.status}`, res.status)
    }

    // ── Parse body ────────────────────────────────────────────────────────
    let data: T
    try {
      data = (await res.json()) as T
    } catch {
      throw new WhatsAppUpstreamError(`Non-JSON response (${res.status})`, res.status)
    }

    logger.debug(`${label} completed`, { status: res.status, durationMs, attempt })

    return { data, status: res.status, headers: res.headers }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
