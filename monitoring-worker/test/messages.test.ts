import { describe, it, expect } from 'vitest'
import { PROBES } from '../src/config'
import { getProbeGuide, hasGuide } from '../src/guides'
import { formatMessage, formatSummary, formatTime, escapeHtml } from '../src/telegram'
import type { AlertMessage } from '../src/state'

const NOW = Date.UTC(2026, 9, 24, 16, 42)
const MIN = 60_000

const alert = (name: string, over: Partial<AlertMessage> = {}): AlertMessage => ({
  level: 'CRITICAL',
  name,
  reason: 'status 500, expected 200',
  reminder: false,
  kind: 'status',
  status: 500,
  since: NOW - 10 * MIN,
  ...over,
})

describe('guides', () => {
  it('every configured probe has a guide, and so do the canary steps', () => {
    for (const p of PROBES) expect(hasGuide(p.name), `missing guide for ${p.name}`).toBe(true)
    for (const n of ['canary:login', 'canary:read', 'canary:logout']) expect(hasGuide(n)).toBe(true)
  })

  it('every guide has all fields, in every failure variant', () => {
    const names = [...PROBES.map((p) => p.name), 'canary:login', 'canary:read', 'canary:logout']
    const fails = [
      { kind: 'status' as const, status: 404 }, { kind: 'status' as const, status: 500 }, { kind: 'status' as const, status: 401 },
      { kind: 'status' as const, status: 200 }, { kind: 'timeout' as const }, { kind: 'network' as const },
      { kind: 'keyword' as const }, { kind: 'config' as const }, { kind: 'canary' as const, status: 429 },
    ]
    for (const n of names) for (const f of fails) {
      const g = getProbeGuide(n, f)
      expect(g.happening.length).toBeGreaterThan(10)
      expect(g.failing.length).toBeGreaterThan(5)
      expect(g.check.length).toBeGreaterThan(0)
      expect(g.fix.length).toBeGreaterThan(0)
    }
  })

  it('picks the right variant per failure kind', () => {
    expect(getProbeGuide('app-login-page', { kind: 'status', status: 404 }).happening).toMatch(/not found|404/i)
    expect(getProbeGuide('app-login-page', { kind: 'status', status: 502 }).happening).toMatch(/server error|5xx/i)
    expect(getProbeGuide('api-watchdog', { kind: 'status', status: 401 }).happening).toMatch(/HEALTH_CHECK_SECRET/)
    expect(getProbeGuide('api-health-deep', { kind: 'status', status: 503 }).happening).toMatch(/unconfigured/)
    expect(getProbeGuide('app-login-page', { kind: 'timeout' }).happening).toMatch(/8 seconds/)
    expect(getProbeGuide('www-site', { kind: 'keyword' }).happening).toMatch(/GymFlow/)
    expect(getProbeGuide('guard-members', { kind: 'status', status: 200 }).happening).toMatch(/URGENT/)
    expect(getProbeGuide('guard-members', { kind: 'status', status: 500 }).happening).toMatch(/guard crashed/)
    expect(getProbeGuide('canary:login', { kind: 'canary', status: 429 }).happening).toMatch(/too many/i)
    expect(getProbeGuide('canary:login', { kind: 'canary', status: 401 }).happening).toMatch(/credentials/)
  })
})

