import { describe, it, expect } from 'vitest'
import {
  buildTelegramText,
  buildNotificationBody,
  buildSystemText,
  formatIstUtc,
  createAlerter,
  type AlertInput,
} from '@/lib/monitoring/alert'
import { getAlertGuide, GENERIC_GUIDE } from '@/lib/monitoring/alertGuides'

// 24 Oct 2026, 16:42 UTC = 10:12 PM IST
const NOW = Date.UTC(2026, 9, 24, 16, 42, 0)
const base: AlertInput = { key: 'wa:token_invalid', severity: 'critical', title: 'Token bad', body: 'Meta said 190' }

describe('buildTelegramText', () => {
  it('has every section in order', () => {
    const t = buildTelegramText(base, 'production', NOW)
    const order = ['CRITICAL: Token bad', 'What is happening', 'What is failing', 'Details', 'What to check', 'How to fix', 'Links', '<code>wa:token_invalid</code>']
    let last = -1
    for (const h of order) {
      const i = t.indexOf(h)
      expect(i, `missing or out of order: ${h}`).toBeGreaterThan(last)
      last = i
    }
    expect(t).toContain('1. ')
  })

  it('uses one symbol per severity and a drill symbol', () => {
    expect(buildTelegramText(base, 'p', NOW).startsWith('\u{1F534}')).toBe(true)
    expect(buildTelegramText({ ...base, severity: 'warning' }, 'p', NOW).startsWith('\u{1F7E1}')).toBe(true)
    const drill = buildTelegramText({ ...base, key: 'drill:redis_down', title: '[DRILL] Redis' }, 'p', NOW)
    expect(drill.startsWith('\u{1F535}')).toBe(true)
    expect(drill).toContain('TEST alert')
  })

  it('shows IST and UTC correctly', () => {
    expect(formatIstUtc(NOW)).toBe('24 Oct 2026, 10:12 PM IST (16:42 UTC)')
    expect(buildTelegramText(base, 'production', NOW)).toContain('24 Oct 2026, 10:12 PM IST (16:42 UTC)')
    expect(formatIstUtc(Date.UTC(2026, 11, 31, 18, 30))).toBe('1 Jan 2027, 12:00 AM IST (18:30 UTC)')
  })

  it('muting hint follows the cooldown', () => {
    expect(buildTelegramText(base, 'p', NOW)).toContain('Repeats are muted for 30 min')
    expect(buildTelegramText({ ...base, severity: 'warning' }, 'p', NOW)).toContain('Repeats are muted for 6 h')
    expect(buildTelegramText({ ...base, cooldownSeconds: 600 }, 'p', NOW)).toContain('muted for 10 min')
  })

  it('escapes HTML in title, body and key', () => {
    const t = buildTelegramText({ key: 'k<&>', severity: 'warning', title: 'a<b>&', body: '<i>x</i> & y' }, 'p', NOW)
    expect(t).toContain('a&lt;b&gt;&amp;')
    expect(t).toContain('&lt;i&gt;x&lt;/i&gt; &amp; y')
    expect(t).toContain('<code>k&lt;&amp;&gt;</code>')
    expect(t).not.toContain('<i>x</i>')
  })

  it('truncates details first and keeps How to fix under 4096', () => {
    const t = buildTelegramText({ ...base, body: 'z'.repeat(100000), gymId: 'g1' }, 'p', NOW)
    expect(t.length).toBeLessThanOrEqual(4096)
    expect(t).toContain('How to fix')
    for (const step of getAlertGuide(base.key).fix) expect(t).toContain(step.replace(/&/g, '&amp;'))
  })

  it('shows the gym id in details only when given', () => {
    expect(buildTelegramText({ ...base, gymId: 'gym-77' }, 'p', NOW)).toContain('gym: gym-77')
    expect(buildTelegramText(base, 'p', NOW)).not.toContain('gym:')
  })

  it('omits Details when the body is empty', () => {
    expect(buildTelegramText({ ...base, body: '' }, 'p', NOW)).not.toContain('<b>Details</b>')
  })

  it('unknown keys use the generic guide', () => {
    expect(getAlertGuide('totally:unknown')).toBe(GENERIC_GUIDE)
    expect(buildTelegramText({ ...base, key: 'totally:unknown' }, 'p', NOW)).toContain(GENERIC_GUIDE.happening)
  })
})

describe('system and notification text', () => {
  it('cap notice is short and uses the same look', () => {
    const t = buildSystemText('Alert cap reached', 'alert cap reached, 3 suppressed', 'production', NOW)
    expect(t).toContain('WARNING: Alert cap reached')
    expect(t).toContain('IST')
    expect(t.length).toBeLessThan(400)
  })

  it('notification body is compact and ends with the first step', () => {
    const b = buildNotificationBody({ ...base, body: 'q'.repeat(2000) })
    expect(b.length).toBeLessThanOrEqual(400)
    expect(b.split('\n').pop()).toBe(`First step: ${getAlertGuide(base.key).check[0]}`)
  })
})

describe('alerter integration', () => {
  it('scrubs PII in details and stores the compact body', async () => {
    const sent: string[] = []
    const rows: Record<string, unknown>[] = []
    const alerter = createAlerter({
      redis: null,
      fetch: (async (_u: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body).text)
        return { ok: true, status: 200 }
      }) as unknown as typeof fetch,
      supabase: () => ({ from: () => ({ insert: async (r: Record<string, unknown>) => { rows.push(r); return { error: null } } }) }),
      now: () => NOW,
      env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', NODE_ENV: 'production' },
    })
    await alerter.report({ ...base, body: 'phone 9876543210 mail a@b.co' })
    expect(sent[0]).toContain('[number]')
    expect(sent[0]).toContain('[email]')
    expect(sent[0]).not.toContain('9876543210')
    expect(String(rows[0].body)).toContain('First step:')
    expect(String(rows[0].body)).not.toContain('9876543210')
  })
})
