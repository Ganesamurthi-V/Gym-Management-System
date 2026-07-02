/**
 * Structured observability for GymFlow — logs, metrics, and traces.
 *
 * Every server-side request (Server Components, Route Handlers, Server Actions)
 * should create one RequestLogger at entry, call .summary() before returning,
 * and call .error() instead of throwing bare errors.
 *
 * Log format:  JSON lines  →  searchable in Vercel Log Drain / any aggregator
 * Trace format: Sentry spans via captureException / setTag("request_id", ...)
 *
 * Usage:
 *   const log = new RequestLogger('MEMBERS_PAGE', req)   // Route Handler
 *   const log = new RequestLogger('DASHBOARD_PAGE')       // Server Component
 *   log.start('DB_QUERY')
 *   const data = await fetchSomething()
 *   log.end('DB_QUERY')
 *   log.summary()          // always emit at end — even on happy path
 */

// No Node.js-only imports — this file is imported by middleware (Edge runtime).
// crypto.randomUUID() and TextEncoder are Web Crypto globals available everywhere.
import * as Sentry from '@sentry/nextjs'
import { type NextRequest } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface TimingEntry {
  name: string
  durationMs: number
}

interface SummaryLog {
  requestId: string
  context: string
  method?: string
  path?: string
  statusCode?: number
  userId?: string
  gymId?: string
  cacheHit: boolean | null
  timings: TimingEntry[]
  authMs: number
  dbMs: number
  redisMs: number
  totalMs: number
  payloadKb: number
  level: 'INFO' | 'WARN'
  timestamp: string
}

interface ErrorLog {
  requestId: string
  context: string
  level: 'ERROR'
  message: string
  errorName?: string
  stack?: string
  method?: string
  path?: string
  userId?: string
  gymId?: string
  timestamp: string
}

// ─── Request ID propagation ────────────────────────────────────────────────────

/**
 * Header name used to carry the request ID between middleware → route handler
 * → any downstream fetch calls.
 */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Generate a new short request ID using the Web Crypto API.
 * Uses randomUUID() which is available in Edge, Node.js, and browsers —
 * then strips the dashes and takes 12 chars to keep it compact.
 */
