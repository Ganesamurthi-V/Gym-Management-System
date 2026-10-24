// Everything the owner may want to edit lives here: URLs, expectations, criticality, thresholds.

export interface Expect {
  /** Exact status. Use statusMin/statusMax instead for a range. */
  status?: number
  statusMin?: number
  statusMax?: number
  /** Response body must contain this text. */
  bodyIncludes?: string
  /** Response body must be valid JSON (watchdog). */
  json?: boolean
}

export interface ProbeConfig {
  name: string
  url: string
  /** critical = alert after 1 failing run; otherwise after WARNING_FAILS consecutive failing runs. */
  critical: boolean
  /** Send the x-health-secret header (secret HEALTH_CHECK_SECRET). */
  healthSecret?: boolean
  expect: Expect
}

const APP = 'https://app.gymflow.sbs'
const WWW = 'https://www.gymflow.sbs'

export const PROBES: ProbeConfig[] = [
  { name: 'www-site', url: `${WWW}/`, critical: true, expect: { status: 200, bodyIncludes: 'GymFlow' } },
  { name: 'www-sitemap', url: `${WWW}/sitemap.xml`, critical: false, expect: { status: 200 } },
  { name: 'app-login-page', url: `${APP}/auth/login`, critical: true, expect: { status: 200 } },
  { name: 'api-health', url: `${APP}/api/health`, critical: true, expect: { status: 200, bodyIncludes: '"status":"healthy"' } },
  { name: 'api-health-deep', url: `${APP}/api/health/deep`, critical: true, healthSecret: true, expect: { status: 200 } },
  // The app raises its own Telegram alerts from the watchdog; the Worker only needs the call itself to work.
  { name: 'api-watchdog', url: `${APP}/api/health/watchdog`, critical: true, healthSecret: true, expect: { status: 200, json: true } },
  // Auth guards: without a cookie these must answer 401 (200 = guard open, 500 = broken).
  { name: 'guard-members', url: `${APP}/api/members`, critical: true, expect: { status: 401 } },
  { name: 'guard-payments', url: `${APP}/api/payments`, critical: true, expect: { status: 401 } },
  { name: 'guard-expiring', url: `${APP}/api/dashboard/expiring`, critical: true, expect: { status: 401 } },
  { name: 'graph-proxy', url: 'https://graph.gymflow.sbs/api/health', critical: false, expect: { status: 200 } },
  { name: 'status-page', url: 'https://status.gymflow.sbs', critical: false, expect: { statusMin: 200, statusMax: 399 } },
]

export const TIMEOUT_MS = 8000
export const RETRY_DELAY_MS = 2000
/** Consecutive failing runs (5 min apart) before a non-critical probe alerts. */
export const WARNING_FAILS = 2
export const REMINDER_MS = 60 * 60 * 1000
/** Refresh the "last run" stamp in KV at most this often (keeps KV writes low). */
export const LAST_RUN_REFRESH_MS = 60 * 60 * 1000

export const CANARY_ENABLED = false
export const CANARY_BASE = APP
/** Login rate limits are 10/min per IP and 5 per 5 min per email; one login per 15 min is far below both. */
export const CANARY_MIN_INTERVAL_MS = 14 * 60 * 1000

/** Cloudflare free plan allows 50 subrequests per invocation; stay below it. */
export const MAX_SUBREQUESTS = 45
/** Probe retries are skipped once this many subrequests are used. */
export const RETRY_CUTOFF = 30
/** More alerts than this in one run are sent as a single summary message. */
export const MAX_INDIVIDUAL_ALERTS = 2

/** An issue open this long goes into the 6-hourly digest, sent at most once per DIGEST_EVERY_MS. */
export const LONG_OPEN_MS = 6 * 60 * 60 * 1000
export const DIGEST_EVERY_MS = 6 * 60 * 60 * 1000
