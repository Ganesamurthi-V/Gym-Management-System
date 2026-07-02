/**
 * Structured observability for GymFlow Admin Panel — logs, metrics, and traces.
 *
 * Every API route should create one RequestLogger at entry, .summary() before
 * returning, and .error() instead of bare console.error().
 *
 * Log format: JSON lines → searchable in Vercel Log Drain / any aggregator
 *
 * Usage:
 *   export async function POST(req: NextRequest) {
 *     const log = apiLogger('SUPPORT_POST', req)
 *     log.start('DB_QUERY')
 *     const data = await fetchSomething()
 *     log.end('DB_QUERY')
 *     log.summary(200)
 *     return NextResponse.json(data)
 *   }
 */

// No Node.js-only imports — this file is imported by middleware (Edge runtime).
// crypto.randomUUID() is a Web Crypto global available in Edge, Node.js, and browsers.
import { type NextRequest } from 'next/server'

// ─── Constants ────────────────────────────────────────────────────────────────

export const REQUEST_ID_HEADER = 'x-request-id'

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface TimingEntry {
  name: string
  durationMs: number
}

// ─── ID helpers ───────────────────────────────────────────────────────────────

export function generateRequestId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

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

  public method?: string
  public path?: string
  public statusCode?: number
  public adminAction?: string  // e.g. 'ban_gym', 'resolve_ticket', 'reset_password'

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

    this._emit('DEBUG', `→ ${this.context} START`)
  }

  // ── Timing ──────────────────────────────────────────────────────────────────

  start(stepName: string): void {
    this.timingStarts[stepName] = performance.now()
  }

  end(stepName: string): void {
    const t = this.timingStarts[stepName]
    if (t === undefined) return
    this.timings.push({ name: stepName, durationMs: Math.round(performance.now() - t) })
    delete this.timingStarts[stepName]
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  summary(statusCode?: number): void {
    if (statusCode !== undefined) this.statusCode = statusCode

    const totalMs = Math.round(performance.now() - this.startedAt)
    const level: 'INFO' | 'WARN' = totalMs > 2000 ? 'WARN' : 'INFO'

    const log = {
      requestId: this.requestId,
      context: this.context,
      app: 'gymflow-admin',
      ...(this.method && { method: this.method }),
      ...(this.path && { path: this.path }),
      ...(this.statusCode !== undefined && { statusCode: this.statusCode }),
      ...(this.adminAction && { adminAction: this.adminAction }),
      timings: this.timings,
      totalMs,
      level,
      timestamp: new Date().toISOString(),
    }

    console.log(`[METRICS] ${JSON.stringify(log)}`)
  }

  // ── Error ───────────────────────────────────────────────────────────────────

  error(contextMessage: string, error: unknown): void {
    const isError = error instanceof Error
    const message = isError ? error.message : String(error)

    const log = {
      requestId: this.requestId,
      context: this.context,
      app: 'gymflow-admin',
      level: 'ERROR' as const,
      message,
      ...(isError && { errorName: error.name }),
      ...(process.env.NODE_ENV !== 'production' && isError && { stack: error.stack }),
      ...(this.method && { method: this.method }),
      ...(this.path && { path: this.path }),
      ...(this.adminAction && { adminAction: this.adminAction }),
      contextMessage,
      timestamp: new Date().toISOString(),
    }

    console.error(`[ERROR] ${JSON.stringify(log)}`)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this._emit('WARN', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this._emit('INFO', message, data)
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (level === 'DEBUG' && process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL !== 'debug') {
      return
    }

    const entry = {
      requestId: this.requestId,
      context: this.context,
      app: 'gymflow-admin',
      level,
      message,
      ...data,
      timestamp: new Date().toISOString(),
    }

    if (level === 'ERROR') console.error(`[${level}] ${JSON.stringify(entry)}`)
    else if (level === 'WARN') console.warn(`[${level}] ${JSON.stringify(entry)}`)
    else console.log(`[${level}] ${JSON.stringify(entry)}`)
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function apiLogger(context: string, req: NextRequest | Request): RequestLogger {
  return new RequestLogger(context, req)
}