export function generateRequestId(): string {
  // crypto.randomUUID() is available in Edge runtime, Node.js 14.17+, and browsers.
  // No import needed — it's a global in all Next.js runtimes.
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/**
 * Extract the request ID from an incoming request's headers, or generate a
 * new one if it's absent (e.g., direct API calls without middleware).
 */
export function getOrCreateRequestId(req?: NextRequest | Request): string {
  if (req) {
    const existing = req.headers.get(REQUEST_ID_HEADER)
    if (existing) return existing
  }
  return generateRequestId()
}

// ─── Core Logger ──────────────────────────────────────────────────────────────

export class RequestLogger {
  readonly requestId: string
  private readonly context: string
  private readonly startedAt: number

  private timingStarts: Record<string, number> = {}
  private timings: TimingEntry[] = []

  // Metadata that callers can set at any point
  public method?: string
  public path?: string
  public statusCode?: number
  public userId?: string
  public gymId?: string
  public cacheHit: boolean | null = null
  public payloadBytes: number = 0

  constructor(context: string, req?: NextRequest | Request) {
    this.context = context.toUpperCase()
    this.requestId = getOrCreateRequestId(req)
    this.startedAt = performance.now()

    if (req && 'method' in req) {
      this.method = req.method
      try {
        this.path = new URL(req.url).pathname
      } catch {
        this.path = req.url
      }
    }

    // Emit a structured entry log so we can see requests that never finish
    this._emit('DEBUG', `→ ${this.context} START`)
  }

  // ── Timing API ──────────────────────────────────────────────────────────────

  /** Mark the beginning of a measured operation. */
  start(stepName: string): void {
    this.timingStarts[stepName] = performance.now()
  }

  /** Mark the end of a measured operation and record duration. */
  end(stepName: string): void {
    const t = this.timingStarts[stepName]
    if (t === undefined) return
    this.timings.push({ name: stepName, durationMs: Math.round(performance.now() - t) })
    delete this.timingStarts[stepName]
  }

  /** Record a one-shot annotation without a duration (e.g. "CACHE HIT"). */
  step(message: string): void {
    if (message === 'CACHE HIT') this.cacheHit = true
    else if (message === 'CACHE MISS') this.cacheHit = false
    this._emit('DEBUG', message)
  }

  // ── Payload helper ──────────────────────────────────────────────────────────

  /** Measure the serialized size of the response payload for metrics. */
  setPayload(data: unknown): void {
    try {
      // TextEncoder is a Web API available in Edge, Node.js, and browsers.
      this.payloadBytes = new TextEncoder().encode(JSON.stringify(data)).length
    } catch {
      // ignore non-serializable values
    }
  }

  // ── Summary (emit at end of every request) ──────────────────────────────────

  /**
   * Emit the final structured summary log line.
   * Call this once, right before returning from the route handler / page.
   */
  summary(statusCode?: number): void {
    if (statusCode !== undefined) this.statusCode = statusCode

    const totalMs = Math.round(performance.now() - this.startedAt)

    const authMs = this._sumTimings(['AUTH', 'AUTH_USER', 'GET_USER', 'GET_SESSION'])
    const dbMs = this._sumTimings(['FETCHFN', 'DB_QUERY', 'DB', ...this.timings.filter(t =>
      t.name.startsWith('QUERY') || t.name.startsWith('RPC') || t.name.startsWith('SELECT') || t.name.startsWith('Promise.all')
    ).map(t => t.name)])
    const redisMs = this._sumTimings(['REDIS GET', 'REDIS SET', 'REDIS_GET', 'REDIS_SET', 'CACHE_READ', 'CACHE_WRITE'])

    const level: 'INFO' | 'WARN' = totalMs > 3000 ? 'WARN' : 'INFO'

    const log: SummaryLog = {
      requestId: this.requestId,
      context: this.context,
      ...(this.method && { method: this.method }),
      ...(this.path && { path: this.path }),
      ...(this.statusCode !== undefined && { statusCode: this.statusCode }),
      ...(this.userId && { userId: this.userId }),
      ...(this.gymId && { gymId: this.gymId }),
      cacheHit: this.cacheHit,
      timings: this.timings,
      authMs,
      dbMs,
      redisMs,
      totalMs,
      payloadKb: this.payloadBytes ? parseFloat((this.payloadBytes / 1024).toFixed(2)) : 0,
      level,
      timestamp: new Date().toISOString(),
    }

    // Structured log — parseable by Vercel Log Drain / Datadog / Logtail
    console.log(`[METRICS] ${JSON.stringify(log)}`)

    // Push to Sentry as breadcrumb so it shows up in error context
    Sentry.addBreadcrumb({
      category: 'request',
      message: `${this.context} completed in ${totalMs}ms`,
      level: level === 'WARN' ? 'warning' : 'info',
      data: { requestId: this.requestId, totalMs, cacheHit: this.cacheHit },
    })
  }

  // ── Error reporting ─────────────────────────────────────────────────────────

  /**
   * Log a structured error and send to Sentry with the request ID attached.
   * Always call this instead of bare console.error() in route handlers.
   */
  error(contextMessage: string, error: unknown): void {
    const isError = error instanceof Error
    const message = isError ? error.message : String(error)
    const stack = isError ? error.stack : undefined

    const log: ErrorLog = {
      requestId: this.requestId,
      context: this.context,
      level: 'ERROR',
      message,
      ...(isError && { errorName: error.name }),
      // Only include stack in dev — stacks can leak file paths in production
      ...(process.env.NODE_ENV !== 'production' && stack && { stack }),
      ...(this.method && { method: this.method }),
      ...(this.path && { path: this.path }),
      ...(this.userId && { userId: this.userId }),
      ...(this.gymId && { gymId: this.gymId }),
      timestamp: new Date().toISOString(),
    }

    console.error(`[ERROR] ${JSON.stringify(log)}`)

    // Tag Sentry event with request ID so you can cross-reference logs ↔ Sentry issues
    Sentry.withScope(scope => {
      scope.setTag('request_id', this.requestId)
      scope.setTag('context', this.context)
      if (this.userId) scope.setUser({ id: this.userId })
      if (this.gymId) scope.setTag('gym_id', this.gymId)
      scope.setExtra('context_message', contextMessage)
      scope.setExtra('timings', this.timings)
      if (this.cacheHit !== null) scope.setTag('cache_hit', String(this.cacheHit))

      if (isError) {
        Sentry.captureException(error)
      } else {
        Sentry.captureMessage(`[${this.context}] ${contextMessage}: ${message}`, 'error')
      }
    })
  }

  /** Log a warning (slow query, unexpected state, degraded mode, etc.) */
  warn(message: string, data?: Record<string, unknown>): void {
    this._emit('WARN', message, data)

    Sentry.addBreadcrumb({
      category: 'warning',
      message: `[${this.context}] ${message}`,
      level: 'warning',
      data: { requestId: this.requestId, ...data },
    })
  }

  /** Log an informational message. */
  info(message: string, data?: Record<string, unknown>): void {
    this._emit('INFO', message, data)
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private _emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // In production only emit DEBUG lines if LOG_LEVEL=debug is set
    if (level === 'DEBUG' && process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL !== 'debug') {
      return
    }

    const entry = {
      requestId: this.requestId,
      context: this.context,
      level,
      message,
      ...data,
      timestamp: new Date().toISOString(),
    }

    if (level === 'ERROR') console.error(`[${level}] ${JSON.stringify(entry)}`)
    else if (level === 'WARN') console.warn(`[${level}] ${JSON.stringify(entry)}`)
    else console.log(`[${level}] ${JSON.stringify(entry)}`)
  }

  private _sumTimings(names: string[]): number {
    return this.timings
      .filter(t => names.includes(t.name))
      .reduce((sum, t) => sum + t.durationMs, 0)
  }
}

// ─── Convenience factory ──────────────────────────────────────────────────────

/**
 * Create a logger for a Server Component or Server Action (no request object).
 *   const log = logger('DASHBOARD_PAGE')
 */
export function logger(context: string): RequestLogger {
  return new RequestLogger(context)
}

/**
 * Create a logger for a Route Handler (has a request object, extracts method + path).
 *   const log = apiLogger('MEMBERS_API', req)
 */
export function apiLogger(context: string, req: NextRequest | Request): RequestLogger {
  return new RequestLogger(context, req)
}