describe('message formatting', () => {
  it('formats IST and UTC for a fixed clock', () => {
    expect(formatTime(NOW)).toBe('24 Oct 2026, 10:12 PM IST (16:42 UTC)')
    expect(formatTime(Date.UTC(2026, 9, 24, 6, 30))).toBe('24 Oct 2026, 12:00 PM IST (06:30 UTC)')
  })

  it('renders sections, severity symbol, observed result and reminder cadence', () => {
    const t = formatMessage(alert('api-watchdog', { status: 401, reason: 'status 401, expected 200' }), NOW)
    expect(t).toContain('\u{1F534} <b>[CRITICAL]</b> api-watchdog')
    for (const h of ['What is happening', 'What is failing', 'What to check', 'How to fix']) expect(t).toContain(`<b>${h}</b>`)
    expect(t).toContain('Observed: status 401, expected 200.')
    expect(t).toContain('Failing since 24 Oct 2026, 10:02 PM IST')
    expect(t).toContain('Next reminder in 60 min')
    expect(t).toContain('24 Oct 2026, 10:12 PM IST (16:42 UTC)')
    expect(formatMessage(alert('graph-proxy', { level: 'WARNING' }), NOW)).toContain('\u{1F7E1} <b>[WARNING]</b>')
  })

  it('escapes HTML in dynamic values and in guide text', () => {
    const t = formatMessage(alert('x<script>', { reason: '<b>bad</b> & "q"' }), NOW)
    expect(t).not.toContain('<script>')
    expect(t).toContain('&lt;b&gt;bad&lt;/b&gt; &amp;')
    expect(t).toContain('Vercel dashboard &gt; ')
    expect(escapeHtml('a<b')).toBe('a&lt;b')
  })

  it('stays under 4096 characters and keeps the fix section', () => {
    const t = formatMessage(alert('app-login-page', { reason: 'x'.repeat(5000) }), NOW)
    expect(t.length).toBeLessThanOrEqual(4096)
    expect(t).toContain('<b>How to fix</b>')
    const s = formatSummary(Array.from({ length: 60 }, (_, i) => alert(`probe-${i}`, { reason: 'y'.repeat(300) })), 0, NOW)
    expect(s.length).toBeLessThanOrEqual(4096)
  })

  it('recovered message shows downtime and needs no action', () => {
    const t = formatMessage({ level: 'RECOVERED', name: 'api-health', reason: 'status 500', reminder: false, since: NOW - 95 * MIN }, NOW)
    expect(t).toContain('\u{1F7E2} <b>[RECOVERED]</b> api-health')
    expect(t).toContain('down for about 1 h 35 min')
    expect(t).toContain('No action needed.')
    expect(formatMessage({ level: 'RECOVERED', name: 'api-health', reason: '', reminder: false }, NOW)).toContain('down for unknown')
  })

  it('mass-outage summary groups the shared app cause once', () => {
    const names = ['app-login-page', 'api-health', 'api-health-deep', 'api-watchdog', 'guard-members']
    const s = formatSummary([...names.map((n) => alert(n)), alert('graph-proxy', { level: 'WARNING', status: 404 })], 0, NOW)
    expect(s).toContain('Likely shared cause')
    expect(s).toContain('5 checks on app.gymflow.sbs fail the same way')
    expect(s.match(/Vercel dashboard &gt; your project &gt; Logs/g)!.length).toBeLessThanOrEqual(2)
    expect(s).toContain('<b>First step per check</b>')
    expect(s).toContain('- graph-proxy:')
    expect(s).not.toContain('- api-health:')
    expect(s).not.toContain('skipped')
  })

  it('summary lists skipped work and recovered probes', () => {
    const s = formatSummary([alert('www-sitemap', { level: 'WARNING' }), { level: 'RECOVERED', name: 'status-page', reason: '', reminder: false, since: NOW - 30 * MIN }], 3, NOW)
    expect(s).toContain('3 probes skipped (subrequest budget)')
    expect(s).toContain('status-page, down about 30 min')
  })

  it('never contains secrets, tokens or header values', () => {
    const all = [
      ...PROBES.map((p) => formatMessage(alert(p.name), NOW)),
      formatMessage(alert('api-health-deep', { status: 401, reason: 'status 401, expected 200' }), NOW),
      formatSummary(PROBES.map((p) => alert(p.name)), 0, NOW),
    ].join('\n')
    expect(all).not.toMatch(/x-health-secret|bot\d|api\.telegram\.org|https?:\/\/[^\s]*\?/i)
  })
})
