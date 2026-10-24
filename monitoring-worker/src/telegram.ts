import type { AlertMessage } from './state'
import { REMINDER_MS } from './config'
import { getProbeGuide, variantOf, type Failure, type Guide } from './guides'
import type { FetchFn } from './probe'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IST_OFFSET_MS = 5.5 * 3600_000
const TELEGRAM_LIMIT = 4096
const SAFE_LIMIT = 4000
const pad = (n: number) => String(n).padStart(2, '0')

/** e.g. "24 Oct 2026, 10:12 PM IST (16:42 UTC)" */
export function formatTime(ms: number): string {
  const u = new Date(ms)
  const i = new Date(ms + IST_OFFSET_MS)
  const h = i.getUTCHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return (
    `${i.getUTCDate()} ${MONTHS[i.getUTCMonth()]} ${i.getUTCFullYear()}, ${h12}:${pad(i.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'} IST ` +
    `(${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())} UTC)`
  )
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'under a minute'
  if (min < 60) return `about ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `about ${h} h` : `about ${h} h ${m} min`
}

// Severity symbols are the only emojis: this is a chat ops message, not product UI.
const SYMBOL = { CRITICAL: '\u{1F534}', WARNING: '\u{1F7E1}', RECOVERED: '\u{1F7E2}' } as const

const failureOf = (m: AlertMessage): Failure => ({ kind: m.kind ?? 'status', status: m.status })
const list = (items: string[]) => items.map((t, i) => `${i + 1}. ${escapeHtml(t)}`).join('\n')

function sinceLine(m: AlertMessage, now: number): string {
  if (m.since === undefined) return ''
  const age = now - m.since
  if (age < 60_000) return ' It just started failing.'
  return ` Failing since ${formatTime(m.since)} (${formatDuration(age)}).`
}

function recoveredBody(m: AlertMessage, now: number): string {
  const label = getProbeGuide(m.name, { kind: 'status' }).label
  const down = m.since === undefined ? 'unknown' : formatDuration(now - m.since)
  return `${escapeHtml(label)} is working again.\nIt was down for ${escapeHtml(down)}.\nNo action needed.`
}

export function formatMessage(m: AlertMessage, now: number, open: OpenIssue[] = []): string {
  if (m.level === 'RECOVERED') {
    return [`${SYMBOL.RECOVERED} <b>[RECOVERED]</b> ${escapeHtml(m.name)}`, '', recoveredBody(m, now), '', `<i>${formatTime(now)}</i>`].join('\n')
  }
  const g: Guide = getProbeGuide(m.name, failureOf(m))
  const tag = m.reminder ? `${m.level}, still down` : m.level
  const footer = openFooter(open.filter((o) => o.name !== m.name), now)
  const observed = `Observed: ${m.reason || 'no detail'}.${sinceLine(m, now)}`
  const build = (checkN: number, textMax: number) => {
    const cut = (t: string) => (t.length > textMax ? t.slice(0, textMax - 3) + '...' : t)
    return [
      `${SYMBOL[m.level]} <b>[${escapeHtml(tag)}]</b> ${escapeHtml(m.name)}`,
      '',
      '<b>What is happening</b>',
      escapeHtml(cut(g.happening)),
      '',
      '<b>What is failing</b>',
      escapeHtml(cut(g.failing)),
      escapeHtml(cut(observed)),
      '',
      '<b>What to check</b>',
      list(g.check.slice(0, checkN)),
      '',
      '<b>How to fix</b>',
      list(g.fix),
      '',
      ...(footer ? [footer] : []),
      `<i>${formatTime(now)}</i>`,
      `Next reminder in ${REMINDER_MS / 60_000} min while this stays down.`,
    ].join('\n')
  }
  // Under the cap, shrink the "check" list and the descriptive text first; the fix steps are kept whole.
  for (const [checkN, textMax] of [[99, 600], [3, 300], [2, 200], [1, 120]] as const) {
    const out = build(checkN, textMax)
    if (out.length <= SAFE_LIMIT) return out
  }
  return build(1, 120).slice(0, TELEGRAM_LIMIT)
}


/** A probe that is currently alerted (from stored state only). */
export interface OpenIssue {
  name: string
  since: number
}

function shortDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  return min % 60 === 0 ? `${h}h` : `${h}h ${min % 60}m`
}

/** "Still open: a (2h 5m), b (45m) +1 more", max about 300 characters; empty string when nothing is open. */
export function openFooter(open: OpenIssue[], now: number): string {
  if (open.length === 0) return ''
  const sorted = [...open].sort((a, b) => a.since - b.since)
  const parts: string[] = []
  let len = 'Still open: '.length
  for (const o of sorted) {
    const item = `${o.name} (${shortDuration(now - o.since)})`
    if (len + item.length + 2 > 270 && parts.length > 0) break
    parts.push(item)
    len += item.length + 2
  }
  const more = sorted.length - parts.length
  return `Still open: ${parts.map(escapeHtml).join(', ')}${more > 0 ? ` +${more} more` : ''}`
}

/** Rebuilds a Failure from a stored reason string (state keeps the reason, not the structured detail). */
function failureFromReason(name: string, reason: string): Failure {
  if (reason === 'timeout') return { kind: 'timeout' }
  if (reason === 'network error') return { kind: 'network' }
  if (reason.startsWith('keyword') || reason === 'response is not JSON') return { kind: 'keyword' }
  if (reason.startsWith('HEALTH_CHECK_SECRET not set')) return { kind: 'config' }
  const status = Number(/(\d{3})/.exec(reason)?.[1]) || undefined
  return { kind: name.startsWith('canary:') ? 'canary' : 'status', status }
}

export interface LongOpenIssue extends OpenIssue {
  reason: string
}

/** The 6-hourly "still down" digest. */
export function formatDigest(issues: LongOpenIssue[], now: number): string {
  const sorted = [...issues].sort((a, b) => a.since - b.since)
  const build = (max: number) => {
    const out = [`${SYMBOL.CRITICAL} <b>[STILL DOWN]</b> ${issues.length} issue(s) open for 6 hours or more`, '']
    for (const i of sorted.slice(0, max)) {
      const step = getProbeGuide(i.name, failureFromReason(i.name, i.reason)).fix[0] ?? ''
      out.push(`<b>${escapeHtml(i.name)}</b>: down ${escapeHtml(formatDuration(now - i.since))}`, `First fix step: ${escapeHtml(step)}`, '')
    }
    if (sorted.length > max) out.push(`+${sorted.length - max} more`, '')
    out.push(`<i>${formatTime(now)}</i>`, 'Next digest in 6 h if these are still open.')
    return out.join('\n')
  }
  for (const max of [30, 15, 8, 4]) {
    const o = build(max)
    if (o.length <= SAFE_LIMIT) return o
  }
  return build(2).slice(0, TELEGRAM_LIMIT)
}

const SHARED_VARIANTS = new Set(['server', 'timeout', 'network', 'notfound'])
const isAppProbe = (n: string) => n.startsWith('app-') || n.startsWith('api-') || n.startsWith('guard-')

/** One message for a whole run: used when many alerts fire at once or probes were skipped. */
export function formatSummary(messages: AlertMessage[], skipped: number, now: number, note?: string, open: OpenIssue[] = []): string {
  const failing = messages.filter((m) => m.level !== 'RECOVERED')
  const recovered = messages.filter((m) => m.level === 'RECOVERED')
  const top = failing.some((m) => m.level === 'CRITICAL') ? 'CRITICAL' : failing.length ? 'WARNING' : 'RECOVERED'

  // Shared cause: 3 or more app.gymflow.sbs probes failing in the same way means the app as a whole is the problem.
  const appFails = failing.filter((m) => isAppProbe(m.name))
  const variants = new Set(appFails.map((m) => variantOf(failureOf(m))))
  const sharedVariant = appFails.length >= 3 && variants.size === 1 && SHARED_VARIANTS.has([...variants][0]) ? appFails[0] : null
  const listed = new Set(failing.map((m) => m.name))
  const footer = failing.length ? openFooter(open.filter((o) => !listed.has(o.name)), now) : ''
  const grouped = new Set(sharedVariant ? appFails.map((m) => m.name) : [])

  const build = (listMax: number, reasonMax: number, stepMax: number, sharedCheck: number) => {
    const cut = (t: string) => (t.length > reasonMax ? t.slice(0, reasonMax - 3) + '...' : t)
    const out: string[] = [
      `${SYMBOL[top]} <b>[${top === 'RECOVERED' ? 'RECOVERED' : 'ALERT'}]</b> GymFlow monitoring: ${failing.length} failing, ${recovered.length} recovered`,
    ]
    if (note) out.push(`<i>${escapeHtml(note)}</i>`)
    if (failing.length) {
      out.push('', '<b>Failing now</b>')
      for (const m of failing.slice(0, listMax)) out.push(`${SYMBOL[m.level]} ${escapeHtml(m.name)}: ${escapeHtml(cut(m.reason || 'no detail'))}`)
      if (failing.length > listMax) out.push(`+${failing.length - listMax} more`)
    }
    if (sharedVariant) {
      const g = getProbeGuide('app-login-page', failureOf(sharedVariant))
      out.push(
        '',
        '<b>Likely shared cause</b>',
        `${appFails.length} checks on app.gymflow.sbs fail the same way, so the whole app is probably affected, not each page separately.`,
        escapeHtml(g.happening),
        '',
        '<b>What to check (app level)</b>',
        list(g.check.slice(0, sharedCheck)),
        '',
        '<b>How to fix</b>',
        list(g.fix),
      )
    }
    const steps = failing.filter((m) => !grouped.has(m.name))
    if (steps.length) {
      out.push('', '<b>First step per check</b>')
      for (const m of steps.slice(0, stepMax)) out.push(`- ${escapeHtml(m.name)}: ${escapeHtml(cut(getProbeGuide(m.name, failureOf(m)).check[0] ?? ''))}`)
      if (steps.length > stepMax) out.push(`+${steps.length - stepMax} more`)
    }
    if (recovered.length) {
      out.push('', '<b>Recovered</b>')
      for (const m of recovered.slice(0, listMax)) {
        out.push(`${SYMBOL.RECOVERED} ${escapeHtml(m.name)}, down ${escapeHtml(m.since === undefined ? 'unknown' : formatDuration(now - m.since))}`)
      }
    }
    if (footer) out.push('', footer)
    if (skipped > 0) out.push('', `${skipped} probes skipped (subrequest budget)`)
    out.push('', `<i>${formatTime(now)}</i>`)
    if (failing.length) out.push(`Next reminder in ${REMINDER_MS / 60_000} min while these stay down.`)
    return out.join('\n')
  }
  for (const [lm, rm, sm, sc] of [[30, 90, 30, 4], [20, 60, 15, 3], [12, 40, 8, 2], [8, 30, 4, 1]] as const) {
    const o = build(lm, rm, sm, sc)
    if (o.length <= SAFE_LIMIT) return o
  }
  return build(5, 30, 2, 1).slice(0, TELEGRAM_LIMIT)
}

/** Never throws. Returns whether Telegram accepted the message. */
export async function sendTelegram(
  env: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string },
  text: string,
  fetchFn: FetchFn,
): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token || !env.TELEGRAM_CHAT_ID) {
    console.log('telegram: not configured')
    return false
  }
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      console.log(`telegram: send failed with status ${res.status}`)
      return false
    }
    return true
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).split(token).join('[redacted]')
    console.log(`telegram: send failed: ${msg}`)
    return false
  }
}
