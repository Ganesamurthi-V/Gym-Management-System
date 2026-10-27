import { describe, expect, it } from 'vitest'
import { safePushUrl } from '@/lib/push/url'

describe('safePushUrl', () => {
  it('keeps member paths', () => {
    expect(safePushUrl('/m/notifications')).toBe('/m/notifications')
    expect(safePushUrl('/m/progress/body?x=1#a')).toBe('/m/progress/body?x=1#a')
    expect(safePushUrl('/m')).toBe('/m')
  })

  it.each([
    'https://evil.com/m/home',
    '//evil.com/m/home',
    '/\\evil.com',
    '/m/\\..\\owner',
    'javascript:alert(1)',
    '/owner/dashboard',
    '/mx/home',
    '/m/../owner',
    '/m/%2e%2e/owner',
    '/m/%2E%2E/owner',
    '/m/%5Cevil',
    '/m/home\n',
    '/m/\u0000home',
    '',
    '/m/%',
    'm/home',
  ])('rejects %j', raw => {
    expect(safePushUrl(raw)).toBe('/m/home')
  })

  it('rejects non-strings and very long input', () => {
    expect(safePushUrl(undefined)).toBe('/m/home')
    expect(safePushUrl({})).toBe('/m/home')
    expect(safePushUrl('/m/' + 'a'.repeat(400))).toBe('/m/home')
  })
})
