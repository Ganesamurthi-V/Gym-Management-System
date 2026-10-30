import { describe, expect, it } from 'vitest'
import { isLocalAppUrl } from '@/lib/push/localUrl'

describe('isLocalAppUrl', () => {
  it('treats dev machines as local, so the job is sent inline instead of via QStash', () => {
    for (const u of ['http://localhost:3004', 'http://127.0.0.1:3004', 'http://192.168.1.20:3004', 'http://10.0.0.5:3004', 'http://172.20.1.1:3004', 'http://my-pc.local:3004']) {
      expect(isLocalAppUrl(u)).toBe(true)
    }
  })
  it('treats real hosts and missing or invalid URLs as not local', () => {
    for (const u of ['https://app.gymflow.sbs', 'https://172.15.0.1', undefined, 'not a url']) {
      expect(isLocalAppUrl(u)).toBe(false)
    }
  })
})
