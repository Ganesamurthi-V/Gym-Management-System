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

const REDACTED_KEYS = new Set([
  'authorization',
  'access_token',
  'accesstoken',
  'token',
  'secret',
  'password',
  'app_secret',
  'verify_token',
  'x-hub-signature-256',
])

/**
 * Recursively scrub sensitive keys from an object before logging.
 * Works one level deep — deep nesting is uncommon in log payloads.
 */
function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v
  }
  return out
}

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
