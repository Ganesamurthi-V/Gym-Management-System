import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isAllowedProxyRequest, isGraphProxySecretRequired } from '@/lib/graph-domain'

const read = (p: string) => readFileSync(p, 'utf8')

describe('graph proxy allowlist applies to every path length', () => {
  it('allows the calls services/whatsapp/graph.ts makes', () => {
    expect(isAllowedProxyRequest('POST', 'v21.0/1234567890/messages')).toBe(true)
    expect(isAllowedProxyRequest('POST', 'v21.0/1234567890/media')).toBe(true)
    expect(isAllowedProxyRequest('GET', 'v21.0/1234567890')).toBe(true)
    expect(isAllowedProxyRequest('DELETE', 'v21.0/1234567890')).toBe(true)
  })

  it('rejects short and non-allowlisted paths', () => {
    expect(isAllowedProxyRequest('GET', 'v21.0/me')).toBe(false)
    expect(isAllowedProxyRequest('GET', 'v21.0')).toBe(false)
    expect(isAllowedProxyRequest('GET', 'me')).toBe(false)
    expect(isAllowedProxyRequest('POST', 'v21.0/1234567890')).toBe(false)
    expect(isAllowedProxyRequest('GET', 'v21.0/1234/insights')).toBe(false)
  })
})

describe('graph proxy secret', () => {
  it('is required in production', () => {
    const original = process.env.NODE_ENV
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    expect(isGraphProxySecretRequired()).toBe(true)
    ;(process.env as Record<string, string>).NODE_ENV = 'test'
    expect(isGraphProxySecretRequired()).toBe(false)
    ;(process.env as Record<string, string>).NODE_ENV = original as string
  })

  it('route fails closed with 503 when the secret is missing in production', () => {
    const route = read('app/api/graph/[...path]/route.ts')
    expect(route).toMatch(/isGraphProxySecretRequired\(\)[\s\S]{0,400}503/)
  })
})

describe('owner WhatsApp routes take recipients from the database', () => {
  const files = [
    'app/api/whatsapp/send/route.ts',
    'app/api/whatsapp/automation/welcome/route.ts',
    'app/api/whatsapp/automation/renewal/route.ts',
    'app/api/whatsapp/automation/due-cleared/route.ts',
    'app/api/whatsapp/automation/import-batch/route.ts',
  ]
  for (const f of files) {
    it(`${f} uses withAuth with a rate limit`, () => {
      const src = read(f)
      expect(src).toContain('withAuth(')
      expect(src).toMatch(/rateLimit:\s*\d+/)
    })
  }

  it('request schemas no longer accept phone or name', () => {
    for (const f of files.slice(0, 4)) {
      const schema = /z\.object\(\{[\s\S]*?\n\}\)/.exec(read(f))![0]
      expect(schema).not.toMatch(/\bphone\s*:/)
      expect(schema).not.toMatch(/\bmemberName\s*:/)
      expect(schema).not.toMatch(/\bgymName\s*:/)
      expect(schema).not.toMatch(/\binvitationToken\s*:/)
    }
  })
})

describe('whatsapp webhook stores nothing for unsigned requests', () => {
  it('has no saveWebhookLog call in the invalid-signature branch', () => {
    const src = read('app/api/whatsapp/webhook/route.ts')
    const branch = src.slice(src.indexOf('if (!signatureValid)'), src.indexOf("log.info('Signature verified')"))
    expect(branch).not.toContain('saveWebhookLog')
  })
})
