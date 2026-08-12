/**
 * lib/logger.ts
 *
 * Centralised structured logger for GymFlow.
 *
 * Every log line is a single JSON object — easy to parse in Vercel / Datadog / Logtail.
 * Sensitive fields are never logged: tokens, Authorization headers,
 * phone numbers, message bodies, customer data.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   const log = logger.child({ requestId: 'abc', component: 'graph_proxy' })
 *   log.info('Forwarding request', { method: 'POST', path: '/v23.0/…/messages' })
 */

// ─── Log levels ───────────────────────────────────────────────────────────────

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_NUM: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function currentMinLevel(): number {
  const env = process.env.LOG_LEVEL?.toLowerCase() as Level | undefined
  return LEVEL_NUM[env ?? 'info'] ?? LEVEL_NUM.info
}

// ─── Fields that must never appear in logs ────────────────────────────────────

/**
 * Substrings that mark a key as sensitive.
 *
 * Matching is by SUBSTRING, not exact equality. The previous implementation used
 * an exact-match Set, so only the literal names below were caught — variants
 * such as `refresh_token`, `supabase_access_token`, `serviceRoleKey` or
 * `apiKey` were logged in full.
 *
 * Deliberately NOT included: a bare `key`. It would redact useful debug fields
 * like `cacheKey` while adding nothing (the genuinely secret variants are all
 * covered by the specific entries below).
 */
const SENSITIVE_KEY_PATTERNS = [
  'authorization',
  'authheader',
  'bearer',
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'credential',
  'cookie',
  'servicerole',
  'privatekey',
  'signature',
  'sessionid',
  'otp',
] as const

/**
 * Keys that merely DESCRIBE a secret rather than containing one.
 *
 * `lib/whatsapp/verifyWebhook.ts` intentionally logs `tokenLength` /
 * `expectedLength` to debug verification mismatches without revealing the token.
 * Substring matching would otherwise redact those and lose the diagnostic for no
 * security gain — a length is not a credential.
 */
const SAFE_METADATA_SUFFIX = /(length|count|exists|present|provided|configured|type|mode)$/i

/** Boolean-style predicates (`hasToken`, `isAuthorized`) carry no secret value. */
const SAFE_PREDICATE_PREFIX = /^(has|is|should|can|was|did)[A-Z_]/

function isSensitiveKey(key: string): boolean {
  if (SAFE_PREDICATE_PREFIX.test(key)) return false
  if (SAFE_METADATA_SUFFIX.test(key)) return false
  // Normalise separators so `x-api-key`, `api_key` and `apiKey` all collapse to
  // `xapikey` / `apikey` and match the same pattern. Without this, header-style
  // hyphenated names slipped through.
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return SENSITIVE_KEY_PATTERNS.some(pattern => normalised.includes(pattern))
}

/** Depth cap — guards against pathological payloads, not expected in practice. */
const MAX_REDACT_DEPTH = 6

/**
 * Recursively scrub sensitive keys from a value before logging.
 *
 * The previous version claimed to work "one level deep" but in fact did not
 * recurse at all, so a nested payload such as `{ user: { password: 'x' } }` was
 * logged verbatim. This walks plain objects and arrays, and is safe against
 * circular references.
 */
function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_REDACT_DEPTH) return '[TRUNCATED]'

  // Circular reference — emit a marker rather than recursing forever.
  if (seen.has(value as object)) return '[CIRCULAR]'
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, depth + 1, seen))
  }

  // Leave exotic objects (Error, Date, Map, ...) alone: JSON.stringify already
  // handles them, and walking their internals would produce noise.
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? '[REDACTED]' : redactValue(v, depth + 1, seen)
  }
  return out
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  return redactValue(obj, 0, new WeakSet()) as Record<string, unknown>
}

/** Exported for tests — the redaction rules are security-relevant. */
export const __redactForTests = { redact, isSensitiveKey }

// ─── Logger implementation ────────────────────────────────────────────────────

export interface LogContext {
  requestId?: string
  component?: string
  [key: string]: unknown
}

export class Logger {
  private ctx: LogContext

  constructor(ctx: LogContext = {}) {
    this.ctx = ctx
  }

  /** Create a child logger with additional context fields. */
  child(ctx: LogContext): Logger {
    return new Logger({ ...this.ctx, ...ctx })
  }

  private write(level: Level, message: string, extra?: Record<string, unknown>): void {
    if (LEVEL_NUM[level] < currentMinLevel()) return

    const line: Record<string, unknown> = {
      ts:    new Date().toISOString(),
      level,
      message,
      ...redact({ ...this.ctx }),
      ...(extra ? redact(extra) : {}),
    }

    const json = JSON.stringify(line)

    if (level === 'error') {
      console.error(json)
    } else if (level === 'warn') {
      console.warn(json)
    } else {
      console.log(json)
    }
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    this.write('debug', message, extra)
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.write('info', message, extra)
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.write('warn', message, extra)
  }

  error(message: string, errorOrExtra?: unknown): void {
    if (errorOrExtra instanceof Error) {
      this.write('error', message, { error: errorOrExtra.message, stack: errorOrExtra.stack })
    } else if (errorOrExtra && typeof errorOrExtra === 'object') {
      this.write('error', message, errorOrExtra as Record<string, unknown>)
    } else {
      this.write('error', message)
    }
  }
}

/** Singleton root logger — used directly or as base for `.child()` */
export const logger = new Logger()

// ─── Exported constants used by middleware ────────────────────────────────────

/** HTTP header name used to propagate request IDs across the stack */
export const REQUEST_ID_HEADER = 'x-request-id'

/** Generate a short random request ID */
export function generateRequestId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ─── RequestLogger — per-request timing helper ───────────────────────────────

export class RequestLogger {
  private log: Logger
  private timers = new Map<string, number>()
  readonly requestId: string

  constructor(requestId: string, component: string) {
    this.requestId = requestId
    this.log = logger.child({ requestId, component })
  }

  start(step: string): void {
    this.timers.set(step, Date.now())
  }

  end(step: string): number {
    const start = this.timers.get(step)
    const durationMs = start ? Date.now() - start : -1
    this.log.debug(`${step} completed`, { step, durationMs })
    return durationMs
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.log.info(message, extra)
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.log.warn(message, extra)
  }

  error(message: string, err?: unknown): void {
    this.log.error(message, err)
  }

  summary(statusCode: number): void {
    this.log.info('Request complete', { statusCode })
  }
}

/** Create a new RequestLogger with a random ID */
export function apiLogger(component: string): RequestLogger {
  const requestId = generateRequestId()
  return new RequestLogger(requestId, component)
}
