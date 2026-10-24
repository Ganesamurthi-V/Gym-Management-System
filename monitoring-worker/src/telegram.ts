import type { AlertMessage } from './state'
import type { FetchFn } from './probe'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function formatMessage(m: AlertMessage, now: number): string {
  const tag = m.reminder ? `${m.level} (still down)` : m.level
  const lines = [`<b>[${escapeHtml(tag)}]</b> ${escapeHtml(m.name)}`]
  if (m.reason) lines.push(escapeHtml(m.reason))
  lines.push(new Date(now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
  return lines.join('\n')
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

/** One message for a whole run: used when many alerts fire at once or probes were skipped. */
export function formatSummary(messages: AlertMessage[], skipped: number, now: number, note?: string): string {
  const lines = [`<b>[GymFlow monitoring]</b> ${messages.length} alert(s)`]
  if (note) lines.push(escapeHtml(note))
  for (const m of messages) {
    const reason = m.reason.length > 80 ? m.reason.slice(0, 77) + '...' : m.reason
    const tag = m.reminder ? `${m.level}, still down` : m.level
    lines.push(`[${escapeHtml(tag)}] ${escapeHtml(m.name)}${reason ? ': ' + escapeHtml(reason) : ''}`)
  }
  if (skipped > 0) lines.push(`${skipped} probes skipped (subrequest budget)`)
  lines.push(new Date(now).toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
  return lines.join('\n').slice(0, 3500)
}
