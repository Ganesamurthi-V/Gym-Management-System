import { describe, it, expect } from 'vitest'
import { isAllowedPushEndpoint, pushSubscriptionSchema } from '@/lib/push/validate'

describe('isAllowedPushEndpoint', () => {
  const ok = [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://api.push.apple.com/3/device/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=x',
    'https://fcm.googleapis.com:443/fcm/send/abc',
    'https://FCM.GOOGLEAPIS.COM/fcm/send/abc',
  ]
  for (const u of ok) it(`allows ${u}`, () => expect(isAllowedPushEndpoint(u)).toBe(true))

  const bad = [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/?fcm.googleapis.com',
    'https://evil.com/fcm.googleapis.com',
    'https://fcm.googleapis.com@evil.com/x',
    'https://user:pw@fcm.googleapis.com/x',
    'https://evilfcm.googleapis.com/x',
    'https://evil.com#@fcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/x',
    'https://2130706433/x',
    'https://fcm.googleapis.com./x',
    'https://fcm.googleapis.com:8443/x',
    'https://.push.apple.com/x',
    'https://push.apple.com/x',
    'https://evilpush.apple.com/x',
    'https://notify.windows.com/x',
    'https://x.notify.windows.com.evil.com/x',
    'ftp://fcm.googleapis.com/x',
    'javascript:alert(1)',
    '//fcm.googleapis.com/x',
    '',
    'https://fcm.googleapis.com/' + 'a'.repeat(600),
  ]
  for (const u of bad) it(`refuses ${u.slice(0, 60) || '(empty)'}`, () => expect(isAllowedPushEndpoint(u)).toBe(false))

  it('refuses non-strings', () => {
    expect(isAllowedPushEndpoint(undefined)).toBe(false)
    expect(isAllowedPushEndpoint(42)).toBe(false)
  })
})

describe('pushSubscriptionSchema', () => {
  const base = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BNc-abc_123=', auth: 'abc-DEF_12' } }
  it('accepts a normal subscription and trims the user agent', () => {
    const r = pushSubscriptionSchema.safeParse({ ...base, userAgent: '  Chrome  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.userAgent).toBe('Chrome')
  })
  it('rejects a bad endpoint, bad keys and a long user agent', () => {
    expect(pushSubscriptionSchema.safeParse({ ...base, endpoint: 'https://evil.com/x' }).success).toBe(false)
    expect(pushSubscriptionSchema.safeParse({ ...base, keys: { p256dh: 'a b', auth: 'x' } }).success).toBe(false)
    expect(pushSubscriptionSchema.safeParse({ ...base, keys: { p256dh: 'a'.repeat(201), auth: 'x' } }).success).toBe(false)
    expect(pushSubscriptionSchema.safeParse({ ...base, userAgent: 'u'.repeat(301) }).success).toBe(false)
    expect(pushSubscriptionSchema.safeParse({ endpoint: base.endpoint }).success).toBe(false)
  })
})
