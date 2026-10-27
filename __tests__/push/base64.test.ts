import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from '@/lib/push/client'

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "hello?>" -> aGVsbG8_Pg in base64url
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8_Pg'))).toEqual([104, 101, 108, 108, 111, 63, 62])
  })
})
